/**
 * Scoped React tests for the zero-build browser closure.
 *
 * Loads `src/client.js` through a fake `window.__ModuleLoader__` (no browser),
 * drives components with react-test-renderer@18, and verifies:
 *   - closure identity / service injection / slot registration;
 *   - the GoalBar renders the native goal projection and mutates through the
 *     CAS-checked `remote.goals` RPC, never commands.execute (so no
 *     command/run lifecycle is produced by UI buttons);
 *   - the CAS ref is read from the live projection at click time;
 *   - active+disarmed resume and activation event/reset refresh;
 *   - edit/pause/resume/clear/error paths and unlimited cap rendering;
 *   - the plugin-row settings form validates and saves the three volatile
 *     Config fields through the native form mutate(ops, revision) contract.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import TestRenderer from 'react-test-renderer'
import { DEFAULTS, ENTRY_ID, PACKAGE_NAME, ROW_CONFIG_KEY, UNLIMITED_ROUNDS } from '../src/config.js'

const { createElement: h } = React
const act = TestRenderer.act ?? TestRenderer.default?.act
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SESSION_ID = 'session-1'
const UNLIMITED = UNLIMITED_ROUNDS
/** The row-config key the Plugins page derives for Better DSH's declaring bundle. */
const BETTER_DSH_ROW_CONFIG_KEY = 'dsh-better-dsh#dsh-better-goal'
/** The row-config key the Plugins page derives for Apollo's declaring bundle. */
const APOLLO_ROW_CONFIG_KEY = 'dsh-apollo#dsh-better-goal'
/** The row-config key for Apollo's published scoped package. */
const SCOPED_APOLLO_ROW_CONFIG_KEY = '@menghuan1918/dsh-apollo#dsh-better-goal'
const SOURCE = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

/** Fake t: keeps keys and parameters visible without depending on copy. */
const t = (key, params) => (params === undefined ? key : key + '(' + JSON.stringify(params) + ')')

// ── loader / host fixtures ─────────────────────────────────────────────────

function loadClient() {
  const registrations = []
  new Function('window', SOURCE)({ __ModuleLoader__: { load: (entry) => registrations.push(entry) } })
  assert.equal(registrations.length, 1)
  const exports = new Function('require', 'return (' + registrations[0].factory.toString() + ')(require)')((specifier) => {
    if (specifier === 'react') return React
    throw new Error('unexpected external require: ' + specifier)
  })
  return { entry: registrations[0], exports }
}

function makeSlots() {
  const watchers = new Map()
  const registrations = []
  return {
    registrations,
    injected: [],
    inject(name, callback) {
      this.injected.push(name)
      const set = watchers.get(name) ?? new Set()
      watchers.set(name, set)
      set.add(callback)
      return () => set.delete(callback)
    },
    register(options, component) {
      const record = { options, component }
      registrations.push(record)
      return () => {
        const at = registrations.indexOf(record)
        if (at >= 0) registrations.splice(at, 1)
      }
    },
    declare(name) {
      const disposers = []
      for (const callback of [...(watchers.get(name) ?? [])]) {
        const dispose = callback()
        if (typeof dispose === 'function') disposers.push(dispose)
      }
      watchers.set(name, new Set(disposers))
      return disposers
    },
  }
}

/** Mutable live projection store exposed through the native binding face. */
function makeProjectionStore(initial) {
  let value = initial
  let running = false
  const projectionListeners = new Set()
  const sessionListeners = new Set()
  const face = {
    getSnapshot: () => value,
    subscribe: (listener) => {
      projectionListeners.add(listener)
      return () => projectionListeners.delete(listener)
    },
  }
  const session = {
    getSnapshot: () => ({ openState: 'open', running }),
    subscribe: (listener) => {
      sessionListeners.add(listener)
      return () => sessionListeners.delete(listener)
    },
    projections: {
      faceOf: (key) => (key === 'goal' ? face : { getSnapshot: () => undefined, subscribe: () => () => {} }),
    },
  }
  return {
    get value() { return value },
    set(next) {
      value = next
      for (const listener of [...projectionListeners]) listener()
    },
    /** Advance the projection without notifying observers (unrendered update). */
    setSilently(next) { value = next },
    binding: { session },
  }
}

/** Apply the closure against a minimal host face; returns observable wiring. */
function install({ projection = null, activation = 'armed', goalResults } = {}) {
  const slots = makeSlots()
  const projectionStore = makeProjectionStore(projection)
  const effects = []
  const dictionaries = []
  const commandCalls = []
  const goalCalls = []
  const goalReads = []
  const activationListeners = new Set()
  const resetListeners = new Set()
  let currentActivation = activation

  /** Default successful GoalView/GoalRef value for one mutation. */
  const successValue = (method, ref, request) => {
    if (method === 'clear') return { id: ref.id, revision: ref.revision + 1 }
    const goal = projectionStore.value?.goal ?? {}
    return {
      ...goal,
      id: ref.id,
      revision: ref.revision + 1,
      roundsStarted: projectionStore.value?.roundsStarted ?? 0,
      createdAt: 0,
      updatedAt: 0,
      activation: method === 'pause' ? 'disarmed' : 'armed',
      ...(method === 'edit' && typeof request?.objective === 'string'
        ? { objective: request.objective }
        : {}),
    }
  }

  /** Record one native goal mutation and optionally override its result. */
  const mutation = (method) => async (...args) => {
    const [sessionId, ref, request] = args
    goalCalls.push({ method, sessionId, ref, request })
    const override = goalResults?.[method]
    if (override !== undefined) return await override(...args)
    return { ok: true, value: successValue(method, ref, request) }
  }

  const goals = {
    get: async (sessionId) => {
      goalReads.push(sessionId)
      const current = projectionStore.value
      if (current?.goal === undefined || current?.goal === null) return { ok: true, value: undefined }
      return {
        ok: true,
        value: {
          ...current.goal,
          roundsStarted: current.roundsStarted ?? 0,
          createdAt: 0,
          updatedAt: 0,
          activation: currentActivation,
        },
      }
    },
    edit: mutation('edit'),
    pause: mutation('pause'),
    resume: mutation('resume'),
    clear: mutation('clear'),
  }
  const command = {
    execute: async (...args) => {
      commandCalls.push(args)
      return { ok: true, value: { commandId: 'command-1', result: { kind: 'success', text: 'ok' } } }
    },
  }
  const ctx = {
    effect(factory, label) {
      const dispose = factory()
      effects.push({ label, dispose })
      return dispose
    },
    locale: {
      register: (ns, dicts) => { dictionaries.push({ ns, dicts }); return () => {} },
      bind: () => t,
    },
    slots,
    sessions: {
      binding: () => projectionStore.binding,
      using: async (_sessionId, _options, operation) => operation({ binding: projectionStore.binding }),
    },
    remote: {
      commands: command,
      goals,
      $on: (event, listener) => {
        if (event !== 'goal/activation-changed') return () => {}
        activationListeners.add(listener)
        return () => activationListeners.delete(listener)
      },
    },
    on: (event, listener) => {
      if (event !== 'connection/reset') return () => {}
      resetListeners.add(listener)
      return () => resetListeners.delete(listener)
    },
  }
  const loaded = loadClient()
  loaded.exports.apply(ctx)
  return {
    ...loaded,
    slots,
    effects,
    dictionaries,
    commandCalls,
    goalCalls,
    goalReads,
    projectionStore,
    setActivation(next) { currentActivation = next },
    emitActivation(goal) {
      for (const listener of [...activationListeners]) listener({ sessionId: SESSION_ID, goal })
    },
    emitReset() {
      for (const listener of [...resetListeners]) listener()
    },
    declare(name) {
      slots.declare(name)
      const record = slots.registrations.find((entry) => entry.options.name === name)
      assert.ok(record, `slot ${name} registered`)
      return record
    },
  }
}

// ── DOM-ish helpers ────────────────────────────────────────────────────────

const isHost = (node) => typeof node.type === 'string'
const byLabel = (renderer, label) => renderer.root.findAll((node) => isHost(node) && node.props?.['aria-label'] === label)[0]
const byId = (renderer, id) => renderer.root.findAll((node) => isHost(node) && node.props?.id === id)[0]
const primaryButton = (renderer) => renderer.root.findAll((node) => isHost(node) && node.type === 'button' && node.props?.['data-variant'] === 'primary')[0]
const allText = (node) => {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(allText).join('')
  return allText(node.children ?? [])
}
const pageText = (renderer) => allText(renderer.toJSON())

function selectedChoice(renderer, name) {
  return renderer.root.find((node) => isHost(node) && node.type === 'input' && node.props.name === name && node.props.checked).props.value
}

async function chooseOption(renderer, trigger, label) {
  await act(async () => { trigger.props.onClick() })
  const option = renderer.root.findAll((node) => isHost(node) && node.props.role === 'option' && allText(node) === label)[0]
  assert.ok(option, 'option is available: ' + label)
  await act(async () => { option.props.onClick() })
}

// ── closure wiring ─────────────────────────────────────────────────────────

test('closure id, injected services, dictionaries, and every slot registration', () => {
  const setup = install()
  assert.equal(setup.entry.id, ENTRY_ID)
  assert.deepEqual(setup.exports.inject, ['slots', 'sessions', 'remote', 'remote.goals', 'locale'])
  assert.deepEqual(setup.slots.injected, ['conversation.input.dock', 'plugins.row.config'])
  assert.equal(setup.dictionaries.length, 1)
  assert.equal(setup.dictionaries[0].ns, 'better-goal')
  assert.deepEqual(
    Object.keys(setup.dictionaries[0].dicts.zh).sort(),
    Object.keys(setup.dictionaries[0].dicts.en).sort(),
  )
  // Every literal copy key referenced by a component exists in both locales.
  const usedKeys = [...SOURCE.matchAll(/tr\(t, '([^']+)'/g)].map((match) => match[1])
  for (const key of usedKeys) {
    assert.equal(typeof setup.dictionaries[0].dicts.zh[key], 'string', `zh copy for ${key}`)
    assert.equal(typeof setup.dictionaries[0].dicts.en[key], 'string', `en copy for ${key}`)
  }
  assert.deepEqual(setup.effects.map((entry) => entry.label), [
    'dsh-better-goal: dictionaries',
    'dsh-better-goal: GoalBar',
    'dsh-better-goal: row config page',
  ])
  setup.declare('conversation.input.dock')
  setup.declare('plugins.row.config')
  const rows = setup.slots.registrations.filter((entry) => entry.options.name === 'plugins.row.config')
  assert.equal(PACKAGE_NAME, 'dsh-better-goal')
  assert.deepEqual(
    rows.map((entry) => entry.options.key).sort(),
    [BETTER_DSH_ROW_CONFIG_KEY, APOLLO_ROW_CONFIG_KEY, ROW_CONFIG_KEY, SCOPED_APOLLO_ROW_CONFIG_KEY].sort(),
  )
  assert.equal(new Set(rows.map((entry) => entry.options.key)).size, rows.length, 'one entry per exact key')
  for (const row of rows) {
    assert.equal(row.component, rows[0].component, 'one entry component serves every key')
    assert.equal(row.options.locale, 'better-goal')
  }
  assert.equal(setup.slots.registrations.length, 5)
})

// ── GoalBar ────────────────────────────────────────────────────────────────

/** Minimal framework hook seat over one HostObservable source (stable subscriptions). */
function makeGoalActivationHook(source) {
  const subscribe = (listener) => source.subscribe(listener)
  const getSnapshot = () => source.getSnapshot()
  return function useGoalActivation(selector) {
    const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    return selector(snapshot)
  }
}

/** Yield once so the async activation read and React updates settle inside act(). */
async function flushAct() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
}

async function mountGoalBar({ projection, activation, goalResults, history }) {
  const setup = install({ projection, activation, goalResults })
  const record = setup.declare('conversation.input.dock')
  const injected = record.options.inject(SESSION_ID)
  const useProjection = (key) => key === 'goal' ? setup.projectionStore.value : key === 'better-goal-history' ? history : undefined
  const useGoalActivation = injected.hooks === undefined
    ? undefined
    : makeGoalActivationHook(injected.hooks.goalActivation)
  const element = () => h(record.component, { ...injected, useProjection, useGoalActivation, t })
  let renderer = null
  await act(async () => { renderer = TestRenderer.create(element()) })
  await flushAct()
  return {
    setup,
    injected,
    element,
    get renderer() { return renderer },
    async update(nextProjection) {
      setup.projectionStore.set(nextProjection)
      await act(async () => { renderer.update(element()) })
      await flushAct()
    },
    flush: flushAct,
  }
}

const activeGoal = {
  id: 'goal-1',
  revision: 4,
  objective: 'Ship the independent goal',
  phase: 'active',
  maxGoalRounds: UNLIMITED,
}

test('active GoalBar renders the projection, unlimited rounds, and pauses through remote.goals', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
  })
  const text = pageText(bar.renderer)
  assert.match(text, /phase\.active/)
  assert.match(text, /Ship the independent goal/)
  assert.match(text, /meta\.rounds/)
  assert.match(text, /cap\.unlimited/)
  assert.equal(
    bar.renderer.root.findAll((node) => isHost(node) && node.type === 'style' && node.props?.['data-plugin-css'] === 'dsh-better-goal/goal.css').length,
    1,
  )
  assert.equal(byLabel(bar.renderer, 'action.resume'), undefined)
  assert.ok(byLabel(bar.renderer, 'action.pause'))

  await act(async () => { await byLabel(bar.renderer, 'action.pause').props.onClick() })
  assert.equal(bar.setup.goalCalls.length, 1)
  assert.equal(bar.setup.goalCalls[0].method, 'pause')
  assert.equal(bar.setup.goalCalls[0].sessionId, SESSION_ID)
  assert.deepEqual(bar.setup.goalCalls[0].ref, { id: 'goal-1', revision: 4 })
  // No slash-command lifecycle: UI buttons never call commands.execute.
  assert.equal(bar.setup.commandCalls.length, 0)
})

test('UI mutation buttons never execute commands (no command/run lifecycle)', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
  })
  await act(async () => { await byLabel(bar.renderer, 'action.pause').props.onClick() })
  assert.equal(bar.setup.commandCalls.length, 0)
  assert.equal(bar.setup.goalCalls.length, 1)
  assert.equal(bar.setup.goalCalls[0].method, 'pause')
  assert.ok(bar.setup.commandCalls.length === 0, 'commands.execute must stay unused')
})

test('CAS ref is read from the live projection at click time, not the rendered snapshot', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
  })
  bar.setup.projectionStore.setSilently({
    goal: { ...activeGoal, revision: 9 },
    roundsStarted: 2,
  })
  // The rendered snapshot is still revision 4; the verb reads the live 9.
  await act(async () => { await byLabel(bar.renderer, 'action.pause').props.onClick() })
  assert.deepEqual(bar.setup.goalCalls[0].ref, { id: 'goal-1', revision: 9 })
  assert.equal(bar.setup.commandCalls.length, 0)
})

test('active+disarmed initializes from read-only remote.goals.get and offers UI resume', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
    activation: 'disarmed',
  })
  assert.ok(bar.setup.goalReads.length >= 1, 'activation was initialized through remote.goals.get')
  assert.match(pageText(bar.renderer), /phase\.active\.disarmed/)
  assert.equal(byLabel(bar.renderer, 'action.pause'), undefined)
  const resume = byLabel(bar.renderer, 'action.resume')
  assert.ok(resume)

  await act(async () => { await resume.props.onClick() })
  assert.equal(bar.setup.goalCalls.length, 1)
  assert.equal(bar.setup.goalCalls[0].method, 'resume')
  assert.deepEqual(bar.setup.goalCalls[0].ref, { id: 'goal-1', revision: 4 })
  assert.equal(bar.setup.commandCalls.length, 0)
})

test('activation-changed and connection/reset refresh the visible controls without mutation', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
    activation: 'armed',
  })
  assert.ok(byLabel(bar.renderer, 'action.pause'))
  assert.equal(byLabel(bar.renderer, 'action.resume'), undefined)

  await act(async () => {
    bar.setup.emitActivation({ id: 'goal-1', revision: 4, activation: 'disarmed' })
    await Promise.resolve()
  })
  assert.equal(byLabel(bar.renderer, 'action.pause'), undefined)
  assert.ok(byLabel(bar.renderer, 'action.resume'))
  assert.match(pageText(bar.renderer), /phase\.active\.disarmed/)

  bar.setup.setActivation('armed')
  await act(async () => {
    bar.setup.emitReset()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  assert.ok(byLabel(bar.renderer, 'action.pause'))
  assert.equal(byLabel(bar.renderer, 'action.resume'), undefined)
  assert.equal(bar.setup.commandCalls.length, 0, 'read-only activation observation never runs commands')
  assert.equal(bar.setup.goalCalls.length, 0, 'read-only activation observation never mutates goals')
})

test('edit opens inline form and saves a CAS-protected remote.goals.edit', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
  })
  await act(async () => { byLabel(bar.renderer, 'action.edit').props.onClick() })
  const input = byLabel(bar.renderer, 'objective.aria')
  assert.ok(input)
  assert.equal(input.props.value, activeGoal.objective)
  await act(async () => {
    input.props.onChange({ target: { value: '  Revised objective  ' } })
  })
  await act(async () => { await byLabel(bar.renderer, 'action.save').props.onClick() })
  assert.equal(bar.setup.goalCalls.length, 1)
  assert.equal(bar.setup.goalCalls[0].method, 'edit')
  assert.deepEqual(bar.setup.goalCalls[0].ref, { id: 'goal-1', revision: 4 })
  assert.deepEqual(bar.setup.goalCalls[0].request, { objective: 'Revised objective' })
  assert.equal(bar.setup.commandCalls.length, 0)
  assert.equal(byLabel(bar.renderer, 'objective.aria'), undefined)
})

test('paused goal offers resume and complete/goal-less states render nothing', async () => {
  const paused = await mountGoalBar({
    projection: { goal: { ...activeGoal, phase: 'paused' }, roundsStarted: 1 },
  })
  assert.ok(byLabel(paused.renderer, 'action.resume'))
  assert.equal(byLabel(paused.renderer, 'action.pause'), undefined)
  await act(async () => { await byLabel(paused.renderer, 'action.resume').props.onClick() })
  assert.equal(paused.setup.goalCalls[0].method, 'resume')
  assert.deepEqual(paused.setup.goalCalls[0].ref, { id: 'goal-1', revision: 4 })
  assert.equal(paused.setup.commandCalls.length, 0)

  for (const projection of [null, { goal: { ...activeGoal, phase: 'complete' }, roundsStarted: 4 }]) {
    const empty = await mountGoalBar({ projection })
    assert.equal(empty.renderer.toJSON(), null)
  }
})

test('successful clear hides the strip immediately while the projection catches up', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
  })
  await act(async () => { byLabel(bar.renderer, 'action.clear').props.onClick() })
  assert.equal(bar.setup.goalCalls.length, 0, 'the first click only arms clearing')
  await act(async () => { byLabel(bar.renderer, 'action.confirmClear').props.onClick(); await Promise.resolve() })
  assert.equal(bar.setup.goalCalls.length, 1)
  assert.equal(bar.setup.goalCalls[0].method, 'clear')
  assert.deepEqual(bar.setup.goalCalls[0].ref, { id: 'goal-1', revision: 4 })
  assert.equal(bar.setup.commandCalls.length, 0)
  assert.equal(bar.renderer.toJSON(), null)
})

test('remote error and local missing-goal failure render inline without a mutation', async () => {
  const bar = await mountGoalBar({
    projection: { goal: activeGoal, roundsStarted: 2 },
    goalResults: {
      clear: async () => ({ ok: false, error: { code: 'GOAL_STALE_REF', message: 'stale revision' } }),
    },
  })
  await act(async () => { byLabel(bar.renderer, 'action.clear').props.onClick() })
  assert.equal(bar.setup.goalCalls.length, 0, 'the first click only arms clearing')
  await act(async () => { byLabel(bar.renderer, 'action.confirmClear').props.onClick(); await Promise.resolve() })
  assert.match(pageText(bar.renderer), /stale revision \(GOAL_STALE_REF\)/)
  assert.match(pageText(bar.renderer), /phase\.active/)
  assert.equal(bar.setup.commandCalls.length, 0)

  const missing = await mountGoalBar({ projection: null })
  const local = await missing.injected.onPause()
  assert.deepEqual(local, {
    ok: false,
    error: { code: 'no-current-goal', message: 'no current goal to mutate' },
  })
  assert.equal(missing.setup.goalCalls.length, 0)
  assert.equal(missing.setup.commandCalls.length, 0)
})

// ── settings form ──────────────────────────────────────────────────────────

function makeConfigForm({ value = {}, writable = true, revision = 3 } = {}) {
  const snapshot = {
    status: 'ready',
    value,
    base: value,
    user: undefined,
    revision,
    writable,
  }
  const calls = []
  let resolve = null
  return {
    calls,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
    mutate(ops, expectedRevision) {
      calls.push({ ops, revision: expectedRevision })
      return new Promise((settle) => { resolve = settle })
    },
    finish(accepted) {
      assert.equal(typeof resolve, 'function', 'mutate is pending')
      const settle = resolve
      resolve = null
      settle(accepted)
    },
  }
}

async function mountSettings(options = {}) {
  const setup = install()
  const record = setup.declare('plugins.row.config')
  const controller = options.controller ?? makeConfigForm(options)
  const form = () => ({ state: controller.getSnapshot(), mutate: (ops, revision) => controller.mutate(ops, revision) })
  const element = () => h(record.component, { view: 'page', t, form: form() })
  let renderer = null
  await act(async () => { renderer = TestRenderer.create(element()) })
  return {
    setup,
    component: record.component,
    controller,
    get renderer() { return renderer },
    async update() { await act(async () => { renderer.update(element()) }) },
  }
}

function rowConfigEntries(setup) {
  return setup.slots.registrations.filter((entry) => entry.options.name === 'plugins.row.config')
}

/** Resolve one keyed slot the way the Plugins page does: exact key equality. */
function dispatchRowConfig(setup, key) {
  const matches = rowConfigEntries(setup).filter((entry) => entry.options.key === key)
  assert.equal(matches.length, 1, `exactly one keyed entry for ${key}`)
  return matches[0]
}

async function mountConfigEntry(record, controller) {
  const form = () => ({
    state: controller.getSnapshot(),
    mutate: (ops, revision) => controller.mutate(ops, revision),
  })
  const element = () => h(record.component, { view: 'page', t, form: form() })
  let renderer = null
  await act(async () => { renderer = TestRenderer.create(element()) })
  return {
    get renderer() { return renderer },
    async update() { await act(async () => { renderer.update(element()) }) },
  }
}

test('four exact row-config keys are unique and each dispatches one shared entry', () => {
  const setup = install()
  setup.declare('plugins.row.config')
  const expected = [ROW_CONFIG_KEY, BETTER_DSH_ROW_CONFIG_KEY, APOLLO_ROW_CONFIG_KEY, SCOPED_APOLLO_ROW_CONFIG_KEY]
  const rows = rowConfigEntries(setup)
  assert.equal(rows.length, 4, 'each assembly variant registers one row-config entry')
  assert.deepEqual(rows.map((entry) => entry.options.key).sort(), [...expected].sort())
  assert.equal(new Set(rows.map((entry) => entry.options.key)).size, 4, 'the four keys never collide')
  for (const key of expected) {
    const entry = dispatchRowConfig(setup, key)
    assert.equal(entry.options.locale, 'better-goal')
    assert.equal(entry.component, dispatchRowConfig(setup, expected[0]).component)
  }
})

test('standalone, Better DSH, legacy Apollo, and scoped Apollo keys dispatch the same page over one config store', async () => {
  const setup = install()
  setup.declare('plugins.row.config')
  const keys = [ROW_CONFIG_KEY, BETTER_DSH_ROW_CONFIG_KEY, APOLLO_ROW_CONFIG_KEY, SCOPED_APOLLO_ROW_CONFIG_KEY]
  const entries = keys.map((key) => dispatchRowConfig(setup, key))
  assert.equal(new Set(entries.map((entry) => entry.component)).size, 1)

  // One host form controller stands in for the single plugin row config store.
  const controller = makeConfigForm({
    value: { roundLimitMode: 'agent', roundLimit: 256, questionTimeoutSeconds: 120 },
  })
  const pages = new Map()
  for (const [index, key] of keys.entries()) pages.set(key, await mountConfigEntry(entries[index], controller))
  for (const key of keys) {
    assert.equal(selectedChoice(pages.get(key).renderer, 'dsh-better-goal-round-limit-mode'), 'agent')
  }
  assert.equal(controller.calls.length, 0, 'three mounted keys neither activate nor write the shared store')

  // A save through the scoped Apollo key writes the shared form exactly once.
  const scoped = pages.get(SCOPED_APOLLO_ROW_CONFIG_KEY)
  await act(async () => { byId(scoped.renderer, 'dsh-better-goal-round-limit-mode-fixed').props.onChange() })
  await act(async () => {
    byId(scoped.renderer, 'dsh-better-goal-round-limit').props.onChange({ target: { value: '512' } })
  })
  await act(async () => { primaryButton(scoped.renderer).props.onClick() })
  assert.equal(controller.calls.length, 1, 'one click writes once, not once per registered key')
  assert.deepEqual(controller.calls[0], {
    ops: [
      { op: 'set', path: ['roundLimitMode'], value: 'fixed' },
      { op: 'set', path: ['roundLimit'], value: 512 },
    ],
    revision: 3,
  })
  await act(async () => { controller.finish(true); await Promise.resolve() })

  // The host mirror's next revision reaches every keyed page unchanged.
  controller.getSnapshot = () => ({
    status: 'ready',
    value: { roundLimitMode: 'fixed', roundLimit: 512, questionTimeoutSeconds: 120 },
    base: undefined,
    user: undefined,
    revision: 4,
    writable: true,
  })
  for (const key of keys) await pages.get(key).update()
  for (const key of keys) {
    assert.equal(selectedChoice(pages.get(key).renderer, 'dsh-better-goal-round-limit-mode'), 'fixed')
    assert.equal(byId(pages.get(key).renderer, 'dsh-better-goal-round-limit').props.value, '512')
  }

})

test('settings page exposes defaults, fixed mode input, validation, and atomic save', async () => {
  const page = await mountSettings({
    value: { roundLimitMode: 'agent', roundLimit: 256, questionTimeoutSeconds: 120 },
  })
  assert.equal(page.renderer.root.findAll((node) => isHost(node) && node.type === 'h3' && node.props.className === 'dbg-title').length, 1)
  assert.match(pageText(page.renderer), /settingsTitle/)
  assert.match(pageText(page.renderer), /settingsIntro/)
  assert.equal(selectedChoice(page.renderer, 'dsh-better-goal-round-limit-mode'), 'agent')
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit'), undefined)
  assert.equal(
    page.renderer.root.findAll((node) => isHost(node) && node.type === 'style' && node.props?.['data-plugin-css'] === 'dsh-better-goal/settings.css').length,
    1,
  )
  assert.equal(primaryButton(page.renderer), undefined, 'unchanged settings have no save bar')

  await act(async () => { byId(page.renderer, 'dsh-better-goal-round-limit-mode-fixed').props.onChange() })
  const limit = byId(page.renderer, 'dsh-better-goal-round-limit')
  assert.equal(limit.props.value, '256')

  await act(async () => { limit.props.onChange({ target: { value: '0' } }) })
  assert.match(pageText(page.renderer), /invalidRoundLimit/)
  assert.equal(primaryButton(page.renderer).props.disabled, true)

  await act(async () => { byId(page.renderer, 'dsh-better-goal-round-limit').props.onChange({ target: { value: '1024' } }) })
  assert.equal(primaryButton(page.renderer).props.disabled, false)

  await act(async () => { primaryButton(page.renderer).props.onClick() })
  assert.equal(page.controller.calls.length, 1)
  assert.deepEqual(page.controller.calls[0], {
    ops: [
      { op: 'set', path: ['roundLimitMode'], value: 'fixed' },
      { op: 'set', path: ['roundLimit'], value: 1024 },
    ],
    revision: 3,
  })
  await act(async () => {
    page.controller.finish(true)
    await Promise.resolve()
  })
  assert.match(pageText(page.renderer), /saved/)
})

test('implementation choices swap the section, write native ops, and ask for reload', async () => {
  const page = await mountSettings({
    value: {
      implementation: 'enhanced',
      nativeDefaultMaxGoalRounds: 256,
      nativeBlockedAfterConsecutiveRounds: 3,
      roundLimitMode: 'agent',
      roundLimit: 256,
      questionTimeoutSeconds: 120,
    },
  })
  // 增强实现展示轮数策略段；原生装配参数随实现选择展开。
  assert.equal(selectedChoice(page.renderer, 'dsh-better-goal-implementation'), 'enhanced')
  assert.ok(byId(page.renderer, 'dsh-better-goal-round-limit-mode-agent'))
  assert.equal(byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds'), undefined)

  await act(async () => {
    byId(page.renderer, 'dsh-better-goal-implementation-native').props.onChange()
  })
  // 原生实现开放自身参数，增强策略收起并保留原值，不写入。
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit-mode-fixed'), undefined)
  assert.equal(byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds').props.value, '256')
  assert.equal(byId(page.renderer, 'dsh-better-goal-nativeBlockedAfterConsecutiveRounds').props.value, '3')

  await act(async () => {
    byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds').props.onChange({ target: { value: '0' } })
  })
  assert.match(pageText(page.renderer), /invalidNative/)
  assert.equal(primaryButton(page.renderer).props.disabled, true)

  await act(async () => {
    byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds').props.onChange({ target: { value: '7' } })
  })
  await act(async () => { byId(page.renderer, 'dsh-better-goal-implementation-enhanced').props.onChange() })
  assert.equal(selectedChoice(page.renderer, 'dsh-better-goal-round-limit-mode'), 'agent')
  assert.equal(byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds'), undefined)
  await act(async () => { byId(page.renderer, 'dsh-better-goal-implementation-native').props.onChange() })
  assert.equal(byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds').props.value, '7', 'switching away retains an inactive native draft')
  await act(async () => { primaryButton(page.renderer).props.onClick() })
  assert.equal(page.controller.calls.length, 1)
  assert.deepEqual(page.controller.calls[0], {
    ops: [
      { op: 'set', path: ['implementation'], value: 'native' },
      { op: 'set', path: ['nativeDefaultMaxGoalRounds'], value: 7 },
    ],
    revision: 3,
  })
  await act(async () => {
    page.controller.finish(true)
    await Promise.resolve()
  })
  // 实现/原生参数是装配时输入：保存成功必须提示重载，而不是宣称即时生效。
  assert.match(pageText(page.renderer), /saved/)
  assert.match(pageText(page.renderer), /reloadRequired/)
})

test('settings summary view and unavailable/read-only states', async () => {
  const setup = install()
  const record = setup.declare('plugins.row.config')
  let renderer = null
  await act(async () => {
    renderer = TestRenderer.create(h(record.component, { view: 'summary', t }))
  })
  assert.match(pageText(renderer), /summary/)

  const unavailable = makeConfigForm()
  unavailable.getSnapshot = () => ({ ...makeConfigForm().getSnapshot(), status: 'unavailable', writable: false })
  const page = await mountSettings({ controller: unavailable })
  assert.match(pageText(page.renderer), /unavailable/)
  assert.equal(primaryButton(page.renderer), undefined)
  const readonlyPage = await mountSettings({ writable: false })
  assert.match(pageText(readonlyPage.renderer), /readonly/)
  assert.ok(readonlyPage.renderer.root.findAll((node) => isHost(node) && node.type === 'input').every((node) => node.props.disabled))
  assert.equal(primaryButton(readonlyPage.renderer), undefined)
})

test('exported form helpers normalize defaults and validate drafts strictly', () => {
  const { shapeConfig, parseDraft, diffOps } = install().exports
  const { questionTimeoutSeconds, ...roundDefaults } = DEFAULTS
  assert.deepEqual(shapeConfig(undefined), roundDefaults)
  assert.deepEqual(shapeConfig({ roundLimitMode: 'nope', roundLimit: 0, questionTimeoutSeconds: 0 }), roundDefaults)
  assert.deepEqual(shapeConfig({ roundLimitMode: 'fixed', roundLimit: UNLIMITED, questionTimeoutSeconds: -1 }), {
    implementation: 'enhanced',
    nativeDefaultMaxGoalRounds: 256,
    nativeBlockedAfterConsecutiveRounds: 3,
    roundLimitMode: 'fixed',
    roundLimit: UNLIMITED,
    spinHintSeconds: 120,
    jobWaitSeconds: 2400,
  })
  // 0 is the off switch and must survive normalization; out-of-range falls back.
  assert.equal(shapeConfig({ spinHintSeconds: 0 }).spinHintSeconds, 0)
  assert.equal(shapeConfig({ spinHintSeconds: 3600 }).spinHintSeconds, 3600)
  assert.equal(shapeConfig({ spinHintSeconds: 3601 }).spinHintSeconds, 120)
  assert.equal(shapeConfig({ spinHintSeconds: -1 }).spinHintSeconds, 120)
  // jobWaitSeconds: 0 means "never wait" and must also survive normalization.
  assert.equal(shapeConfig({ jobWaitSeconds: 0 }).jobWaitSeconds, 0)
  assert.equal(shapeConfig({ jobWaitSeconds: 86400 }).jobWaitSeconds, 86400)
  assert.equal(shapeConfig({ jobWaitSeconds: 86401 }).jobWaitSeconds, 2400)
  assert.equal(shapeConfig({ jobWaitSeconds: -1 }).jobWaitSeconds, 2400)
  for (const bad of ['-1', '1.5', '86401', '', 'abc']) {
    assert.deepEqual(parseDraft({ implementation: 'enhanced', roundLimitMode: 'agent', spinHintSeconds: '120', jobWaitSeconds: bad }, roundDefaults), { error: 'invalidJobWait' })
  }
  assert.equal(parseDraft({ implementation: 'enhanced', roundLimitMode: 'agent', spinHintSeconds: '120', jobWaitSeconds: '0' }, roundDefaults).value.jobWaitSeconds, 0)
  assert.deepEqual(parseDraft({ implementation: 'enhanced', roundLimitMode: 'fixed', roundLimit: '1.5', spinHintSeconds: '120', questionTimeoutSeconds: '120' }, roundDefaults), {
    error: 'invalidRoundLimit',
  })
  for (const bad of ['-1', '1.5', '3601', '', 'abc']) {
    assert.deepEqual(parseDraft({ implementation: 'enhanced', roundLimitMode: 'agent', spinHintSeconds: bad }, roundDefaults), { error: 'invalidSpinHint' })
  }
  assert.equal(parseDraft({ implementation: 'enhanced', roundLimitMode: 'agent', spinHintSeconds: '0', jobWaitSeconds: '2400' }, roundDefaults).value.spinHintSeconds, 0)
  assert.deepEqual(parseDraft({ implementation: 'enhanced', roundLimitMode: 'agent', roundLimit: 'ignored', spinHintSeconds: '120', jobWaitSeconds: '2400', questionTimeoutSeconds: '-1' }, roundDefaults), {
    value: roundDefaults,
  })
  assert.deepEqual(diffOps(
    { roundLimitMode: 'agent', roundLimit: 256, spinHintSeconds: 120, jobWaitSeconds: 2400, questionTimeoutSeconds: 120 },
    { roundLimitMode: 'fixed', roundLimit: 10, spinHintSeconds: 0, jobWaitSeconds: 600, questionTimeoutSeconds: 120 },
  ), [
    { op: 'set', path: ['roundLimitMode'], value: 'fixed' },
    { op: 'set', path: ['roundLimit'], value: 10 },
    { op: 'set', path: ['spinHintSeconds'], value: 0 },
    { op: 'set', path: ['jobWaitSeconds'], value: 600 },
  ])
})

test('implementation choice saves only ownership, keeps legacy config, and hides inactive policy', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  const requests = []
  globalThis.fetch = async (url) => {
    requests.push(url)
    return { ok: true, json: async () => ({ activeConfig: { implementation: 'enhanced', nativeDefaultMaxGoalRounds: 256, nativeBlockedAfterConsecutiveRounds: 3 }, runtime: { implementation: 'enhanced' }, requiresReload: false }) }
  }
  const page = await mountSettings({ value: { implementation: 'enhanced', roundLimitMode: 'fixed', roundLimit: 12, questionTimeoutSeconds: 75 } })
  assert.equal(selectedChoice(page.renderer, 'dsh-better-goal-implementation'), 'enhanced')
  assert.match(pageText(page.renderer), /runtimeActive/)
  await act(async () => { byId(page.renderer, 'dsh-better-goal-round-limit').props.onChange({ target: { value: '23' } }) })
  await act(async () => { byId(page.renderer, 'dsh-better-goal-implementation-native').props.onChange() })
  await act(async () => { byId(page.renderer, 'dsh-better-goal-implementation-enhanced').props.onChange() })
  assert.equal(selectedChoice(page.renderer, 'dsh-better-goal-round-limit-mode'), 'fixed')
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit').props.value, '23', 'switching preserves the inactive enhanced draft')
  await act(async () => { byId(page.renderer, 'dsh-better-goal-implementation-native').props.onChange() })
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit-mode'), undefined)
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit'), undefined)
  assert.match(pageText(page.renderer), /reloadRequired/)
  const save = primaryButton(page.renderer).props.onClick
  await act(async () => { save(); save() })
  assert.deepEqual(page.controller.calls, [{ ops: [{ op: 'set', path: ['implementation'], value: 'native' }], revision: 3 }])
  assert.deepEqual(requests, ['/better-goal/api/config'])
  await act(async () => { page.controller.finish(true); await Promise.resolve() })
  assert.match(pageText(page.renderer), /saved/)
  assert.match(pageText(page.renderer), /reloadRequired/, 'saved ownership differs from loaded implementation until reload')
})

test('goal details expand without mutation and multiline editing uses a composition-safe shortcut', async () => {
  const bar = await mountGoalBar({ projection: { goal: activeGoal, roundsStarted: 2 } })
  await act(async () => { byLabel(bar.renderer, 'action.details').props.onClick() })
  assert.equal(byLabel(bar.renderer, 'action.details').props['aria-expanded'], true)
  assert.equal(bar.setup.goalCalls.length, 0)
  await act(async () => { byLabel(bar.renderer, 'action.edit').props.onClick() })
  const input = byLabel(bar.renderer, 'objective.aria')
  assert.equal(input.type, 'textarea')
  assert.equal(byLabel(bar.renderer, 'action.save').props.disabled, true)
  await act(async () => { input.props.onKeyDown({ key: 'Enter', ctrlKey: true, preventDefault() {} }) })
  assert.equal(bar.setup.goalCalls.length, 0, 'unchanged objectives do not create a revision')
  await act(async () => { input.props.onChange({ target: { value: 'Line one\nLine two' } }) })
  await act(async () => {
    byLabel(bar.renderer, 'objective.aria').props.onKeyDown({ key: 'Enter', ctrlKey: true, nativeEvent: { isComposing: true } })
  })
  assert.equal(bar.setup.goalCalls.length, 0, 'IME composition never commits an edit')
  await act(async () => {
    byLabel(bar.renderer, 'objective.aria').props.onKeyDown({ key: 'Enter', ctrlKey: true, nativeEvent: { isComposing: false }, preventDefault() {} })
  })
  assert.equal(bar.setup.goalCalls[0].request.objective, 'Line one\nLine two')
})

test('completed and cleared goals remain searchable in read-only session history', async () => {
  const entries = [
    { ...activeGoal, id: 'finished', objective: 'Release shipped', phase: 'complete', cleared: false, roundsStarted: 3, updatedAt: 100 },
    { ...activeGoal, id: 'removed', objective: 'Old prototype', phase: 'paused', cleared: true, roundsStarted: 2, updatedAt: 200 },
  ]
  const bar = await mountGoalBar({ projection: null, history: { entries, error: null } })
  assert.ok(byLabel(bar.renderer, 'action.history'))
  await act(async () => { byLabel(bar.renderer, 'action.history').props.onClick() })
  assert.match(pageText(bar.renderer), /Release shipped/)
  assert.match(pageText(bar.renderer), /Old prototype/)
  await act(async () => { byLabel(bar.renderer, 'history.search').props.onChange({ target: { value: 'release' } }) })
  assert.match(pageText(bar.renderer), /Release shipped/)
  assert.doesNotMatch(pageText(bar.renderer), /Old prototype/)
  await chooseOption(bar.renderer, byLabel(bar.renderer, 'history.all'), 'phase.cleared')
  assert.match(pageText(bar.renderer), /history.empty/)
  assert.equal(bar.setup.goalCalls.length, 0)
  assert.equal(bar.setup.commandCalls.length, 0)
})

test('existing native selection exposes its two policies and saves canonical fields only', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ activeConfig: { implementation: 'native', nativeDefaultMaxGoalRounds: 17, nativeBlockedAfterConsecutiveRounds: 5 }, runtime: { implementation: 'native' }, requiresReload: false }) })
  const page = await mountSettings({ value: { implementation: 'native', nativeDefaultMaxGoalRounds: 17, nativeBlockedAfterConsecutiveRounds: 5, roundLimitMode: 'fixed', roundLimit: 99 } })
  assert.equal(selectedChoice(page.renderer, 'dsh-better-goal-implementation'), 'native')
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit-mode'), undefined)
  const nativeCap = () => byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds')
  const nativeThreshold = () => byId(page.renderer, 'dsh-better-goal-nativeBlockedAfterConsecutiveRounds')
  assert.equal(nativeCap().props.value, '17')
  assert.equal(nativeThreshold().props.value, '5')
  assert.equal(nativeCap().props.disabled, false)
  assert.equal(nativeThreshold().props.disabled, false)
  await act(async () => { nativeCap().props.onChange({ target: { value: '0' } }) })
  assert.match(pageText(page.renderer), /invalidNative/)
  assert.equal(primaryButton(page.renderer).props.disabled, true)
  await act(async () => {
    nativeCap().props.onChange({ target: { value: '24' } })
    nativeThreshold().props.onChange({ target: { value: '2' } })
  })
  assert.match(pageText(page.renderer), /reloadRequired/)
  await act(async () => { primaryButton(page.renderer).props.onClick() })
  assert.deepEqual(page.controller.calls, [{ ops: [
    { op: 'set', path: ['nativeDefaultMaxGoalRounds'], value: 24 },
    { op: 'set', path: ['nativeBlockedAfterConsecutiveRounds'], value: 2 },
  ], revision: 3 }])
  await act(async () => { page.controller.finish(true); await Promise.resolve() })
  assert.match(pageText(page.renderer), /saved/)
  assert.match(pageText(page.renderer), /reloadRequired/)
})

test('settings dirty guard includes invalid input, ignores equivalent numbers, and clears after accepted save', async () => {
  const page = await mountSettings({ value: { roundLimitMode: 'fixed', roundLimit: 12 } })
  const root = () => page.renderer.root.find((node) => isHost(node) && node.props.className === 'dbg-cfg')
  const input = () => byId(page.renderer, 'dsh-better-goal-round-limit')
  assert.equal(root().props['data-settings-dirty'], false)
  assert.equal(primaryButton(page.renderer), undefined)
  await act(async () => { input().props.onChange({ target: { value: '' } }) })
  assert.equal(root().props['data-settings-dirty'], true)
  assert.equal(primaryButton(page.renderer).props.disabled, true)
  assert.equal(input().props['aria-describedby'], 'dsh-better-goal-round-limit-error')
  await act(async () => { input().props.onChange({ target: { value: '0012' } }) })
  assert.equal(root().props['data-settings-dirty'], false, 'formatting alone does not change the saved value')
  assert.equal(primaryButton(page.renderer), undefined)
  await act(async () => { input().props.onChange({ target: { value: '13' } }) })
  await act(async () => { primaryButton(page.renderer).props.onClick() })
  assert.equal(root().props['data-settings-busy'], true)
  assert.equal(primaryButton(page.renderer).props.disabled, true)
  await act(async () => { page.controller.finish(true); await Promise.resolve() })
  assert.equal(root().props['data-settings-busy'], false)
  assert.equal(root().props['data-settings-dirty'], false)
  assert.equal(primaryButton(page.renderer), undefined, 'success hides the save bar before the mirror advances')
  assert.match(pageText(page.renderer), /saved/)
  assert.equal(input().props.value, '13', 'accepted draft stays visible')
})

test('idle-spin threshold renders in every mode, takes 0 as off, and rejects out-of-range input', async () => {
  // The threshold belongs to the enhanced driver, so it renders for every round
  // policy mode there, and is absent when the native driver owns continuation.
  for (const value of [{ roundLimitMode: 'fixed', roundLimit: 12 }, { roundLimitMode: 'agent' }, { roundLimitMode: 'unlimited' }]) {
    const page = await mountSettings({ value })
    const input = byId(page.renderer, 'dsh-better-goal-spin-hint')
    assert.equal(input.props.value, '120', 'the documented default is shown')
    assert.equal(primaryButton(page.renderer), undefined, 'an untouched default is not a change')
  }
  const nativePage = await mountSettings({ value: { implementation: 'native' } })
  assert.equal(byId(nativePage.renderer, 'dsh-better-goal-spin-hint'), undefined, 'the native driver ignores the threshold')

  const page = await mountSettings({ value: { roundLimitMode: 'fixed', roundLimit: 12 } })
  const root = () => page.renderer.root.find((node) => isHost(node) && node.props.className === 'dbg-cfg')
  const input = () => byId(page.renderer, 'dsh-better-goal-spin-hint')
  await act(async () => { input().props.onChange({ target: { value: '3601' } }) })
  assert.equal(root().props['data-settings-dirty'], true)
  assert.equal(primaryButton(page.renderer).props.disabled, true)
  assert.equal(input().props['aria-describedby'], 'dsh-better-goal-spin-hint-error')
  await act(async () => { input().props.onChange({ target: { value: '0' } }) })
  assert.equal(root().props['data-settings-dirty'], true, '0 is a real change, not an empty value')
  assert.equal(primaryButton(page.renderer).props.disabled, false)
  await act(async () => { primaryButton(page.renderer).props.onClick() })
  assert.deepEqual(page.controller.calls.at(-1).ops, [{ op: 'set', path: ['spinHintSeconds'], value: 0 }])
})

test('failed save preserves the draft and inline recovery controls', async () => {
  const controller = makeConfigForm({ value: { roundLimitMode: 'fixed', roundLimit: 12 } })
  controller.mutate = async () => { throw new Error('offline') }
  const page = await mountSettings({ controller })
  await act(async () => { byId(page.renderer, 'dsh-better-goal-round-limit').props.onChange({ target: { value: '19' } }) })
  await act(async () => { primaryButton(page.renderer).props.onClick(); await Promise.resolve() })
  assert.match(pageText(page.renderer), /saveFailed.*offline/)
  assert.equal(byId(page.renderer, 'dsh-better-goal-round-limit').props.value, '19')
  assert.equal(primaryButton(page.renderer).props.disabled, false)
  assert.equal(page.renderer.root.find((node) => isHost(node) && node.props.className === 'dbg-cfg').props['data-settings-dirty'], true)
})

test('history combobox supports keyboard navigation and consumes Escape without changing the filter', async () => {
  const entries = [{ ...activeGoal, phase: 'complete', roundsStarted: 3, updatedAt: 100 }]
  const bar = await mountGoalBar({ projection: null, history: { entries, error: null } })
  await act(async () => { byLabel(bar.renderer, 'action.history').props.onClick() })
  const trigger = () => byLabel(bar.renderer, 'history.all')
  let prevented = 0
  let stopped = 0
  const key = async (value) => { await act(async () => { trigger().props.onKeyDown({ key: value, preventDefault() { prevented++ }, stopPropagation() { stopped++ } }) }) }
  assert.equal(trigger().props.role, 'combobox')
  await key('ArrowDown')
  assert.equal(trigger().props['aria-expanded'], true)
  await key('End')
  assert.match(trigger().props['aria-activedescendant'], /option-6$/)
  await key('Escape')
  assert.equal(stopped, 1, 'Escape does not close the host settings or conversation panel')
  assert.equal(trigger().props.value, 'all')
  assert.equal(trigger().props['aria-expanded'], false)
  await key('Home')
  await key('End')
  await key('Enter')
  assert.equal(trigger().props.value, 'archived')
  assert.match(pageText(bar.renderer), /history.empty/)
  assert.ok(prevented > 0)
  const clear = bar.renderer.root.find((node) => isHost(node) && node.type === 'button' && allText(node) === 'history.clearFilters')
  await act(async () => { clear.props.onClick() })
  assert.equal(trigger().props.value, 'all')
  assert.match(pageText(bar.renderer), /Ship the independent goal/)
  assert.equal(bar.setup.goalCalls.length, 0)
})

test('clear confirmation resets on blur, Escape, and a new goal revision', async () => {
  const bar = await mountGoalBar({ projection: { goal: activeGoal, roundsStarted: 2 } })
  await act(async () => { byLabel(bar.renderer, 'action.clear').props.onClick() })
  await act(async () => { byLabel(bar.renderer, 'action.confirmClear').props.onBlur() })
  assert.ok(byLabel(bar.renderer, 'action.clear'))
  await act(async () => { byLabel(bar.renderer, 'action.clear').props.onClick() })
  let stopped = false
  await act(async () => { byLabel(bar.renderer, 'action.confirmClear').props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true } }) })
  assert.equal(stopped, true)
  await act(async () => { byLabel(bar.renderer, 'action.clear').props.onClick() })
  await bar.update({ goal: { ...activeGoal, revision: 5 }, roundsStarted: 3 })
  assert.ok(byLabel(bar.renderer, 'action.clear'))
  assert.equal(byLabel(bar.renderer, 'action.confirmClear'), undefined)
  assert.equal(bar.setup.goalCalls.length, 0)
})

test('runtime diagnosis can retry without disabling configuration or writing it', async (context) => {
  const originalFetch = globalThis.fetch
  context.after(() => { globalThis.fetch = originalFetch })
  let requests = 0
  globalThis.fetch = async () => {
    if (++requests === 1) throw new Error('disconnected')
    return { ok: true, json: async () => ({ runtime: { implementation: 'native' }, requiresReload: false }) }
  }
  const page = await mountSettings({ value: { implementation: 'native', nativeBlockedAfterConsecutiveRounds: 5 } })
  assert.match(pageText(page.renderer), /runtimeUnavailable/)
  assert.equal(byId(page.renderer, 'dsh-better-goal-nativeDefaultMaxGoalRounds').props.disabled, false)
  const retry = page.renderer.root.find((node) => isHost(node) && node.type === 'button' && String(node.props.className).includes('dbg-runtimeRefresh'))
  await act(async () => { retry.props.onClick(); await Promise.resolve() })
  assert.equal(requests, 2)
  assert.match(pageText(page.renderer), /runtimeActive.*runtimeNative/)
  assert.equal(page.controller.calls.length, 0)
  assert.equal(primaryButton(page.renderer), undefined)
  assert.equal(page.renderer.root.findAll((node) => isHost(node) && node.props.className === 'dbg-advanced').length, 0)
})

test('Escape closes expanded field help before reaching the host modal', async () => {
  const page = await mountSettings({ value: { implementation: 'native' } })
  const help = page.renderer.root.findAll((node) => isHost(node) && String(node.props.className).includes('dbg-help'))[0]
  let focused = false
  let prevented = false
  let stopped = false
  const target = { open: true, querySelector: () => ({ focus() { focused = true } }) }
  await act(async () => { help.props.onKeyDown({ key: 'Escape', currentTarget: target, preventDefault() { prevented = true }, stopPropagation() { stopped = true } }) })
  assert.equal(target.open, false)
  assert.equal(prevented, true)
  assert.equal(stopped, true)
  assert.equal(focused, true)
  assert.equal(page.controller.calls.length, 0)
})

test('inactive policy drafts preserve existing canonical parameters without validating hidden input', () => {
  const { shapeConfig, parseDraft } = install().exports
  const host = shapeConfig({ implementation: 'native', nativeDefaultMaxGoalRounds: 17, nativeBlockedAfterConsecutiveRounds: 5, roundLimitMode: 'fixed', roundLimit: 99 })
  const enhanced = parseDraft({ implementation: 'enhanced', nativeDefaultMaxGoalRounds: 'invalid', nativeBlockedAfterConsecutiveRounds: '0', roundLimitMode: 'agent', roundLimit: 'ignored', spinHintSeconds: '120', jobWaitSeconds: '2400' }, host)
  assert.deepEqual(enhanced.value, { ...host, implementation: 'enhanced', roundLimitMode: 'agent' })
  const native = parseDraft({ implementation: 'native', nativeDefaultMaxGoalRounds: '17', nativeBlockedAfterConsecutiveRounds: '5', roundLimitMode: 'fixed', roundLimit: 'invalid', spinHintSeconds: '120', jobWaitSeconds: '2400' }, host)
  assert.deepEqual(native.value, host)
})
