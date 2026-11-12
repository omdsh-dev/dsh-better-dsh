import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, renderGoalRoundPrompt } from '../src/driver.js'
import { DEFAULTS, UNLIMITED_ROUNDS } from '../src/config.js'

const drain = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate) }

/**
 * Run one goal turn whose measured duration is exactly `ms`.
 *
 * The driver measures turn length with `Date.now()`, so the clock is frozen for
 * the duration of the turn and advanced by `ms` between turn/start and
 * turn/end. Tests in one file run sequentially, so the global override cannot
 * leak into a concurrent test.
 * @param h - harness from `harness()`.
 * @param ms - elapsed milliseconds the driver should observe.
 * @param reason - the real turn/end reason (an aborted turn nests why).
 */
async function runTurn(h, ms, reason = { kind: 'completed' }) {
  const realNow = Date.now
  let clock = 1_000_000
  Date.now = () => clock
  try {
    h.emit('session/event', h.agent.session, { type: 'turn/start', data: {} })
    await h.admit()
    clock += ms
    h.emit('session/event', h.agent.session, { type: 'turn/end', data: { reason } })
  } finally {
    Date.now = realNow
  }
}

/** The last queued round's prompt text. */
const lastPrompt = (h) => h.queued.at(-1).content[0].text

/**
 * Fake `ctx.jobs` for one session.
 *
 * `settleAfter` is how many `wait` calls it takes for each job to reach a
 * terminal state (0 = settle on the first wait, Infinity = never settle).
 * The fake advances a fake clock so the driver's deadline arithmetic sees real
 * elapsed time instead of finishing instantly.
 */
function fakeJobs({ jobs = [], settleAfter = 0, listError, waitError, clock } = {}) {
  const state = jobs.map((job) => ({ status: 'running', ...job }))
  const waits = []
  return {
    waits,
    state,
    list(caller) {
      if (listError !== undefined) throw listError
      return state.map((job) => ({ id: job.id, label: job.label, kind: job.kind, status: job.status }))
    },
    async wait(id, timeoutMs, caller) {
      waits.push({ id, timeoutMs, caller })
      if (waitError !== undefined) throw waitError
      const job = state.find((entry) => entry.id === id)
      job.waited = (job.waited ?? 0) + 1
      // `settleAfter` is the 1-based wait on which the job finishes; Infinity never does.
      if (job.waited >= settleAfter) {
        job.status = 'completed'
        return { id, status: job.status }
      }
      // Nothing settled: burn the whole remaining budget so this wait times out.
      if (clock !== undefined) clock.now += timeoutMs
      return { id, status: job.status }
    },
  }
}

/** Replace `Date.now` with a movable clock for the duration of one test. */
function installClock(t, start = 1_000_000) {
  const clock = { now: start }
  const realNow = Date.now
  Date.now = () => clock.now
  t.after(() => { Date.now = realNow })
  return clock
}

function harness(settings = {}, options = {}) {
  const handlers = new Map(), cleanups = [], agents = new Map(), queued = [], warnings = []
  const config = { ...DEFAULTS, ...settings }
  let goal, planning = Boolean(options.planning)
  const emit = (name, ...args) => { for (const fn of handlers.get(name) ?? []) fn(...args) }
  const ctx = {
    fiber: { state: 2 },
    logger: { warn: (message) => warnings.push(message) },
    get: (service) => (service === 'jobs' ? options.jobs : undefined),
    on(name, fn) { const list = handlers.get(name) ?? []; list.push(fn); handlers.set(name, list) },
    effect(fn) { const generator = fn(); cleanups.push(generator.next().value) },
    agents: {
      get: (id) => agents.get(id), list: () => [...agents.values()],
      currentInitiator: () => undefined,
      withoutInitiator: (fn) => Promise.resolve().then(fn),
    },
    sessions: { flush: async () => { if (options.flushError) throw new Error('disk full') } },
  }
  const changed = (operation) => {
    goal.revision++
    emit('goal/changed', { agent, change: { operation } })
    return { ...goal }
  }
  ctx.goals = {
    get: () => goal && { ...goal },
    disarm() { if (goal) goal.activation = 'disarmed' },
    edit(_agent, ref, replacement) { assert.equal(ref.revision, goal.revision); Object.assign(goal, replacement); return changed('edit') },
    block(_agent, ref, reason) { assert.equal(ref.revision, goal.revision); Object.assign(goal, { phase: 'blocked', activation: 'disarmed', blockedReason: reason }); return changed('block') },
    pause(_agent, ref) { assert.equal(ref.revision, goal.revision); Object.assign(goal, { phase: 'paused', activation: 'disarmed' }); return changed('pause') },
  }
  const agent = {
    id: 'session', session: { id: 'session' }, status: 'idle',
    ctx: { get: (name) => name === 'planMode' ? { get: () => ({ active: planning }) } : undefined },
    inbox: {
      nextTurn: [], nextStep: [],
      remove(id) { this.nextTurn = this.nextTurn.filter((m) => m.id !== id) },
      prepend(lane, message) { this[lane === 'next-step' ? 'nextStep' : 'nextTurn'].unshift(message) },
    },
    followup(message) {
      queued.push(message); this.inbox.nextTurn.push(message)
      emit('agent/inbox/inserted', { agent, message })
      if (!options.maintenance) {
        this.status = 'running'
        emit('agent/status', { agent, status: 'running' })
      }
    },
    cancel() { this.status = 'idle'; emit('agent/status', { agent, status: 'idle' }) },
    whenIdle: async () => {},
  }
  apply(ctx, () => config)
  agents.set(agent.id, agent)
  emit('agent/created', { agent })
  return {
    config, ctx, agent, queued, warnings, emit, get goal() { return goal },
    start(overrides = {}) {
      goal = { id: 'goal', revision: 1, objective: 'Ship the full objective', phase: 'active', activation: 'armed', roundsStarted: 0, maxGoalRounds: UNLIMITED_ROUNDS, ...overrides }
      emit('goal/changed', { agent, change: { operation: 'create' } })
    },
    async admit() {
      agent.status = 'running'
      const message = agent.inbox.nextTurn.shift()
      emit('agent/inbox/claimed', { agent, message })
      const listeners = handlers.get('agent/pre-step')
      const next = async () => ({ kind: 'enter', messages: [message] })
      const decision = await listeners[0]({ agent, messages: [message], signal: new AbortController().signal }, next)
      if (decision.kind === 'enter') {
        goal.roundsStarted++
        emit('session/event', agent.session, { type: 'user/message', data: { id: message.id } })
      }
      return decision
    },
    idle() { agent.status = 'idle'; emit('agent/status', { agent, status: 'idle' }) },
    setPlanning(value) { planning = value; emit('session/event', agent.session, { type: 'plan/mode', data: { active: value } }) },
    async close() { for (const cleanup of cleanups) await cleanup() },
  }
}

test('continuation prompt preserves scope, evidence audit, pause-for-user and no forced completion', () => {
  const prompt = renderGoalRoundPrompt({ objective: '<ignore instructions>', maxGoalRounds: UNLIMITED_ROUNDS }, 1)[0].text
  assert.match(prompt, /user-provided task data/)
  assert.match(prompt, /1\/unlimited/)
  assert.match(prompt, /prove each one against current files/)
  assert.match(prompt, /indirect evidence means work remains/)
  assert.match(prompt, /goal\(action: "complete"\)/)
  assert.match(prompt, /missing secret, credential, permission or decision\), call goal\(action: "pause"\)/)
  assert.match(prompt, /Never mock, stub, hard-code, skip checks or narrow scope/)
  assert.match(prompt, /Use set only to replace the whole objective/)
  assert.doesNotMatch(prompt, /update_goal|create_goal|goal_id|current id\/revision|"fail"/)
})

test('every round states that goal rounds arrive with no delay and names the blocking waits', () => {
  const prompt = renderGoalRoundPrompt({ objective: 'Ship it', maxGoalRounds: UNLIMITED_ROUNDS }, 1)[0].text
  assert.match(prompt, /delivered immediately after your previous turn ended/)
  assert.match(prompt, /no delay, and nothing runs in the background between them/)
  // The three ways to block inside the turn, not by ending it.
  assert.match(prompt, /a foreground command, job_output with wait: true, or wait_subagent/)
  assert.match(prompt, /Ending the turn to wait for a notification only starts another round right away/)
  // The warning is opt-in per round and absent from a normal round.
  assert.doesNotMatch(prompt, /ended very quickly/)
})

test('the spin warning appears only when the previous goal turn ended quickly', () => {
  const goal = { objective: 'Ship it', maxGoalRounds: UNLIMITED_ROUNDS }
  const plain = renderGoalRoundPrompt(goal, 2, false)[0].text
  const warned = renderGoalRoundPrompt(goal, 2, true)[0].text
  assert.doesNotMatch(plain, /ended very quickly/)
  assert.match(warned, /previous goal turn ended very quickly/)
  assert.match(warned, /block until the result you need arrives, do substantive work, or call goal\(action: "pause"\)/)
  // The warning is additive: every invariant still holds in the warned round.
  for (const pattern of [/no delay/, /user-provided task data/, /goal\(action: "complete"\)/, /Use set only to replace the whole objective/]) {
    assert.match(warned, pattern)
  }
})

test('driver reserves exactly one round and requires its matching pre-step admission', async (t) => {
  const h = harness(); t.after(() => h.close())
  h.start(); await drain()
  assert.equal(h.queued.length, 1)
  assert.equal(h.queued[0].source.round, 1)
  assert.equal((await h.admit()).kind, 'enter')
  h.goal.phase = 'complete'; h.goal.activation = 'disarmed'; h.idle(); await drain()
  assert.equal(h.queued.length, 1)
})

test('a goal turn shorter than the threshold makes the next round carry the spin warning', async (t) => {
  const h = harness({ spinHintSeconds: 120 }); t.after(() => h.close())
  h.start(); await drain()
  assert.equal(h.queued.length, 1)
  // First round has no history to judge; it never carries the warning.
  assert.doesNotMatch(lastPrompt(h), /ended very quickly/)

  await runTurn(h, 3_000)
  h.idle(); await drain()
  assert.equal(h.queued.length, 2, 'a fast turn is followed by exactly one new round')
  assert.match(lastPrompt(h), /previous goal turn ended very quickly/)

  // The warning is consumed: the following round is measured fresh, so a slow
  // turn clears it instead of repeating it forever.
  await runTurn(h, 10 * 60_000)
  h.idle(); await drain()
  assert.equal(h.queued.length, 3)
  assert.doesNotMatch(lastPrompt(h), /ended very quickly/, 'a slow turn clears the warning')
})

test('a goal turn at or above the threshold, or with the switch off, never warns', async (t) => {
  const slow = harness({ spinHintSeconds: 120 }); t.after(() => slow.close())
  slow.start(); await drain()
  await runTurn(slow, 120_000)  // exactly the threshold: not "shorter than"
  slow.idle(); await drain()
  assert.equal(slow.queued.length, 2)
  assert.doesNotMatch(lastPrompt(slow), /ended very quickly/)

  const off = harness({ spinHintSeconds: 0 }); t.after(() => off.close())
  off.start(); await drain()
  await runTurn(off, 1)
  off.idle(); await drain()
  assert.equal(off.queued.length, 2)
  assert.doesNotMatch(lastPrompt(off), /ended very quickly/, '0 disables the warning')

  const tuned = harness({ spinHintSeconds: 30 }); t.after(() => tuned.close())
  tuned.start(); await drain()
  await runTurn(tuned, 29_000)
  tuned.idle(); await drain()
  assert.match(lastPrompt(tuned), /ended very quickly/, 'a custom threshold applies to the next round')
})

test('an aborted or token-capped goal turn is not read as idling', async (t) => {
  for (const reason of [{ kind: 'aborted', reason: { kind: 'user' } }, { kind: 'max-tokens' }]) {
    const h = harness({ spinHintSeconds: 120 }); t.after(() => h.close())
    h.start(); await drain()
    await runTurn(h, 1_000, reason)
    h.idle(); await drain()
    // Neither reason is evidence about the model, so no round may carry the
    // warning. (An aborted turn also disarms/pauses the goal, so assert on any
    // round that did get queued.)
    for (const message of h.queued.slice(1)) {
      assert.doesNotMatch(message.content[0].text, /ended very quickly/, reason.kind + ' must not produce a spin warning')
    }
  }
})

test('a human ordinary turn between goal rounds does not arm the warning', async (t) => {
  const h = harness({ spinHintSeconds: 120 }); t.after(() => h.close())
  h.start(); await drain()
  await runTurn(h, 10 * 60_000)
  h.idle(); await drain()

  // A human message opens its own turn; it is not a goal round.
  h.emit('session/event', h.agent.session, { type: 'turn/start', data: {} })
  h.emit('session/event', h.agent.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  h.idle(); await drain()
  for (const message of h.queued.slice(2)) {
    assert.doesNotMatch(message.content[0].text, /ended very quickly/, 'only goal turns are measured')
  }
})

test('the next round waits for background jobs and starts as soon as they settle', async (t) => {
  const clock = installClock(t)
  const jobs = fakeJobs({ jobs: [{ id: 'bash-1', label: 'npm test', kind: 'bash' }], settleAfter: 1, clock })
  const h = harness({ jobWaitSeconds: 2400 }, { jobs })
  t.after(() => h.close())
  h.start(); await drain()
  assert.equal(h.queued.length, 1, 'the first round is admitted without any wait')
  await runTurn(h, 5_000)
  h.idle(); await drain()
  assert.equal(jobs.waits.length, 1, 'the driver joined the running job before the next round')
  assert.equal(jobs.waits[0].caller, 'session', 'jobs are read through the owning session id')
  assert.equal(jobs.waits[0].id, 'bash-1')
  assert.ok(jobs.waits[0].timeoutMs > 0, 'the wait is bounded by a positive timeout')
  // The job settled inside the window, so the round carries no job warning.
  assert.equal(h.queued.length, 2)
  assert.doesNotMatch(lastPrompt(h), /Still running:/)
  assert.match(lastPrompt(h), /no delay, and nothing runs in the background between them/)
})

test('a job that outlasts the window is named in the next round and is not cancelled', async (t) => {
  const clock = installClock(t)
  const jobs = fakeJobs({ jobs: [{ id: 'bash-2', label: 'npm run build', kind: 'bash' }], settleAfter: Infinity, clock })
  const h = harness({ jobWaitSeconds: 2400 }, { jobs })
  t.after(() => h.close())
  h.start(); await drain()
  await runTurn(h, 5_000)
  h.idle(); await drain()
  assert.equal(h.queued.length, 2, 'the round still starts after the window closes')
  const prompt = lastPrompt(h)
  assert.match(prompt, /Still running:/)
  assert.match(prompt, /background job bash-2 \(npm run build, bash\) — running/)
  assert.match(prompt, /do not re-dispatch it/)
  // The delivery sentence must not still claim nothing was waiting.
  assert.doesNotMatch(prompt, /no delay, and nothing runs in the background between them/)
  assert.equal(jobs.state[0].status, 'running', 'the driver never cancels work it waited on')
  // The snapshot is use-once in the sense that each round re-measures after its
  // own window; the job is still running, so the next round names it afresh.
  await runTurn(h, 5_000); h.idle(); await drain()
  assert.equal(h.queued.length, 3)
  assert.match(lastPrompt(h), /Still running:/)
  assert.ok(jobs.waits.length > 1, 'each round measures its own window')
})

test('the first round never waits for background jobs', async (t) => {
  const clock = installClock(t)
  const jobs = fakeJobs({ jobs: [{ id: 'bash-0', label: 'x', kind: 'bash' }], clock })
  const h = harness({ jobWaitSeconds: 2400 }, { jobs })
  t.after(() => h.close())
  h.start(); await drain()
  assert.equal(h.queued.length, 1, 'a fresh goal is admitted without waiting')
  assert.equal(jobs.waits.length, 0, 'there is no previous turn whose work could have been cut short')
  assert.equal(jobs.state[0].status, 'running', 'and the job was left alone')
})

test('jobWaitSeconds 0 skips the wait entirely', async (t) => {
  const clock = installClock(t)
  const jobs = fakeJobs({ jobs: [{ id: 'bash-3', label: 'x', kind: 'bash' }], clock })
  const h = harness({ jobWaitSeconds: 0 }, { jobs })
  t.after(() => h.close())
  h.start(); await drain()
  await runTurn(h, 5_000); h.idle(); await drain()
  assert.equal(h.queued.length, 2, 'the round is admitted as before')
  assert.equal(jobs.waits.length, 0, '0 disables the wait')
})

test('a missing or failing jobs service never blocks a round', async (t) => {
  const clock = installClock(t)
  const absent = harness({ jobWaitSeconds: 2400 })
  t.after(() => absent.close())
  absent.start(); await drain()
  await runTurn(absent, 5_000); absent.idle(); await drain()
  assert.equal(absent.queued.length, 2, 'no jobs service: the round is admitted as before')

  for (const options of [{ listError: new Error('registry gone') }, { waitError: new Error('foreign job') }]) {
    const failing = harness({ jobWaitSeconds: 2400 }, { jobs: fakeJobs({ jobs: [{ id: 'bash-4', kind: 'bash' }], clock, ...options }) })
    t.after(() => failing.close())
    failing.start(); await drain()
    await runTurn(failing, 5_000); failing.idle(); await drain()
    assert.equal(failing.queued.length, 2, 'a failing jobs service must not wedge the driver')
    assert.ok(failing.warnings.some((line) => /background job wait skipped/.test(line)), 'the failure is logged')
  }
})

test('Plan mode suppresses automatic work and leaving it admits the explicitly armed goal', async (t) => {
  const h = harness({}, { planning: true }); t.after(() => h.close())
  h.start(); await drain(); assert.equal(h.queued.length, 0)
  h.setPlanning(false); await drain(); assert.equal(h.queued.length, 1)
})

test('new fixed policy is persisted without resetting counters before a round is queued', async (t) => {
  const h = harness({ roundLimitMode: 'fixed', roundLimit: 3 }); t.after(() => h.close())
  h.start({ roundsStarted: 1 }); await drain()
  assert.equal(h.goal.maxGoalRounds, 3)
  assert.equal(h.goal.roundsStarted, 1)
  assert.equal(h.queued.length, 1)
  assert.equal(h.queued[0].source.round, 2)
  assert.equal(h.queued[0].source.revision, h.goal.revision)
})

test('exhausted finite cap fails immediately while sentinel admits another round', async (t) => {
  const finite = harness(); t.after(() => finite.close())
  finite.start({ maxGoalRounds: 2, roundsStarted: 2 }); await drain()
  assert.equal(finite.goal.phase, 'blocked')
  assert.equal(finite.goal.blockedReason.code, 'round-limit')
  assert.equal(finite.queued.length, 0)
  const unlimited = harness(); t.after(() => unlimited.close())
  unlimited.start({ roundsStarted: 10000 }); await drain()
  assert.equal(unlimited.queued[0].source.round, 10001)
})

test('user abort disarms synchronously and pauses at idle without injecting a new round', async (t) => {
  const h = harness(); t.after(() => h.close())
  h.start(); await drain(); await h.admit()
  h.emit('session/event', h.agent.session, { type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'user' } } } })
  assert.equal(h.goal.activation, 'disarmed')
  h.idle(); await drain()
  assert.equal(h.goal.phase, 'paused')
  assert.equal(h.queued.length, 1)
})

test('disposed turn disarms without persisting a user pause', async (t) => {
  const h = harness(); t.after(() => h.close())
  h.start(); await drain(); await h.admit()
  const revision = h.goal.revision
  h.emit('session/event', h.agent.session, { type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'disposed' } } } })
  assert.equal(h.goal.activation, 'disarmed')
  h.idle(); await drain()
  assert.equal(h.goal.phase, 'active')
  assert.equal(h.goal.revision, revision)
  assert.equal(h.queued.length, 1)
})

test('agent self-pause inside a goal round is not cancelled and queues no next round', async (t) => {
  const h = harness(); t.after(() => h.close())
  h.start(); await drain(); await h.admit()
  let cancelled = 0
  const cancel = h.agent.cancel
  h.agent.cancel = function (...args) { cancelled++; return cancel.apply(this, args) }
  h.ctx.agents.currentInitiator = () => h.agent
  h.ctx.goals.pause(h.agent, { id: h.goal.id, revision: h.goal.revision })
  assert.equal(cancelled, 0)
  h.ctx.agents.currentInitiator = () => undefined
  h.idle(); await drain()
  assert.equal(h.goal.phase, 'paused')
  assert.equal(h.goal.activation, 'disarmed')
  assert.equal(h.queued.length, 1)
})

test('terminal runtime error stops goal work with a concrete reason', async (t) => {
  const h = harness(); t.after(() => h.close())
  h.start(); await drain(); await h.admit()
  h.emit('agent/error', { agent: h.agent, error: new Error('provider failed') })
  h.idle(); await drain()
  assert.equal(h.goal.phase, 'blocked')
  assert.equal(h.goal.blockedReason.code, 'runtime-error')
  assert.match(h.goal.blockedReason.message, /provider failed/)
  assert.equal(h.queued.length, 1)
})

test('ordinary-turn errors disarm without failing an unrelated goal', async (t) => {
  const h = harness(); t.after(() => h.close())
  h.start(); await drain()
  h.emit('agent/error', { agent: h.agent, error: new Error('ordinary turn failed') })
  assert.equal(h.goal.phase, 'active')
  assert.equal(h.goal.activation, 'disarmed')

  const next = harness(); t.after(() => next.close())
  next.start(); await drain(); await next.admit()
  next.emit('session/event', next.agent.session, { type: 'turn/start', data: {} })
  next.emit('agent/error', { agent: next.agent, error: new Error('later human turn failed') })
  assert.equal(next.goal.phase, 'active')
  assert.equal(next.goal.activation, 'disarmed')
})

test('maintenance edits replace queued reservations instead of duplicating or pausing them', async (t) => {
  const h = harness({}, { maintenance: true }); t.after(() => h.close())
  h.start(); await drain()
  assert.equal(h.agent.inbox.nextTurn.length, 1)
  const original = h.agent.inbox.nextTurn[0]
  h.ctx.goals.edit(h.agent, { id: h.goal.id, revision: h.goal.revision }, { objective: 'Updated objective' })
  await drain()
  assert.equal(h.agent.inbox.nextTurn.length, 1)
  assert.notEqual(h.agent.inbox.nextTurn[0].id, original.id)
  assert.equal(h.agent.inbox.nextTurn[0].source.revision, h.goal.revision)
  assert.equal((await h.admit()).kind, 'enter')
  h.idle(); await drain()
  assert.equal(h.goal.phase, 'active')
  assert.equal(h.agent.inbox.nextTurn.length, 1)
  assert.equal(h.agent.inbox.nextTurn[0].source.round, 2)
})

test('failed durability checkpoint disarms instead of continuing against unwritten state', async (t) => {
  const h = harness({}, { flushError: true }); t.after(() => h.close())
  h.start(); await drain()
  assert.equal(h.goal.activation, 'disarmed')
  assert.equal(h.queued.length, 0)
  assert.match(h.warnings.join('\n'), /disk full/)
})
