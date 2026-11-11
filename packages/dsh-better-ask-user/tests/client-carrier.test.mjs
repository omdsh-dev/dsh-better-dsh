/** Real PendingQuestion carrier and waterfall, compiled from source without touching the published bundle. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: [new URL('../src/client/contract/slots.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
})
const module = { exports: {} }
new Function('module', 'exports', compiled.outputFiles[0].text)(module, module.exports)
const { PendingQuestion, createWaterfallRequest } = module.exports

const plan = {
  id: 'plan', question: 'Review the plan', detail: '# Work',
  intent: { kind: 'plan-review', approve: 'Approve original', callId: 'exit-plan' },
  options: [{ label: 'Approve original' }, { label: 'Request changes' }],
}
const permission = {
  id: 'permission', question: 'Allow access?',
  intent: { kind: 'approval', approve: 'Allow once', reject: 'Reject', always: 'Always allow' },
  options: [{ label: 'Allow once' }, { label: 'Reject' }, { label: 'Always allow' }],
}
const ordinary = { id: 'q', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }] }

function harness(questions, mode, callId) {
  const defaultAnswer = { answers: questions.map(q => ({ id: q.id, selected: [q.options[0].label] })), autoSelected: true }
  const pending = new PendingQuestion('session', questions, callId, undefined, undefined, {
    waitMs: 5000, timeoutMode: mode, defaultAnswer,
  })
  const request = createWaterfallRequest(Date.now() + 5000, undefined, channel => pending.detachWaterfall(channel))
  pending.attachWaterfall(request.channel)
  let outcome
  void request.result.then(answer => { outcome = { answer } }, error => { outcome = { error } })
  return { pending, request, defaultAnswer, get outcome() { return outcome } }
}

for (const mode of ['native', 'default']) {
  for (const [name, questions] of [
    ['plan review', [plan]],
    ['plan review in a generic multi-question batch', [ordinary, plan]],
    ['plan review with extra options', [{ ...plan, options: [...plan.options, { label: 'Discuss' }] }]],
    ['permission approval', [permission]],
  ]) {
    test(`${name} ignores ${mode} timeout configuration and timed waterfall`, async t => {
      t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10000 })
      const h = harness(questions, mode)
      try {
        assert.equal(h.pending.snapshot().channel, 'waterfall')
        assert.equal(h.pending.snapshot().countdown, undefined)
        assert.equal(h.pending.snapshot().timeoutMode, undefined)
        assert.equal(h.pending.snapshot().waitMs, undefined)
        h.pending.holdFocus()
        h.pending.releaseFocus()
        h.pending.bump()
        t.mock.timers.tick(60000)
        h.pending.timeout()
        h.pending.autoSelect()
        await Promise.resolve()
        assert.equal(h.outcome, undefined, 'neither the timer nor public automatic-settlement verbs may finish a decision')
        assert.equal(h.pending.hasWaterfall(), true)
        assert.equal(h.pending.snapshot().countdown, undefined)
        const answer = { answers: questions.map(q => ({ id: q.id, selected: [q.options[1].label] })) }
        await h.pending.answer(answer)
        assert.deepEqual(await h.request.result, answer, 'the explicit decision still reaches the real waterfall')
      } finally { h.pending.close() }
    })
  }
}

for (const [name, answer] of [
  ['approval', { answers: [{ id: 'plan', selected: ['Approve original'] }] }],
  ['feedback', { answers: [{ id: 'plan', selected: [], custom: 'Please add rollback steps' }] }],
]) {
  test(`plan review accepts explicit ${name} after ordinary timeout attempts`, async t => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10000 })
    const h = harness([plan], 'default')
    try {
      t.mock.timers.tick(60000)
      h.pending.timeout()
      h.pending.autoSelect()
      await h.pending.answer(answer)
      assert.deepEqual(await h.request.result, answer)
      assert.equal(h.pending.snapshot().channel, 'none')
    } finally { h.pending.close() }
  })
}

test('plan review remains explicitly cancellable after timeout attempts', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10000 })
  const h = harness([plan], 'native')
  try {
    t.mock.timers.tick(60000)
    h.pending.timeout()
    h.pending.autoSelect()
    await h.pending.dismiss()
    await assert.rejects(h.request.result, { name: 'UserQuestionError', code: 'ASK_CANCELLED' })
    assert.equal(h.pending.snapshot().channel, 'none')
  } finally { h.pending.close() }
})

for (const mode of ['native', 'default']) {
  test(`ordinary ${mode} question still expires through the carrier timer`, async t => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10000 })
    const h = harness([ordinary], mode)
    try {
      assert.equal(h.pending.snapshot().countdown.running, true)
      t.mock.timers.tick(6000)
      if (mode === 'default') assert.deepEqual(await h.request.result, h.defaultAnswer)
      else await assert.rejects(h.request.result, { name: 'UserQuestionError', code: 'ASK_TIMED_OUT' })
      assert.equal(h.pending.snapshot().channel, 'none')
    } finally { h.pending.close() }
  })
}
