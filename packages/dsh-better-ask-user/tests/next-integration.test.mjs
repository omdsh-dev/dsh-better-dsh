/** Real installed DSH lifecycle and Gateway wire; no replacement tool registry. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import * as betterAsk from '../src/index.js'

const hostRoot = process.env.DSH_PACKAGE_ROOT
const hostRequire = createRequire(hostRoot ? resolve(hostRoot, 'package.json') : import.meta.url)
const load = name => import(pathToFileURL(hostRequire.resolve(name)).href)

async function runtime(t) {
  const { Context } = await load('@deepseek-ai/cordis')
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  for (const name of ['dsh-session-projection', 'dsh-agent', 'dsh-system-prompt', 'dsh-tools', 'dsh-user-questions']) {
    const mod = await load('@deepseek-ai/' + name)
    await ctx.plugin(mod.default)
  }
  const native = await load('@deepseek-ai/dsh-tool-executor-native')
  await ctx.plugin(native)
  const official = await load('@deepseek-ai/dsh-tool-ask-user')
  await ctx.plugin(official)
  const config = { questionTimeoutSeconds: 5, timeoutBehavior: 'native', goalTimeoutBehavior: 'native' }
  // Invoke through a real Cordis fiber while preserving the live config object.
  await ctx.plugin({ inject: betterAsk.inject, apply: inner => betterAsk.apply(inner, config) })
  const { createScope } = await load('@deepseek-ai/dsh-scope')
  const { Session } = await load('@deepseek-ai/dsh-session')
  const agent = { id: 'ask-next', session: new Session('ask-next') }
  const scope = createScope(ctx, agent)
  agent.ctx = scope.ctx
  const unregister = ctx.agents.register(agent)
  await unregister
  t.after(() => scope.dispose())
  t.after(() => unregister())
  return { ctx, agent, config }
}

const args = { questions: [{ id: 'pick', question: 'Choose', options: [{ label: 'A' }, { label: 'B' }] }] }
const call = { type: 'tool-call', id: 'next-call', name: 'ask_user_question', arguments: JSON.stringify(args) }

test('next resolve → assemble → execute preserves admitted ask shadow and live config', { skip: !hostRoot }, async t => {
  const { ctx, agent, config } = await runtime(t)
  const signal = new AbortController().signal
  let request
  ctx.on('user-questions/request', async value => {
    request = value
    return { answers: [{ id: 'pick', selected: ['B'] }] }
  })
  const toolSet = await ctx.tools.resolve({ agent, signal })
  t.after(() => toolSet.dispose())
  const definition = ctx.tools.get('ask_user_question', agent, toolSet)
  const assembly = await ctx.systemPrompt.assemble({ scope: agent, toolSet })
  assert.equal(assembly.tools.filter(tool => tool.name === 'ask_user_question').length, 1)
  assert.equal(ctx.tools.executable('ask_user_question', agent, toolSet), definition)
  config.questionTimeoutSeconds = 7
  const result = await ctx.tools.execute({ calls: [call], agent, toolSet, signal })
  assert.equal(result.results[0].result.isError, false)
  assert.deepEqual(result.results[0].result.value, { answers: [{ id: 'pick', selected: ['B'] }] })
  assert.equal(request.better.waitMs, 7000)
  const empty = { view: () => new Map(), dispose() {} }
  assert.equal((await ctx.systemPrompt.assemble({ scope: agent, toolSet: empty })).tools.length, 0)
})

test('next Gateway wire preserves request.better and returned autoSelected', { skip: !hostRoot, timeout: 10000 }, async t => {
  const { ctx, agent, config } = await runtime(t)
  for (const name of ['dsh-typert-registry', 'dsh-api-remote-access', 'dsh-api-gateway']) {
    await ctx.plugin((await load('@deepseek-ai/' + name)).default)
  }
  await ctx.plugin(await load('@deepseek-ai/dsh-api-remotes'))
  const lifetime = new AbortController()
  t.after(() => lifetime.abort())
  const peer = { principal: { kind: 'owner' }, interactions: 'answer', signal: lifetime.signal }
  const stream = await ctx.typertGateway.wireStream.open('$events', { args: {} }, undefined, peer, lifetime.signal)
  const iterator = stream[Symbol.asyncIterator]()
  const ready = (await iterator.next()).value
  assert.equal(ready.type, 'ready')
  config.timeoutBehavior = 'default'
  const toolSet = await ctx.tools.resolve({ agent, signal: lifetime.signal })
  t.after(() => toolSet.dispose())
  await ctx.systemPrompt.assemble({ scope: agent, toolSet })
  const resultPromise = ctx.tools.execute({ calls: [call], agent, toolSet, signal: lifetime.signal })
  const frame = JSON.parse(JSON.stringify((await iterator.next()).value))
  assert.equal(frame.type, 'waterfall')
  assert.equal(frame.event, 'user-questions/request')
  assert.equal(frame.request.better.waitMs, 5000)
  assert.equal(frame.request.better.timeoutMode, 'default')
  assert.deepEqual(frame.request.better.defaultAnswer.answers, [{ id: 'pick', selected: ['A'] }])
  assert.equal(frame.request.better.defaultAnswer.autoSelected, true)
  const reply = await ctx.typertGateway.dispatchRpc('$events/result', JSON.parse(JSON.stringify({ args: {
    clientId: ready.clientId, eventId: frame.eventId,
    outcome: { kind: 'result', value: frame.request.better.defaultAnswer },
  } })), lifetime.signal, peer)
  assert.equal(reply.ok, true)
  const result = (await resultPromise).results[0].result
  assert.equal(result.isError, false)
  assert.equal(result.value.autoSelected, true)
  assert.match(result.value.warning, /not submitted by the user/)
  lifetime.abort()
  await iterator.return()
})

for (const decision of ['approval', 'feedback', 'cancel']) {
  test('next exit_plan_mode waits for explicit ' + decision + ' despite ordinary auto-selection settings', { skip: !hostRoot }, async t => {
    const { ctx, agent, config } = await runtime(t)
    const { build } = await import('esbuild')
    const compiled = await build({
      entryPoints: [new URL('../src/client/contract/slots.ts', import.meta.url).pathname],
      bundle: true, write: false, platform: 'node', format: 'cjs',
    })
    const module = { exports: {} }
    new Function('module', 'exports', compiled.outputFiles[0].text)(module, module.exports)
    const { PendingQuestion, createWaterfallRequest } = module.exports
    await ctx.plugin((await load('@deepseek-ai/dsh-plan-mode')).default, { section: 'Plan policy' })
    agent.session.append('plan/mode', { active: true })
    config.questionTimeoutSeconds = 1
    config.timeoutBehavior = 'default'
    const presented = Promise.withResolvers()
    ctx.on('user-questions/request', request => {
      assert.equal(request.better, undefined, 'ordinary question policy must not reach exit_plan_mode')
      const pending = new PendingQuestion(agent.id, request.questions, undefined, undefined, undefined, {
        waitMs: 1000, timeoutMode: 'default',
        defaultAnswer: { answers: [{ id: 'plan-review', selected: ['Approve'] }], autoSelected: true },
      })
      const waterfall = createWaterfallRequest(Date.now() + 1000, request.signal, channel => pending.detachWaterfall(channel))
      pending.attachWaterfall(waterfall.channel)
      presented.resolve(pending)
      return waterfall.result
    })
    const signal = new AbortController().signal
    const toolSet = await ctx.tools.resolve({ agent, signal })
    t.after(() => toolSet.dispose())
    assert.ok((await ctx.systemPrompt.assemble({ scope: agent, toolSet })).tools.some(tool => tool.name === 'exit_plan_mode'))
    const work = ctx.tools.execute({
      calls: [{ type: 'tool-call', id: 'exit-plan', name: 'exit_plan_mode', arguments: JSON.stringify({ plan: '# Safe plan' }) }],
      agent, signal, toolSet,
    })
    let settled = false
    void work.then(() => { settled = true })
    const pending = await presented.promise
    t.after(() => pending.close())
    assert.equal(pending.kind, 'plan-review')
    assert.equal(pending.snapshot().countdown, undefined)
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.now() })
    t.mock.timers.tick(60000)
    pending.timeout()
    pending.autoSelect()
    await Promise.resolve()
    assert.equal(settled, false)
    assert.equal(ctx.planMode.get(agent).active, true)
    if (decision === 'cancel') await pending.dismiss()
    else await pending.answer({ answers: [{ id: 'plan-review', selected: decision === 'approval' ? ['Approve'] : [],
      ...(decision === 'feedback' ? { custom: 'Add rollback steps' } : {}),
    }] })
    const result = (await work).results[0].result
    if (decision === 'feedback') {
      assert.equal(result.isError, true)
      assert.match(JSON.stringify(result), /Add rollback steps/)
      assert.equal(ctx.planMode.get(agent).active, true)
    } else {
      assert.equal(result.isError, false)
      assert.deepEqual(result.value, { approved: decision === 'approval' })
    }
  })
}

test('next logged pending ask is continued by the real question projection and accepts a late reply', { skip: !hostRoot, timeout: 10000 }, async t => {
  const { ctx, agent, config } = await runtime(t)
  config.questionTimeoutSeconds = 1
  config.timeoutBehavior = 'native'
  const signal = new AbortController().signal
  const toolSet = await ctx.tools.resolve({ agent, signal })
  t.after(() => toolSet.dispose())
  const assembly = await ctx.systemPrompt.assemble({ scope: agent, toolSet })
  agent.session.append('request/header', { turn: 0, step: 0, reason: 'initial', header: { config: {}, tools: assembly.tools } })
  const result = (await ctx.tools.execute({ calls: [call], agent, toolSet, signal, log: { turn: 0, step: 0 } })).results[0].result
  assert.equal(result.isError, false)
  assert.equal(result.value.pending, true)
  // snapshot performs the actual registered projection's replay of logged schemas/calls/results.
  const view = () => ctx.sessionProjections.snapshot(agent.session, ['userQuestions']).values.userQuestions
  assert.deepEqual(view().active.map(question => [question.callId, question.state]), [[call.id, 'continued']])
  const accepted = []
  agent.inbox = { nextTurn: [], nextStep: [] }
  agent.steer = message => { accepted.push(message) }
  const answer = { answers: [{ id: 'pick', selected: ['B'] }] }
  assert.equal(ctx.userQuestions.answer(agent, call.id, answer), true)
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].source.kind, 'user-question-reply')
  // Admission into the next turn is an agent-loop boundary; the real public answer API above owns queueing.
  agent.session.append('user/message', accepted[0], { surfaceOp: 'append' })
  assert.deepEqual(view().active, [])
  assert.deepEqual(view().settled, [{ callId: call.id, answers: answer.answers }])
  assert.equal(ctx.userQuestions.answer(agent, call.id, answer), false)
})
