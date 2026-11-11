import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service, symbols } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import { GoalService, goalProjectionDefinition } from '../src/service.js'
import { createGoalHistoryDefinition } from '../src/history.js'
import { mountGoalListHints } from '../src/list-hints.js'

const plugin = { name: 'goal-list-hints-test', apply: mountGoalListHints }
const drain = async () => { for (let i = 0; i < 8; i++) await new Promise(setImmediate) }

test('real registry goal and history stay in detail but leave live and cached list hints intact otherwise', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const agents = new Map()
  ctx.provide('agents', { get: (id) => agents.get(id), currentInitiator: () => undefined })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(createGoalHistoryDefinition(goalProjectionDefinition))
  const metadata = { blank: false, lastPromptAt: 42 }
  const other = { records: ['unrelated plugin detail'], goal: 'nested unrelated value' }
  for (const [key, value] of Object.entries({ sessionListMetadata: metadata, title: 'Title', other, nullable: null })) {
    ctx.sessionProjections.register({ key, stateVersion: 1, stateSchema: z.any(), init: () => value,
      apply: (state) => state, wire: { viewSchema: z.any(), view: (state) => state } })
  }
  await ctx.plugin(GoalService)
  const session = ctx.sessions.create('list-source', { meta: { cwd: '/tmp' } })
  const agent = { id: session.id, session, status: 'idle' }
  agents.set(agent.id, agent)
  const first = ctx.goals.create(agent, { objective: 'A completed objective', maxGoalRounds: 4 })
  ctx.goals.complete(agent, { id: first.id, revision: first.revision })
  const current = ctx.goals.create(agent, { objective: 'The entire current objective'.repeat(100), maxGoalRounds: 8 })
  const snapshot = ctx.sessionProjections.snapshot(session)
  const cached = ctx.sessionProjections.cachedSnapshot(session)
  const hints = [snapshot, cached].map((value, index) => Object.freeze({
    kind: index === 0 ? 'sequenced' : 'cached', ...value, extraHint: { retained: true },
    values: Object.freeze(value.values),
  }))
  const rows = hints.map((projections, index) => Object.freeze({ sessionId: index === 0 ? session.id : 'cold',
    updatedAt: 42, running: false, blank: false, metadata: { retained: true }, projections }))
  const emptyRow = Object.freeze({ sessionId: 'no-projections', updatedAt: 0 })
  const otherRow = Object.freeze({ sessionId: 'no-goal', projections: { kind: 'cached', asOfSeq: 1, values: { other } } })
  rows.push(emptyRow, otherRow)
  const source = Object.freeze({ items: Object.freeze(rows), metadata: { retained: true } })
  class Controller extends Service {
    constructor(inner) { super(inner, 'sessionController') }
    async list() { return source }
    async projections() { return ctx.sessionProjections.snapshot(session) }
  }
  await ctx.plugin(Controller)
  const fiber = ctx.plugin(plugin)
  await fiber
  const result = await ctx.sessionController.list({})
  assert.equal(result.metadata, source.metadata)
  assert.equal(result.items.length, 4)
  for (let i = 0; i < 2; i++) {
    const row = result.items[i]
    assert.deepEqual(row.projections.values, { title: 'Title', sessionListMetadata: metadata, other, nullable: null })
    assert.equal(Object.hasOwn(row.projections.values, 'goal'), false)
    assert.equal(Object.hasOwn(row.projections.values, 'better-goal-history'), false)
    assert.equal(row.projections.kind, i === 0 ? 'sequenced' : 'cached')
    assert.equal(row.projections.asOfSeq, snapshot.asOfSeq)
    assert.equal(row.projections.extraHint, hints[i].extraHint)
    assert.equal(row.projections.values.other, other)
    assert.equal(row.metadata, rows[i].metadata)
    assert.deepEqual({ ...row, projections: rows[i].projections }, rows[i])
  }
  assert.equal(result.items[2], emptyRow)
  assert.equal(result.items[3], otherRow)
  const detail = await ctx.sessionController.projections({ sessionId: session.id })
  assert.equal(detail.values.goal.goal.objective, current.objective)
  assert.deepEqual(detail.values['better-goal-history'].entries.map((entry) => entry.objective), ['A completed objective', current.objective])
  assert.equal(snapshot.values.goal.goal.objective, current.objective)
  assert.equal(cached.values['better-goal-history'].entries.length, 2)
  await fiber.dispose()
  assert.equal(await ctx.sessionController.list({}), source)
})

for (const ownMethod of [false, true]) {
  test('Cordis preserves the invocation receiver and restores ' + (ownMethod ? 'own' : 'inherited') + ' list after a late controller arrives', async (t) => {
    const ctx = new Context()
    t.after(() => ctx.fiber.dispose())
    const fiber = ctx.plugin(plugin)
    await fiber
    assert.equal(ctx.get('sessionController'), undefined, 'optional injection does not require a web controller')
    const request = { arbitrary: true }
    const signal = new AbortController().signal
    const invocation = { principal: 'scoped-client' }
    const source = { items: [{ projections: { values: { goal: null, 'better-goal-history': null, keep: 1 } } }] }
    class Controller extends Service {
      constructor(inner) {
        super(inner, 'sessionController')
        this.marker = request
        if (ownMethod) this.list = this.list
      }
      async list(arg, cancellation) {
        assert.equal(this.marker, request)
        assert.equal(arg, request)
        assert.equal(cancellation, signal)
        assert.equal(this.ctx.invocation, invocation, 'call-site context must reach the original method')
        return source
      }
    }
    const protoList = Controller.prototype.list
    const hostFiber = ctx.plugin(Controller)
    await hostFiber
    await drain()
    const controller = ctx.sessionController[symbols.original]
    const caller = ctx.extend({ invocation }).sessionController
    assert.deepEqual((await caller.list(request, signal)).items[0].projections.values, { keep: 1 })
    assert.equal(Controller.prototype.list, protoList)
    assert.equal(Object.hasOwn(controller, 'list'), true)
    await fiber.dispose()
    assert.equal(controller.list, protoList)
    assert.equal(Object.hasOwn(controller, 'list'), ownMethod)
    assert.equal(await caller.list(request, signal), source)
  })
}

test('unloading during a pending list stops filtering its result and preserves original failures', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  let resolve
  const pending = new Promise((done) => { resolve = done })
  const source = { items: [{ projections: { values: { goal: { objective: 'full' }, 'better-goal-history': { entries: [] } } } }] }
  const failure = new Error('host list failed')
  class Controller extends Service {
    constructor(inner) { super(inner, 'sessionController') }
    async list(request, signal) { signal?.throwIfAborted(); if (request.fail) throw failure; return pending }
  }
  await ctx.plugin(Controller)
  const fiber = ctx.plugin(plugin)
  await fiber
  await assert.rejects(ctx.sessionController.list({ fail: true }), (error) => error === failure)
  const abort = new AbortController()
  abort.abort(failure)
  await assert.rejects(ctx.sessionController.list({}, abort.signal), (error) => error === failure)
  const result = ctx.sessionController.list({})
  await fiber.dispose()
  resolve(source)
  assert.equal(await result, source)
})
