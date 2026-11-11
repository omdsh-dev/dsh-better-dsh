/**
 * Child exit guard tests: running-child detection, steer injection, switch,
 * interrupt pass-through and fail-open. The guard is child-only: it must never
 * look at background jobs (that remains Apollo's job/general guard).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChildGuardMessage,
  collectRunningChildren,
  installChildExitGuard,
  name,
} from '../src/child-exit-guard.js'

let liveConfig = {}

/** Fake the same profile-backed live config used by the real guard. */
function makeCtx({ children = [], agentStatus = new Map(), onSteer } = {}) {
  const handlers = new Map()
  const warnings = []
  const ctx = {
    handlers,
    warnings,
    on: (event, fn) => { handlers.set(event, fn); return () => {} },
    subagents: { listChildren: async () => children },
    agents: { get: (id) => agentStatus.get(id) },
    get: (serviceName) => serviceName === 'configEditor'
      ? { entries: () => [{ options: { id: 'dsh-better-subagent' }, fiber: { config: liveConfig } }] }
      : undefined,
    logger: { warn: (text) => warnings.push(text) },
  }
  installChildExitGuard(ctx)
  ctx.onSteer = onSteer
  return ctx
}

/** Fire one turn-stopping and return the steered messages. */
async function fireTurnStopping(ctx, agent, { aborted = false, steerThrows = false } = {}) {
  const steered = []
  agent.steer = (message) => {
    if (steerThrows) throw new Error('steer boom')
    steered.push(message)
  }
  const handler = ctx.handlers.get('agent/turn-stopping')
  assert.equal(typeof handler, 'function', 'installChildExitGuard must register agent/turn-stopping')
  await handler({ agent, turn: 1, signal: { aborted } })
  return steered
}

/** Change the live configuration without reloading the guard. */
function withConfig(content, run) {
  const previous = liveConfig
  liveConfig = content === undefined ? {} : JSON.parse(content)
  return Promise.resolve().then(run).finally(() => { liveConfig = previous })
}

const PARENT = { id: 'parent-1' }
const ENABLED = '{"childExitGuard": true}'

test('plugin contract: name', () => {
  assert.equal(name, 'better-subagent-child-exit-guard')
})

test('running direct child → one steer notice with id, label and wait guidance', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx({
      children: [{ id: 'child-1', meta: { label: '探索仓库' } }, { id: 'child-2', meta: {} }],
      agentStatus: new Map([['child-1', { status: 'running' }], ['child-2', { status: 'idle' }]]),
    })
    const steered = await fireTurnStopping(ctx, { ...PARENT })
    assert.equal(steered.length, 1)
    const [message] = steered
    assert.equal(message.role, 'user')
    assert.equal(message.source.kind, 'better-subagent-child-exit-guard')
    assert.equal(Object.hasOwn(message.source, 'plugin'), false)
    assert.equal(typeof message.id, 'string')
    const text = message.content[0].text
    assert.match(text, /child-1/)
    assert.match(text, /探索仓库/)
    assert.doesNotMatch(text, /child-2/)
    assert.match(text, /wait_subagent/)
    assert.match(text, /send_message/)
    // Child-only guard: no background-job instructions.
    assert.doesNotMatch(text, /job_output|job_kill|background job/)
  })
})

test('all children idle → no steer', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx({
      children: [{ id: 'child-1', meta: {} }],
      agentStatus: new Map([['child-1', { status: 'idle' }]]),
    })
    assert.deepEqual(await fireTurnStopping(ctx, { ...PARENT }), [])
  })
})

test('new top-level labels and legacy meta.label are both displayed', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx({
      children: [
        { id: 'child-new', label: '新版标签', mode: 'continuable' },
        { id: 'child-old', meta: { label: '旧版标签', mode: 'continuable' } },
      ],
      agentStatus: new Map([['child-new', { status: 'running' }], ['child-old', { status: 'running' }]]),
    })
    const steered = await fireTurnStopping(ctx, { ...PARENT })
    assert.equal(steered.length, 1)
    const text = steered[0].content[0].text
    assert.match(text, /新版标签/)
    assert.match(text, /旧版标签/)
  })
})

test('cold child not present in the live registry → not intercepted', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx({ children: [{ id: 'child-cold', meta: {} }] })
    assert.deepEqual(await fireTurnStopping(ctx, { ...PARENT }), [])
  })
})

test('childExitGuard=false → no steer', async () => {
  await withConfig('{"childExitGuard": false}', async () => {
    const ctx = makeCtx({
      children: [{ id: 'child-1', meta: {} }],
      agentStatus: new Map([['child-1', { status: 'running' }]]),
    })
    assert.deepEqual(await fireTurnStopping(ctx, { ...PARENT }), [])
  })
})

test('missing config → default off, no steer', async () => {
  await withConfig(undefined, async () => {
    const ctx = makeCtx({
      children: [{ id: 'child-1', meta: {} }],
      agentStatus: new Map([['child-1', { status: 'running' }]]),
    })
    assert.deepEqual(await fireTurnStopping(ctx, { ...PARENT }), [])
  })
})

test('signal.aborted → no steer (user interrupt is the escape hatch)', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx({
      children: [{ id: 'child-1', meta: {} }],
      agentStatus: new Map([['child-1', { status: 'running' }]]),
    })
    assert.deepEqual(await fireTurnStopping(ctx, { ...PARENT }, { aborted: true }), [])
  })
})

test('listChildren throws → fail open: no steer, one warning', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx()
    ctx.subagents.listChildren = async () => { throw new Error('boom') }
    assert.deepEqual(await fireTurnStopping(ctx, { ...PARENT }), [])
    assert.equal(ctx.warnings.length, 1)
    assert.match(ctx.warnings[0], /boom/)
  })
})

test('steer throws → fail open: warning, turn is not wedged', async () => {
  await withConfig(ENABLED, async () => {
    const ctx = makeCtx({
      children: [{ id: 'child-1', meta: {} }],
      agentStatus: new Map([['child-1', { status: 'running' }]]),
    })
    const steered = await fireTurnStopping(ctx, { ...PARENT }, { steerThrows: true })
    assert.deepEqual(steered, [])
    assert.equal(ctx.warnings.length, 1)
    assert.match(ctx.warnings[0], /steer boom/)
  })
})

test('collectRunningChildren only returns live running children', async () => {
  const ctx = makeCtx({
    children: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    agentStatus: new Map([['a', { status: 'running' }], ['b', { status: 'idle' }]]),
  })
  const running = await collectRunningChildren(ctx, { id: 'parent-1' })
  assert.deepEqual(running.map((child) => child.id), ['a'])
})

test('message builder: concise, lists every running child, no job wording', () => {
  const message = buildChildGuardMessage([{ id: 'child-1', label: 'scan' }, { id: 'child-2' }])
  assert.match(message.content[0].text, /subagent child-1 \(scan\)/)
  assert.match(message.content[0].text, /subagent child-2/)
  assert.doesNotMatch(message.content[0].text, /job_/)
})
