/**
 * wait_subagent host-plane tool tests.
 *
 * Covers: array contract, batch concurrency, dedupe, direct-child fail-fast,
 * timeout floor, startup grace, cancellations, no parent-inbox surgery, and —
 * the reason this tool was rewritten — cross-turn correctness. A stale
 * childId-keyed `subagent/end` must never be reported as the current turn:
 * the tests build the exact "old end → queued input while idle → running → new
 * end" sequence against the migrated implementation using host-provable state
 * (live status + activation runIds + the child's durable turn/inbox events).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installWaitTool, START_GRACE_MS, MIN_TIMEOUT_MS, POLL_MS } from '../src/wait-subagent.js'

/** A fake sessionQuery over in-memory durable child event logs. */
function makeSessionQuery() {
  const logs = new Map()
  const inherited = new Map()
  let nextSeq = 1
  return {
    logs,
    append(id, type, data = {}) {
      const events = logs.get(id) ?? []
      logs.set(id, events)
      const event = { seq: nextSeq++, type, data }
      events.push(event)
      return event
    },
    /** Mark the first `count` events as fork-inherited (not the child's own). */
    setInherited(id, count) { inherited.set(id, count) },
    async observeSession(id) {
      const events = structuredClone(logs.get(id) ?? [])
      const lease = {
        source: 'live',
        header: { id },
        inheritedEventCount: inherited.get(id) ?? 0,
        events,
        cursor: events.at(-1)?.seq ?? -1,
        retain: () => lease,
        [Symbol.dispose]: () => {},
      }
      return lease
    },
  }
}

/** Fake ctx with the injected services; installs the real tool over the fake. */
function makeCtx({ children = [], sessionQuery } = {}) {
  const handlers = new Map()
  const agentStatus = new Map()
  const logs = sessionQuery ?? makeSessionQuery()
  let tool
  const ctx = {
    handlers,
    agentStatus,
    sessionQuery: logs,
    on: (event, fn) => { handlers.set(event, fn); return () => {} },
    subagents: { listChildren: async () => children },
    agents: { get: (id) => agentStatus.get(id) },
    tools: { register: (definition) => { tool = definition; return () => {} } },
  }
  installWaitTool(ctx)
  ctx.getTool = () => tool
  return ctx
}

function makeExec(inbox) {
  return { agent: { id: 'parent-1', inbox } }
}

async function flushMicrotasks() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

function fireStart(ctx, info) {
  const handler = ctx.handlers.get('subagent/start')
  assert.equal(typeof handler, 'function', 'installWaitTool must subscribe to subagent/start')
  handler(info)
}

function fireEnd(ctx, info) {
  const handler = ctx.handlers.get('subagent/end')
  assert.equal(typeof handler, 'function', 'installWaitTool must subscribe to subagent/end')
  // A real end means the activation was disposed: the child is no longer live.
  ctx.agentStatus.delete(info.id)
  handler(info)
}

const DONE = (id, stop = 'completed') =>
  `subagent ${id} done (${stop}); its closing message follows as the settlement notice.`

/** Track whether a promise already resolved (for "must not settle early" checks). */
function tracked(promise) {
  const state = { settled: false, value: undefined }
  state.promise = promise.then((value) => { state.settled = true; state.value = value })
  return state
}

test('contract: tool registration, array parameter, concurrency-safe', () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  const tool = ctx.getTool()
  assert.equal(tool.name, 'wait_subagent')
  assert.deepEqual(tool.parameters.required, ['subagent_id'])
  assert.equal(tool.parameters.properties.subagent_id.type, 'array')
  assert.equal(tool.parameters.properties.subagent_id.items.type, 'string')
  assert.equal(tool.parameters.properties.subagent_id.minItems, 1)
  assert.equal(tool.isConcurrencySafe(), true)
  assert.equal(START_GRACE_MS, 30_000)
  assert.equal(MIN_TIMEOUT_MS, 15 * 60_000)
})

test('running child finishes → short done line, child content not re-narrated', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  fireEnd(ctx, { id: 'child-1', runId: 'r1', lastAssistantMessage: '扫描完成', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1'))
  assert.doesNotMatch(pending.value, /扫描完成/)
})

test('unknown id (not a direct child) → fail fast, waits for nobody', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1', 'stranger', 'ghost'] }, makeExec())
  assert.match(out, /unknown subagent "stranger", "ghost"/)
  assert.ok(!out.includes('child-1 done'))
})

test('already-finished child with a matching settlement → immediate done', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  fireStart(ctx, { id: 'child-1', runId: 'r1' })
  fireEnd(ctx, { id: 'child-1', runId: 'r1', lastAssistantMessage: '早前已完成', stopReason: 'completed' })
  ctx.agentStatus.set('child-1', { status: 'idle' })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.equal(out, DONE('child-1'))
})

test('CROSS-TURN REGRESSION: old end → new start + queued input while idle → running → new end', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  // Old activation: a full turn ended and its end was observed.
  fireStart(ctx, { id: 'child-1', runId: 'run-old' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.agentStatus.set('child-1', { status: 'idle' })
  fireEnd(ctx, { id: 'child-1', runId: 'run-old', stopReason: 'completed' })
  await flushMicrotasks()

  // The parent continues the child: a new activation starts, but the child is
  // still idle and has only queued input — no turn has opened yet.
  fireStart(ctx, { id: 'child-1', runId: 'run-new' })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  ctx.agentStatus.set('child-1', { status: 'idle' })

  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'the previous activation end must not satisfy the new turn')

  // The queued input opens a turn, is claimed by it, and the turn ends.
  ctx.agentStatus.set('child-1', { status: 'running' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'a running child keeps waiting')

  ctx.agentStatus.set('child-1', { status: 'idle' })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  fireEnd(ctx, { id: 'child-1', runId: 'run-new', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1'))
})

test('CROSS-TURN REGRESSION: queued input after the last turn end keeps waiting for the end', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  // Resident activation: same run, its first turn ended, no end yet.
  fireStart(ctx, { id: 'child-1', runId: 'run-1' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.agentStatus.set('child-1', { status: 'idle' })

  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'no end has been observed yet')

  // New input is queued while the child is idle; the durable splice is newer
  // than the last turn end, so the tool must keep waiting even though status
  // is still idle and the old turn already ended.
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'queued input newer than turn/end means a turn is still owed')

  // That input is claimed and runs; only now does the activation settle.
  ctx.agentStatus.set('child-1', { status: 'running' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 2 })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 2, reason: { kind: 'completed' } })
  ctx.agentStatus.set('child-1', { status: 'idle' })
  fireEnd(ctx, { id: 'child-1', runId: 'run-1', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1'))
})

test('stale end paired with a newer start never settles as the current turn', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  fireStart(ctx, { id: 'child-1', runId: 'run-old' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  fireEnd(ctx, { id: 'child-1', runId: 'run-old', stopReason: 'completed' })
  fireStart(ctx, { id: 'child-1', runId: 'run-new' })
  ctx.agentStatus.set('child-1', { status: 'idle' })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'a new activation start invalidates the old end')
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.agentStatus.set('child-1', { status: 'idle' })
  fireEnd(ctx, { id: 'child-1', runId: 'run-new', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1'))
})

test('RESIDENT-IDLE REGRESSION: matched old end does not settle newer queued input without a new start', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  // Activation r1: its turn ended and an end was observed. (The child remains
  // resident-idle in this construction, so no new start follows.)
  fireStart(ctx, { id: 'child-1', runId: 'run-1' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  fireEnd(ctx, { id: 'child-1', runId: 'run-1', stopReason: 'completed' })
  ctx.agentStatus.set('child-1', { status: 'idle' })

  // The parent queues new input while the child is still idle: the host emits
  // no new subagent/start for a resident child, so only the durable splice
  // proves a turn is still owed.
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'the matched old end must not settle a resident child with queued input')

  // The queued input opens a turn and is claimed; the turn then ends.
  ctx.agentStatus.set('child-1', { status: 'running' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 2 })
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'a running resident child keeps waiting')
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 2, reason: { kind: 'completed' } })
  ctx.agentStatus.set('child-1', { status: 'idle' })
  fireEnd(ctx, { id: 'child-1', runId: 'run-1', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1'))
})

for (const newActivation of [true, false]) {
  test(`DEFERRED OBSERVATION REGRESSION: ${newActivation ? 'new activation' : 'resident turn without a new start'} runs and claims input during the read`, async (t) => {
    const ctx = makeCtx({ children: [{ id: 'child-1' }] })
    fireStart(ctx, { id: 'child-1', runId: 'run-old' })
    ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
    ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
    fireEnd(ctx, { id: 'child-1', runId: 'run-old', stopReason: 'completed' })
    ctx.agentStatus.set('child-1', { status: 'idle' })
    ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ role: 'user' }] })

    const entered = Promise.withResolvers()
    const release = Promise.withResolvers()
    const observe = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
    ctx.sessionQuery.observeSession = async (id) => {
      entered.resolve()
      await release.promise
      return observe(id)
    }
    const controller = new AbortController()
    t.after(() => { release.resolve(); controller.abort() })
    const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, { ...makeExec(), signal: controller.signal }))
    await entered.promise

    const runId = newActivation ? 'run-new' : 'run-old'
    if (newActivation) fireStart(ctx, { id: 'child-1', runId })
    ctx.agentStatus.set('child-1', { status: 'running' })
    ctx.sessionQuery.append('child-1', 'turn/start', { turn: 2 })
    ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', removedCount: 1, inserted: [] })
    release.resolve()
    await flushMicrotasks()
    assert.equal(pending.settled, false, 'claimed input is not completion: the child is now running')

    ctx.sessionQuery.append('child-1', 'turn/end', { turn: 2, reason: { kind: 'error' } })
    fireEnd(ctx, { id: 'child-1', runId, stopReason: 'error' })
    await pending.promise
    assert.equal(pending.value, DONE('child-1', 'error'), 'only the new end can finish this wait')
  })
}

for (const edge of ['start', 'end']) {
  test(`DEFERRED GENERATION REGRESSION: a new ${edge} invalidates the observation even when the child is idle`, async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const ctx = makeCtx({ children: [{ id: 'child-1' }] })
    fireStart(ctx, { id: 'child-1', runId: 'run-old' })
    ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
    ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
    fireEnd(ctx, { id: 'child-1', runId: 'run-old', stopReason: 'completed' })
    ctx.agentStatus.set('child-1', { status: 'idle' })

    const entered = Promise.withResolvers()
    const release = Promise.withResolvers()
    const observe = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
    ctx.sessionQuery.observeSession = async (id) => {
      // This lease predates the lifecycle edge and the newly queued input.
      const lease = await observe(id)
      entered.resolve()
      await release.promise
      return lease
    }
    const controller = new AbortController()
    t.after(() => { release.resolve(); controller.abort() })
    const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, { ...makeExec(), signal: controller.signal }))
    await entered.promise

    const runId = edge === 'start' ? 'run-new' : 'run-old'
    if (edge === 'start') fireStart(ctx, { id: 'child-1', runId })
    else {
      ctx.sessionQuery.append('child-1', 'turn/start', { turn: 2 })
      ctx.sessionQuery.append('child-1', 'turn/end', { turn: 2, reason: { kind: 'error' } })
      fireEnd(ctx, { id: 'child-1', runId, stopReason: 'error' })
    }
    ctx.agentStatus.set('child-1', { status: 'idle' })
    ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', inserted: [{ role: 'user' }] })
    release.resolve()
    await flushMicrotasks()
    assert.equal(pending.settled, false, 'the old empty queue cannot prove completion after a lifecycle edge')

    t.mock.timers.tick(POLL_MS)
    await flushMicrotasks()
    assert.equal(pending.settled, false, 'a fresh observation must still veto the queued input')
    ctx.agentStatus.set('child-1', { status: 'running' })
    ctx.sessionQuery.append('child-1', 'turn/start', { turn: 3 })
    ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', removedCount: 1, inserted: [] })
    ctx.sessionQuery.append('child-1', 'turn/end', { turn: 3, reason: { kind: 'aborted' } })
    fireEnd(ctx, { id: 'child-1', runId, stopReason: 'aborted' })
    await pending.promise
    assert.equal(pending.value, DONE('child-1', 'aborted'))
  })
}

test('observation generation retry after 30s is not a child startup failure', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  fireStart(ctx, { id: 'child-1', runId: 'run-1' })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  fireEnd(ctx, { id: 'child-1', runId: 'run-1', stopReason: 'completed' })
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const observe = ctx.sessionQuery.observeSession.bind(ctx.sessionQuery)
  let first = true
  ctx.sessionQuery.observeSession = async (id) => {
    const lease = await observe(id)
    if (first) { first = false; entered.resolve(); await release.promise }
    return lease
  }
  const controller = new AbortController()
  t.after(() => { release.resolve(); controller.abort() })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, { ...makeExec(), signal: controller.signal }))
  await entered.promise
  t.mock.timers.tick(START_GRACE_MS + 1)
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 2, reason: { kind: 'error' } })
  fireEnd(ctx, { id: 'child-1', runId: 'run-1', stopReason: 'error' })
  release.resolve()
  await flushMicrotasks()
  assert.equal(pending.settled, false, 'a changing observation must get a fresh read even after the startup grace')
  t.mock.timers.tick(POLL_MS)
  await flushMicrotasks()
  assert.equal(pending.value, DONE('child-1', 'error'))
})

test('freshly dispatched child that has not started yet → grace, then settles', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  ctx.agentStatus.set('child-1', { status: 'running' })
  fireStart(ctx, { id: 'child-1', runId: 'r1' })
  fireEnd(ctx, { id: 'child-1', runId: 'r1', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1'))
})

test('grace expires with no start → retryable not-started line', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  const pending = ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  await flushMicrotasks()
  t.mock.timers.tick(START_GRACE_MS + 1000)
  await flushMicrotasks()
  const out = await pending
  assert.match(out, /has not started after 30s/)
  assert.match(out, /status: ready/)
  assert.match(out, /wait_subagent again/)
})

test('unconfirmed: durable state unreadable → explicit unconfirmed line, not success', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.observeSession = async () => { throw new Error('session store unavailable') }
  const pending = ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  await flushMicrotasks()
  t.mock.timers.tick(START_GRACE_MS + 1000)
  await flushMicrotasks()
  const out = await pending
  assert.match(out, /could not be confirmed/)
  assert.doesNotMatch(out, /done \(/)
})

test('child that already ended before this wait (no queued input) → immediate earlier-finished line', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.match(out, /already finished its last turn \(completed\)/)
  assert.doesNotMatch(out, /done \(/)
})

test('fork-style inherited history is not read as the child own turn/splice state', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  // The observation starts with the parent's history: an inherited turn/end
  // and an inherited splice. None of it belongs to this child.
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.sessionQuery.setInherited('child-1', 3)
  const pending = ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  await flushMicrotasks()
  t.mock.timers.tick(START_GRACE_MS + 1000)
  await flushMicrotasks()
  const out = await pending
  // Not "already finished": the only turn/end belongs to the parent prefix.
  assert.match(out, /has not started after 30s/)
  assert.doesNotMatch(out, /already finished/)
})

test('fork mutation: own turn/end after the inherited boundary is recognized', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  ctx.sessionQuery.setInherited('child-1', 2)
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'aborted' } })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.match(out, /already finished its last turn \(aborted\)/)
})

test('cancellation fold: queued then canceled before running settles as aborted, not pending forever', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  fireStart(ctx, { id: 'child-1', runId: 'run-1' })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, outcome: 'canceled', inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'aborted' } })
  fireEnd(ctx, { id: 'child-1', runId: 'run-1', stopReason: 'aborted' })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.equal(out, DONE('child-1', 'aborted'))
})

test('cancellation fold without an end: canceled queue does not read as pending input', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, outcome: 'canceled', inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'aborted' } })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.match(out, /already finished its last turn \(aborted\)/)
  assert.doesNotMatch(out, /has not started|could not be confirmed/)
})

test('matched end + live child + unreadable session → unconfirmed, never done', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.observeSession = async () => { throw new Error('session store unreadable') }
  fireStart(ctx, { id: 'child-1', runId: 'run-live' })
  ctx.handlers.get('subagent/end')({ id: 'child-1', runId: 'run-live', stopReason: 'completed' })
  // Keep the child resident/live after the cached end: the matched pair alone
  // is not enough to claim success when the durable veto is unavailable.
  ctx.agentStatus.set('child-1', { status: 'idle' })
  const pending = ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  await flushMicrotasks()
  t.mock.timers.tick(START_GRACE_MS + 1000)
  await flushMicrotasks()
  const out = await pending
  assert.match(out, /could not be confirmed/)
  assert.doesNotMatch(out, /done \(/)
})

test('next-step cancellation fold: steered input canceled before running does not stay pending', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-step', start: 0, removedCount: 1, outcome: 'canceled', inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'aborted' } })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.match(out, /already finished its last turn \(aborted\)/)
})

test('next-step claim fold: steered input claimed by the running turn does not stay pending', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-step', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-step', start: 0, removedCount: 1, inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.match(out, /already finished its last turn \(completed\)/)
})

test('claim fold: queued then claimed by a turn does not stay pending', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, inserted: [{ role: 'user' }] })
  ctx.sessionQuery.append('child-1', 'agent/inbox/spliced', { target: 'next-turn', start: 0, removedCount: 1, inserted: [] })
  ctx.sessionQuery.append('child-1', 'turn/start', { turn: 1 })
  ctx.sessionQuery.append('child-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.match(out, /already finished its last turn \(completed\)/)
})

test('matched end is terminal when no DSH session is readable and the child is not live (external provider)', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.sessionQuery.observeSession = async () => { throw new Error('external child has no DSH session') }
  fireStart(ctx, { id: 'child-1', runId: 'run-ext' })
  fireEnd(ctx, { id: 'child-1', runId: 'run-ext', stopReason: 'completed' })
  const out = await ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec())
  assert.equal(out, DONE('child-1'))
  assert.doesNotMatch(out, /could not be confirmed/)
})

test('timeout_ms below 15 minutes is raised to 15 minutes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  let out
  const pending = ctx.getTool().execute({ subagent_id: ['child-1'], timeout_ms: 5000 }, makeExec()).then((value) => { out = value })
  await flushMicrotasks()
  t.mock.timers.tick(5000)
  await flushMicrotasks()
  assert.equal(out, undefined)
  t.mock.timers.tick(MIN_TIMEOUT_MS - 5000)
  await pending
  assert.match(out, /timed out waiting for subagent child-1/)
})

test('error stop reason is reflected in the short done line', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec()))
  await flushMicrotasks()
  fireEnd(ctx, { id: 'child-1', runId: 'r1', stopReason: 'error' })
  await pending.promise
  assert.equal(pending.value, DONE('child-1', 'error'))
})

test('batch: settle out of order but lines keep input order', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }, { id: 'child-2' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  ctx.agentStatus.set('child-2', { status: 'running' })
  const pending = tracked(ctx.getTool().execute({ subagent_id: ['child-1', 'child-2'] }, makeExec()))
  await flushMicrotasks()
  fireEnd(ctx, { id: 'child-2', runId: 'r2', stopReason: 'completed' })
  fireEnd(ctx, { id: 'child-1', runId: 'r1', stopReason: 'completed' })
  await pending.promise
  assert.equal(pending.value, `${DONE('child-1')}\n${DONE('child-2')}`)
})

test('mixed batch: one settles, one times out', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] })
  const ctx = makeCtx({ children: [{ id: 'child-1' }, { id: 'child-2' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  ctx.agentStatus.set('child-2', { status: 'running' })
  const pending = ctx.getTool().execute({ subagent_id: ['child-1', 'child-2'], timeout_ms: 5000 }, makeExec())
  await flushMicrotasks()
  fireEnd(ctx, { id: 'child-1', runId: 'r1', stopReason: 'completed' })
  await flushMicrotasks()
  t.mock.timers.tick(MIN_TIMEOUT_MS)
  const out = await pending
  const lines = out.split('\n')
  assert.equal(lines[0], DONE('child-1'))
  assert.match(lines[1], /timed out waiting for subagent child-2/)
})

test('duplicate ids are deduped preserving order', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  const pending = ctx.getTool().execute({ subagent_id: ['child-1', 'child-1'] }, makeExec())
  await flushMicrotasks()
  fireEnd(ctx, { id: 'child-1', runId: 'r1', stopReason: 'completed' })
  assert.equal(await pending, DONE('child-1'))
})

test('all-aborted batch collapses to one interruption line', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }, { id: 'child-2' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  ctx.agentStatus.set('child-2', { status: 'running' })
  const controller = new AbortController()
  const pending = ctx.getTool().execute({ subagent_id: ['child-1', 'child-2'] }, { agent: { id: 'parent-1' }, signal: controller.signal })
  await flushMicrotasks()
  controller.abort()
  const out = await pending
  assert.match(out, /aborted by user interruption/)
})

test('no inbox surgery: parent pending queue is left untouched', async () => {
  const ctx = makeCtx({ children: [{ id: 'child-1' }, { id: 'child-2' }] })
  ctx.agentStatus.set('child-1', { status: 'running' })
  const spliced = []
  const inbox = {
    nextStep: [
      { source: { kind: 'subagent-settled', senderSessionId: 'child-2' } },
      { source: { kind: 'agent-message', senderSessionId: 'child-1' } },
      { source: { kind: 'subagent-settled', senderSessionId: 'child-1' } },
    ],
    nextTurn: [],
    splice: (queue, index, count, items) => {
      spliced.push({ queue, index, count })
      const arr = queue === 'next-step' ? inbox.nextStep : inbox.nextTurn
      arr.splice(index, count, ...(items ?? []))
    },
  }
  const pending = ctx.getTool().execute({ subagent_id: ['child-1'] }, makeExec(inbox))
  await flushMicrotasks()
  fireEnd(ctx, { id: 'child-1', runId: 'r1', stopReason: 'completed' })
  assert.equal(await pending, DONE('child-1'))
  assert.deepEqual(spliced, [])
  assert.equal(inbox.nextStep.length, 3)
})
