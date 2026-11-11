/**
 * `wait_subagent` — host-plane tool: explicit wait for direct continuable
 * children to settle.
 *
 * Contract (unchanged from the preset-local predecessor):
 * - `subagent_id` is a non-empty array; duplicates are deduped preserving input
 *   order, all ids are awaited concurrently.
 * - only the caller's direct children are accepted (fail fast for the rest).
 * - one shared timeout window; values below 15 minutes are raised to it.
 * - one short line per id (done + stopReason / timed out / cancelled /
 *   not started). The child's content belongs to the framework settlement
 *   notice; this tool never drains or re-narrates the parent inbox.
 * - a just-dispatched child that has not started yet gets a startup grace.
 *
 * Cross-turn correctness (the reason this is a host-plane rewrite):
 * the predecessor treated a childId-keyed `subagent/end` cache as "this turn is
 * done". A continuable child can be cold-resumed (new activation, new runId,
 * new start) or, while resident-idle, receive new input and start another turn;
 * in both windows the stale end was returned as if the new work had finished.
 * This implementation only settles on host-provable state:
 * - a `subagent/end` whose runId matches the most recent `subagent/start` (or
 *   was observed without any start since mount), paired with durable session
 *   state that proves no newer input is queued; and
 * - status `running` always keeps waiting; and
 * - the child's durable event log is consulted for the last
 *   `agent/inbox/spliced` (with inserted messages) versus the last `turn/end`:
 *   queued input after the last turn end means a turn is still owed → wait.
 * If the durable state cannot be read, the tool reports an unconfirmed state
 * instead of claiming success.
 *
 * Test seam: `installWaitTool(ctx, config)` expects the services already
 * present; `apply` wires it behind `ctx.inject`.
 */

export const name = 'tool-wait-subagent'

export const inject = ['tools', 'subagents', 'agents', 'sessionQuery']

/** Grace window for a just-dispatched child that has not started running yet. */
export const START_GRACE_MS = 30_000

/** Floor for a caller-supplied timeout_ms (15 minutes). */
export const MIN_TIMEOUT_MS = 15 * 60_000

/** Status polling interval while waiting. */
export const POLL_MS = 250

const DONE = (id, stopReason) => `subagent ${id} done (${stopReason || 'completed'}); its closing message follows as the settlement notice.`

/**
 * Install the tool on a context that already exposes all injected services.
 * @param ctx - runtime context with tools/subagents/agents/sessionQuery.
 * @returns disposer for the tool registration and event listeners.
 */
export function installWaitTool(ctx) {
  /** childId -> { runId, stopReason } — compact settlement projection (no child content retained). */
  const settled = new Map()
  /** childId -> { runId } — the most recent activation start observed since mount. */
  const started = new Map()
  /** childId -> Set<finish(outcome)> — active waiters. */
  const waiters = new Map()

  const statusOf = (id) => {
    const agent = ctx.agents.get(id)
    return agent === undefined ? 'ready' : agent.status === 'running' ? 'running' : 'idle'
  }

  const notify = (id) => {
    const list = waiters.get(id)
    if (list === undefined) return
    for (const finish of [...list]) void finish.check?.()
  }

  const offStart = ctx.on('subagent/start', (info) => {
    const id = info && info.id
    if (typeof id !== 'string') return
    started.set(id, { runId: info.runId })
    notify(id)
  })
  const offEnd = ctx.on('subagent/end', (info) => {
    const id = info && info.id
    if (typeof id !== 'string') return
    settled.set(id, { runId: info.runId, stopReason: info.stopReason })
    notify(id)
  })

  /**
   * Fold the child's own durable log suffix into its inbox/turn account.
   *
   * Two host facts are load-bearing here:
   * - `observeSession` reports `inheritedEventCount`; a fork-seeded child's
   *   prefix is the parent's history and must never be read as this child's own
   *   turn/splice (a parent turn/end would otherwise look like this child's).
   * - `agent/inbox/spliced` records both insertions and removals; a turn claims
   *   input by removing it (no `outcome`), while a cancellation removes it with
   *   `outcome: 'canceled'`. Folding queue lengths per target therefore clears
   *   input that was canceled or claimed instead of leaving a stale
   *   "queued after the last turn end" forever.
   * @param id - durable child session id.
   * @returns folded account, or undefined when the session cannot be read.
   */
  const readTurns = async (id) => {
    let lease
    try {
      lease = await ctx.sessionQuery.observeSession(id)
      const events = Array.isArray(lease?.events) ? lease.events : []
      const inherited = Number.isSafeInteger(lease?.inheritedEventCount) && lease.inheritedEventCount > 0
        ? lease.inheritedEventCount
        : 0
      const own = events.slice(inherited)
      const queue = { 'next-turn': 0, 'next-step': 0 }
      let lastInsert = -1
      let lastTurnEnd = -1
      let lastTurnStart = -1
      let lastCanceled = -1
      let reason
      for (let index = 0; index < own.length; index += 1) {
        const event = own[index]
        const seq = typeof event?.seq === 'number' ? event.seq : index
        if (event?.type === 'turn/start') lastTurnStart = seq
        else if (event?.type === 'turn/end') { lastTurnEnd = seq; reason = event.data?.reason }
        else if (event?.type === 'agent/inbox/spliced') {
          const data = event.data ?? {}
          const target = data.target === 'next-step' ? 'next-step' : 'next-turn'
          const inserted = Array.isArray(data.inserted) ? data.inserted.length : 0
          const removed = Number.isSafeInteger(data.removedCount) ? data.removedCount : 0
          if (inserted > 0) {
            queue[target] += inserted
            lastInsert = seq
          }
          if (removed > 0) {
            queue[target] = Math.max(0, queue[target] - removed)
            if (data.outcome === 'canceled') lastCanceled = seq
          }
        }
      }
      return {
        lastInsert,
        lastTurnEnd,
        lastTurnStart,
        lastCanceled,
        pending: queue['next-turn'] + queue['next-step'] > 0,
        reason,
      }
    } catch {
      return undefined
    } finally {
      try { lease?.[Symbol.dispose]?.() } catch { /* lease already released */ }
    }
  }

  /**
   * Decide one child's current state from host-provable facts only.
   *
   * A `subagent/end` paired with the latest `subagent/start` runId is the
   * activation's terminal edge, but it must not override newer runnable input:
   * a resident idle child can receive new input without a new `subagent/start`,
   * so the durable suffix still vetoes a matched end while `pending > 0`.
   * Canceled/claimed work folds to `pending === 0` and therefore does not veto.
   * When the durable state is unreadable, the matched pair settles only if the
   * child is no longer live (external provider with no local DSH session); a
   * live child stays `unconfirmed` rather than claiming success.
   * @returns {Promise<{kind:'running'|'pending-input'|'new-activation'|'awaiting-end'|'observation-changed'|'unconfirmed'|'ended-earlier'|'settled', info?, reason?}>}
   */
  const evaluate = async (id) => {
    if (statusOf(id) === 'running') return { kind: 'running' }
    const end = settled.get(id)
    const start = started.get(id)
    const turns = await readTurns(id)
    if (statusOf(id) === 'running') return { kind: 'running' }
    // Each lifecycle event replaces its entry, even if the runId is unchanged.
    // Discard a read spanning generations; the normal poller will read again.
    if (started.get(id) !== start || settled.get(id) !== end) return { kind: 'observation-changed' }
    const endMatchesStart = end !== undefined
      && (start === undefined || start.runId === undefined || end.runId === start.runId)
    if (end !== undefined && endMatchesStart) {
      if (turns !== undefined) {
        if (turns.pending) return { kind: 'pending-input' }
        return { kind: 'settled', info: end }
      }
      return statusOf(id) === 'ready'
        ? { kind: 'settled', info: end }
        : { kind: 'unconfirmed', reason: 'state-unreadable' }
    }
    if (end !== undefined && !endMatchesStart) return { kind: 'new-activation' }
    if (turns === undefined) return { kind: 'unconfirmed', reason: 'state-unreadable' }
    if (turns.pending) return { kind: 'pending-input' }
    if (statusOf(id) === 'ready' && turns.lastTurnEnd >= 0) return { kind: 'ended-earlier', reason: turns.reason }
    return { kind: 'awaiting-end' }
  }

  const tool = {
    name: 'wait_subagent',
    description: 'Wait for direct subagents (from subagent or subagent_fork) to finish their current turn. Pass every id in subagent_id; all are awaited together and each gets one done line, while its closing message arrives as the settlement notice right after. Use it when your next step needs the results, instead of messaging the child to check on it. Not for bash jobs (use job_output).',
    parameters: {
      type: 'object',
      properties: {
        subagent_id: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Durable ids returned by subagent or subagent_fork.',
        },
        timeout_ms: {
          type: 'integer',
          description: 'Optional shared wait window in ms; values below 900000 (15 minutes) are raised to 900000. Omit to wait until every child settles.',
        },
      },
      required: ['subagent_id'],
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      // Dedupe preserving input order; the schema already enforces a
      // non-empty array, the guard below only covers malformed direct calls.
      const ids = [...new Set(Array.isArray(args.subagent_id) ? args.subagent_id : [])]
      if (ids.length === 0) return 'subagent_id must be a non-empty array of subagent ids.'
      const parent = exec.agent
      if (parent === undefined) throw new Error('wait_subagent requires a calling agent (exec.agent was undefined)')

      // Verify every id is one of this agent's direct children — fail fast,
      // waiting for nobody (the contract the single-id version had).
      let entries
      try {
        entries = await ctx.subagents.listChildren(parent.id, exec.signal)
      } catch (error) {
        return 'listChildren failed: ' + (error && error.message ? error.message : String(error))
      }
      const known = new Set(entries.map((entry) => entry.id))
      const unknown = ids.filter((id) => !known.has(id))
      if (unknown.length > 0) {
        return `unknown subagent ${unknown.map((id) => `"${id}"`).join(', ')}: not a direct child of this agent (list_agents shows your children; only depth-1 children can be awaited).`
      }

      const startedAt = Date.now()
      const capMs = typeof args.timeout_ms === 'number' && args.timeout_ms > 0 ? Math.max(args.timeout_ms, MIN_TIMEOUT_MS) : undefined

      const lineOf = (id, outcome) => {
        if (outcome.kind === 'aborted') return `wait for subagent ${id} was aborted by user interruption; the child may still be running.`
        if (outcome.kind === 'timedOut') return `timed out waiting for subagent ${id}; it is still running. You will be notified when it finishes — you can wait_subagent it again or continue with other work.`
        if (outcome.kind === 'notStarted') {
          return `subagent ${id} has not started after ${Math.round(START_GRACE_MS / 1000)}s (status: ${statusOf(id)}). It may still be spinning up — call wait_subagent again, or continue with other work; you will be notified when it finishes.`
        }
        if (outcome.kind === 'unconfirmed') {
          return `subagent ${id} is not running, but its current turn state could not be confirmed (session state unavailable). Call wait_subagent again, or inspect it with list_agents before continuing.`
        }
        if (outcome.kind === 'endedEarlier') {
          return `subagent ${id} already finished its last turn (${outcome.reason?.kind ?? 'completed'}) and has no queued input; no new settlement was observed during this wait (its earlier notice was delivered before it). Use send_message to continue it if needed.`
        }
        // Real settlement: short done line; the framework's settlement notice
        // carries the closing message — nothing to consume or deduplicate.
        return DONE(id, outcome.info && outcome.info.stopReason)
      }

      /**
       * Wait for one child. Resolves with a terminal outcome kind. Each waiter
       * re-evaluates on `subagent/start` / `subagent/end`, on the shared
       * timeout, on abort, and on the poller; nothing is settled from a
       * childId-only cache.
       */
      const waitOne = (id) => new Promise((resolve) => {
        let done = false
        let timer
        let poller
        let checking = false
        const finish = (outcome) => {
          if (done) return
          done = true
          if (poller !== undefined) clearInterval(poller)
          if (timer !== undefined) clearTimeout(timer)
          if (exec.signal !== undefined) exec.signal.removeEventListener('abort', onAbort)
          const list = waiters.get(id)
          if (list !== undefined) {
            list.delete(finish)
            if (list.size === 0) waiters.delete(id)
          }
          resolve(outcome)
        }
        const onAbort = () => finish({ kind: 'aborted' })
        const check = async () => {
          if (done || checking) return
          checking = true
          try {
            const outcome = await evaluate(id)
            if (done) return
            if (outcome.kind === 'settled') { finish({ kind: 'settled', info: outcome.info }); return }
            // A child that truly ended (no live agent) with no queued input may
            // return immediately; this is not a stale-turn success because the
            // durable log proves its last turn was consumed.
            if (outcome.kind === 'ended-earlier') { finish({ kind: 'endedEarlier', reason: outcome.reason }); return }
            if (Date.now() - startedAt >= START_GRACE_MS
              && (outcome.kind === 'awaiting-end' || outcome.kind === 'pending-input'
                || outcome.kind === 'new-activation' || outcome.kind === 'unconfirmed')) {
              finish(outcome.kind === 'unconfirmed' ? { kind: 'unconfirmed' } : { kind: 'notStarted' })
            }
          } finally {
            checking = false
          }
        }
        // Expose the same check to event-driven notifications (start/end).
        finish.check = check
        const list = waiters.get(id) ?? new Set()
        list.add(finish)
        waiters.set(id, list)
        // All ids share startedAt, so one capMs value is one shared window.
        if (capMs !== undefined) timer = setTimeout(() => finish({ kind: 'timedOut' }), capMs)
        if (exec.signal !== undefined) {
          if (exec.signal.aborted) {
            finish({ kind: 'aborted' })
            return
          }
          exec.signal.addEventListener('abort', onAbort, { once: true })
        }
        if (done) return
        poller = setInterval(() => { void check() }, POLL_MS)
        void check()
      })

      const outcomes = await Promise.all(ids.map((id) => waitOne(id)))

      // Every waiter shares one abort signal, so an interruption either
      // aborts the whole batch or lands after some children already settled.
      // Collapse the all-aborted case into one line; mixed cases keep
      // per-id lines so the settled ones are not lost.
      if (outcomes.length > 0 && outcomes.every((outcome) => outcome.kind === 'aborted')) {
        return `wait for ${ids.length} subagent${ids.length === 1 ? '' : 's'} was aborted by user interruption; the children may still be running.`
      }
      return outcomes.map((outcome, index) => lineOf(ids[index], outcome)).join('\n')
    },
  }

  const offTool = ctx.tools.register(tool)
  return () => {
    offTool?.()
    offStart?.()
    offEnd?.()
    for (const list of waiters.values()) for (const finish of list) finish({ kind: 'aborted' })
    waiters.clear()
    settled.clear()
    started.clear()
  }
}

export function mountWaitSubagent(ctx, config) {
  ctx.inject(inject, (runtime) => {
    const dispose = installWaitTool(runtime, config)
    if (typeof runtime.effect === 'function') runtime.effect(() => dispose, 'better-subagent: wait_subagent tool')
  })
}
