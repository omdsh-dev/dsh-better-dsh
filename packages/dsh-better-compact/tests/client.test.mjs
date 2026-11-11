import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import TestRenderer from 'react-test-renderer'

const { createElement: h } = React
const act = TestRenderer.act ?? TestRenderer.default?.act
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SOURCE = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

function loadClient() {
  const registrations = []
  new Function('window', SOURCE)({
    __ModuleLoader__: { load: (entry) => registrations.push(entry) },
  })
  assert.equal(registrations.length, 1)
  const exports = new Function(
    'require',
    'return (' + registrations[0].factory.toString() + ')(require)',
  )((specifier) => {
    if (specifier === 'react') return React
    throw new Error('unexpected external require: ' + specifier)
  })
  return { entry: registrations[0], exports }
}

// ── fixtures ──────────────────────────────────────────────────────────────

function formValue(overrides = {}) {
  return {
    mode: 'goal',
    auto: true,
    thresholdRatio: 0.8,
    headroomTokens: 65536,
    summarizationProvider: '',
    summarizationModel: '',
    reasoningEffort: '',
    cachePriority: true,
    compactionRetries: 1,
    maxOverflowRetries: 1,
    modelPolicies: [],
    ...overrides,
  }
}

function activeConfig(overrides = {}) {
  return {
    ...formValue(),
    retainRatio: 0.16,
    retainTokens: null,
    maxTokens: 65536,
    ...overrides,
  }
}

function pluginPayload(overrides = {}) {
  return {
    activeConfig: activeConfig(),
    requiresReload: false,
    sessionId: null,
    engine: null,
    diagnostics: [],
    budget: null,
    preview: null,
    lastCompaction: null,
    handoffContinuation: null,
    ...overrides,
  }
}

function measuredBudget(overrides = {}) {
  return {
    target: { provider: 'p', model: 'm' },
    contextWindow: 200000,
    reservedCompletionTokens: 8000,
    messageBudgetTokens: 192000,
    headroomTokens: 32000,
    pressureBudgetTokens: 160000,
    ratioThresholdTokens: 160000,
    currentTokens: 142000,
    measurement: 'measured',
    fixedTokens: 12000,
    thresholdTokens: 160000,
    retainTokens: 20000,
    summaryMaxTokens: 8000,
    ...overrides,
  }
}

function sessionPayload(overrides = {}) {
  return {
    activeConfig: activeConfig(),
    requiresReload: false,
    sessionId: 'session-1',
    engine: { owner: 'host', inspectApplies: true, reason: null },
    diagnostics: [],
    budget: measuredBudget(),
    preview: {
      beforeTokens: 142000,
      afterUpperBoundTokens: 50098,
      retainedTokens: 30000,
      replacedTokens: 100000,
      checkpointFramingTokens: 98,
      rangeStart: 2,
      rangeEnd: 9,
      reason: null,
    },
    lastCompaction: {
      id: 'c1',
      trigger: 'automatic',
      status: 'completed',
      mode: 'goal',
      beforeTokens: 90000,
      afterTokens: 42000,
      durationMs: 1234,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      error: null,
    },
    handoffContinuation: null,
    ...overrides,
  }
}

function modelsPayload(overrides = {}) {
  return {
    enabled: true,
    routes: [{ provider: 'p', model: 'm', efforts: ['low', 'high'], defaultEffort: 'low' }],
    ...overrides,
  }
}

function router({ plugin = pluginPayload(), session = sessionPayload(), models = { enabled: false, routes: [] } } = {}) {
  return async (url) => {
    if (url === '/better-compact/api/models') return models
    if (url.startsWith('/better-compact/api/inspect?')) return session
    if (url === '/better-compact/api/inspect') return plugin
    throw new Error('unexpected read-only URL: ' + url)
  }
}

function httpError(status, body) {
  return { __httpError: true, status, body }
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function makeSessions(initial = {}) {
  let snapshot = {
    ids: [],
    byId: {},
    phase: 'ready',
    error: null,
    projectionsBySession: {},
    ...initial,
  }
  const listeners = new Set()
  return {
    list: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    set(next) {
      snapshot = { ...snapshot, ...next }
      for (const listener of [...listeners]) listener()
    },
  }
}

function makeForm(value, options = {}) {
  const mutateCalls = []
  const { revision = 3, writable = true, status = 'ready', mutateResult = true, mutateError = null } = options
  const form = {
    state: { status, writable, revision, value, base: {}, user: {} },
    async mutate(ops, expectedRevision) {
      mutateCalls.push({ ops, expectedRevision })
      if (mutateError !== null) throw mutateError
      if (mutateResult) {
        const next = { ...form.state.value }
        for (const op of ops) { if (op.op === 'unset') delete next[op.path[0]]; else next[op.path[0]] = op.value }
        form.state = { ...form.state, value: next, revision: form.state.revision + 1 }
      }
      return mutateResult
    },
  }
  return { form, mutateCalls }
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function renderPage(options = {}) {
  const { exports } = loadClient()
  const {
    value = formValue(),
    formOptions = {},
    sessions = makeSessions(),
    handler = router(),
  } = options
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const target = String(url)
    calls.push({ url: target, init })
    const body = await handler(target, init)
    if (body instanceof Error) throw body
    if (body !== null && typeof body === 'object' && body.__httpError === true) {
      return response(body.body, body.status)
    }
    return response(body)
  }
  const { form, mutateCalls } = makeForm(value, formOptions)
  const entry = exports.createConfigEntry(sessions)
  let tree
  await act(async () => {
    tree = TestRenderer.create(h(entry, { view: 'page', form }))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  const update = async (nextForm) => {
    await act(async () => {
      tree.update(h(entry, { view: 'page', form: nextForm }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  return { exports, entry, sessions, tree, form, mutateCalls, calls, update }
}

// ── tree helpers ──────────────────────────────────────────────────────────

function json(tree) {
  return JSON.stringify(tree.toJSON())
}

/** Text the user can see, excluding the injected stylesheet. */
function visibleText(tree) {
  const parts = []
  for (const node of tree.root.findAll((candidate) => typeof candidate.type === 'string' && candidate.type !== 'style')) {
    for (const child of node.children) {
      if (typeof child === 'string') parts.push(child)
    }
  }
  return parts.join('\n')
}

function hostNodes(tree, predicate) {
  return tree.root.findAll((node) => typeof node.type === 'string' && predicate(node.props ?? {}, node))
}

function byName(tree, name) {
  const nodes = hostNodes(tree, (props) => props.name === name)
  assert.ok(nodes.length > 0, `expected a control named ${name}`)
  return nodes[0]
}

function byData(tree, value) {
  return hostNodes(tree, (props) => props['data-bc'] === value)
}

function bySection(tree, name) {
  return hostNodes(tree, (props) => props['data-bc-section'] === name)
}

async function click(tree, node) {
  await act(async () => {
    node.props.onClick()
  })
}

async function change(tree, node, value) {
  if (node.props.role === 'combobox') {
    if (!node.props['aria-expanded']) await click(tree, node)
    const option = hostNodes(tree, (props) => props.role === 'option' && props['data-value'] === value)[0]
    assert.ok(option, 'expected option ' + value)
    await click(tree, option)
    return
  }
  await act(async () => {
    const displayValue = node.props.type === 'number' && node.props.name.endsWith('Ratio') && value !== '' ? String(Number(value) * 100) : value
    const control = node.props.type === 'radio' ? hostNodes(tree, (props) => props.name === node.props.name && props.value === value)[0] : node
    control.props.onChange({ target: { value: displayValue } })
  })
}

async function clickButton(tree, text) {
  const buttons = hostNodes(tree, (props, node) => node.type === 'button')
  const match = buttons.find((node) =>
    node.children.some((child) => typeof child === 'string' && child.includes(text)),
  )
  assert.ok(match, `expected a button containing "${text}"`)
  await click(tree, match)
  return match
}

async function unmount(tree) {
  await act(async () => tree.unmount())
}

// ── tests ─────────────────────────────────────────────────────────────────

test('one editor exposes capacity, strategy, generation and prompt sections without duplicate drawings', async () => {
  const { tree } = await renderPage()
  const names = [...new Set(hostNodes(tree, (props) => props['data-bc-section']).map((node) => node.props['data-bc-section']))]
  assert.deepEqual(names, ['process', 'capacity', 'strategy', 'generation', 'diagnostics'])
  const sectionFor = (name) => { let node = byName(tree, name); while (node && !node.props['data-bc-section']) node = node.parent; return node?.props['data-bc-section'] }
  for (const name of ['summaryRoute', 'reasoningEffort', 'maxTokens']) assert.equal(sectionFor(name), 'generation')
  assert.equal(sectionFor('thresholdRatio'), 'capacity')
  assert.equal(sectionFor('retainRatio'), 'capacity')
  assert.equal(sectionFor('cachePriority'), 'strategy')
  assert.equal(byData(tree, 'compaction-flow').length, 1)
  const diagnostics = byData(tree, 'diagnostics')[0]
  assert.ok(diagnostics)
  assert.equal(diagnostics.type, 'section')
  await unmount(tree)
})

test('inherited retention uses the schema default and distinguishes the running snapshot', async () => {
  const { tree, calls, mutateCalls } = await renderPage({
    handler: router({ plugin: pluginPayload({ requiresReload: true, activeConfig: activeConfig({ retainRatio: 0.23 }) }) }),
  })
  const input = byName(tree, 'retainRatio')
  assert.equal(input.props.value, '16')
  assert.equal(byData(tree, 'save-footer').length, 0, 'showing the inherited default does not create a draft edit')
  assert.match(visibleText(tree), /23%/, 'the existing running snapshot remains separately visible')
  await change(tree, input, '0.19')
  assert.equal(byName(tree, 'retainRatio').props.value, '19')
  assert.equal(mutateCalls.length, 0)
  assert.equal(calls.length, 2, 'draft edits do not fetch or invoke an LLM')
  await unmount(tree)
  const unknown = await renderPage({ handler: router({ plugin: pluginPayload({ activeConfig: null }) }) })
  assert.equal(byData(unknown.tree, 'active-config').length, 0, 'an unknown runtime snapshot does not add a permanent status banner')
  assert.equal(byName(unknown.tree, 'retainRatio').props.value, '16', 'the schema default is independent of the runtime snapshot')
  await unmount(unknown.tree)
})

test('model picker changes provider/model atomically and preserves incompatible effort', async () => {
  const { tree, calls, mutateCalls } = await renderPage({
    value: formValue({ summarizationProvider: 'old', summarizationModel: 'custom', reasoningEffort: 'ultra' }),
    handler: router({ models: modelsPayload() }),
  })
  const picker = byName(tree, 'summaryRoute')
  assert.equal(picker.props.role, 'combobox')
  await click(tree, picker)
  const choice = hostNodes(tree, (props) => props.role === 'option' && props['data-value'] === JSON.stringify(['p', 'm']))[0]
  assert.ok(choice)
  await click(tree, choice)
  assert.equal(byName(tree, 'summaryRoute').props.value, JSON.stringify(['p', 'm']))
  assert.equal(hostNodes(tree, (props) => props.name === 'summarizationProvider').length, 0)
  assert.equal(byName(tree, 'reasoningEffort').props.value, 'ultra')
  assert.match(byName(tree, 'reasoningEffort').children[0].children.join(''), /ultra · 未声明支持/)
  assert.equal(byData(tree, 'save-button')[0].props.disabled, true)
  await change(tree, byName(tree, 'reasoningEffort'), 'high')
  assert.equal(byData(tree, 'save-button')[0].props.disabled, false)
  await change(tree, byName(tree, 'summaryRoute'), '')
  assert.equal(byName(tree, 'summaryRoute').props.value, '')
  assert.equal(hostNodes(tree, (props) => props.name === 'summarizationProvider').length, 0)
  assert.equal(byName(tree, 'reasoningEffort').props.value, 'high')
  assert.equal(mutateCalls.length, 0)
  assert.equal(calls.length, 2)
  await unmount(tree)
})

test('client module identity, exports and slot registration stay stable', () => {
  const { entry, exports } = loadClient()
  assert.equal(entry.id, 'dsh-better-compact')
  assert.deepEqual(exports.inject, ['slots', 'sessions'])
  assert.deepEqual(exports.ROW_CONFIG_KEYS, [
    'dsh-better-compact#dsh-better-compact',
    '@menghuan1918/dsh-apollo#dsh-better-compact',
    'dsh-apollo#dsh-better-compact',
  ])
  const watchers = new Map()
  const registrations = []
  const slots = {
    inject(name, callback) {
      const set = watchers.get(name) ?? new Set()
      watchers.set(name, set)
      set.add(callback)
      return () => set.delete(callback)
    },
    register(options, component) {
      const record = { options, component }
      registrations.push(record)
      return () => {
        const index = registrations.indexOf(record)
        if (index >= 0) registrations.splice(index, 1)
      }
    },
    declare(name) {
      const disposers = []
      for (const callback of watchers.get(name) ?? []) disposers.push(callback())
      return disposers
    },
  }
  const sessions = makeSessions()
  const ctx = {
    slots,
    sessions,
    effect(fn, label) {
      assert.equal(typeof label, 'string')
      return fn()
    },
  }
  exports.apply(ctx)
  const disposers = slots.declare('plugins.row.config')
  assert.equal(registrations.length, 3)
  assert.deepEqual(
    registrations.map((record) => record.options.key),
    exports.ROW_CONFIG_KEYS,
  )
  for (const dispose of disposers) dispose()
  assert.equal(registrations.length, 0)
})

test('summary slot renders the stable one-line description', async () => {
  const { exports } = loadClient()
  let tree
  await act(async () => {
    tree = TestRenderer.create(h(exports.BetterCompactConfigEntry, { view: 'summary' }))
  })
  assert.match(json(tree), /压缩策略、上下文预算与会话诊断/)
  await unmount(tree)
})

test('page leads with the editable process and keeps secondary settings collapsed', async () => {
  const { tree, calls } = await renderPage()
  const markers = []
  for (const node of hostNodes(tree, () => true)) {
    const props = node.props
    if (['advanced', 'diagnostics'].includes(props['data-bc'])) markers.push(props['data-bc'])
    if (props['data-bc-section']) markers.push(props['data-bc-section'])
  }
  assert.deepEqual([...new Set(markers)], ['process', 'capacity', 'strategy', 'generation', 'advanced', 'diagnostics'])
  assert.equal(byData(tree, 'advanced')[0].props.open, undefined)
  assert.equal(byData(tree, 'diagnostics')[0].props.open, undefined)
  assert.deepEqual(calls.map((call) => call.url).sort(), ['/better-compact/api/inspect', '/better-compact/api/models'])
  await unmount(tree)
})

test('mode cards use radio semantics, keyboard selection and a disabled state', async () => {
  const { tree } = await renderPage()
  const group = hostNodes(tree, (props) => props.role === 'radiogroup')
  assert.ok(group.length >= 1)
  const radios = hostNodes(tree, (props) => props.role === 'radio')
  assert.equal(radios.length, 4)
  const goal = radios.find((node) => node.props['data-mode'] === 'goal')
  const handoff = radios.find((node) => node.props['data-mode'] === 'handoff')
  const native = radios.find((node) => node.props['data-mode'] === 'native')
  const custom = radios.find((node) => node.props['data-mode'] === 'custom')
  assert.equal(goal.props['aria-checked'], true)
  assert.equal(goal.props.tabIndex, 0)
  assert.equal(handoff.props['aria-checked'], false)
  assert.equal(handoff.props.tabIndex, -1)
  assert.equal(custom.props['aria-checked'], false)

  await act(async () => {
    goal.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  })
  assert.equal(handoff.props['aria-checked'], true)
  assert.equal(goal.props['aria-checked'], false)
  await act(async () => {
    native.props.onKeyDown({ key: ' ', preventDefault() {} })
  })
  assert.equal(native.props['aria-checked'], true)
  await unmount(tree)

  const disabled = await renderPage({ formOptions: { writable: false } })
  const disabledRadios = hostNodes(disabled.tree, (props) => props.role === 'radio')
  assert.ok(disabledRadios.every((node) => node.props['aria-disabled'] === true))
  const before = disabledRadios.find((node) => node.props['data-mode'] === 'goal').props['aria-checked']
  await click(disabled.tree, disabledRadios.find((node) => node.props['data-mode'] === 'handoff'))
  assert.equal(
    hostNodes(disabled.tree, (props) => props.role === 'radio' && props['data-mode'] === 'goal')[0].props['aria-checked'],
    before,
  )
  await unmount(disabled.tree)
})

test('strategy cards stay visible, carry content tags, and Home/End wrap four modes', async () => {
  const { tree } = await renderPage()
  assert.equal(byData(tree, 'mode-details').length, 0, 'there is no hidden mode-details disclosure')
  assert.equal(hostNodes(tree, (props) => props['data-bc-stage']).length, 0)
  assert.equal(hostNodes(tree, (props) => typeof props['data-diagram'] === 'string').length, 0)

  const radios = hostNodes(tree, (props) => props.role === 'radio')
  const goal = radios.find((node) => node.props['data-mode'] === 'goal')
  const custom = radios.find((node) => node.props['data-mode'] === 'custom')
  const native = radios.find((node) => node.props['data-mode'] === 'native')
  await act(async () => { goal.props.onKeyDown({ key: 'End', preventDefault() {} }) })
  assert.equal(hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] === 'custom')[0].props['aria-checked'], true)
  await act(async () => { custom.props.onKeyDown({ key: 'Home', preventDefault() {} }) })
  assert.equal(hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] === 'native')[0].props['aria-checked'], true)
  await act(async () => { native.props.onKeyDown({ key: 'ArrowLeft', preventDefault() {} }) })
  assert.equal(hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] === 'custom')[0].props['aria-checked'], true)
  await unmount(tree)
})

test('selected mode differing from the active snapshot is flagged for a profile reload', async () => {
  const { tree } = await renderPage({
    handler: router({
      plugin: pluginPayload({ requiresReload: true, activeConfig: activeConfig({ mode: 'native' }) }),
    }),
  })
  const goalCard = hostNodes(
    tree,
    (props) => props.role === 'radio' && props['data-mode'] === 'goal',
  )[0]
  const banner = byData(tree, 'active-config')[0]
  assert.ok(banner, 'the runtime/saved distinction stays visible in the shared banner')
  assert.match(visibleText(tree), /已保存配置与运行配置不同/)
  assert.equal(goalCard.props['aria-checked'], true)
  assert.match(visibleText(tree), /查看运行配置/)
  assert.equal(banner.props['data-requires-reload'], 'true')
  await unmount(tree)
})

test('native mode hides enhanced effort and cache controls but keeps saved values', async () => {
  const { tree } = await renderPage({
    value: formValue({
      mode: 'native',
      summarizationProvider: 'p',
      summarizationModel: 'm',
      reasoningEffort: 'ultra',
      cachePriority: true,
    }),
    handler: router({ models: modelsPayload() }),
  })
  assert.equal(hostNodes(tree, (props) => props.name === 'reasoningEffort').length, 0)
  assert.equal(hostNodes(tree, (props) => props.name === 'cachePriority').length, 0)
  assert.equal(byName(tree, 'summarizationProvider').props.disabled, false)
  assert.equal(hostNodes(tree, (props) => props['data-bc-error'] === 'reasoningEffort').length, 0)

  const goalCard = hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] === 'goal')[0]
  await click(tree, goalCard)
  assert.equal(byName(tree, 'reasoningEffort').props.disabled, false)
  assert.equal(byName(tree, 'reasoningEffort').props.value, 'ultra')
  assert.equal(byName(tree, 'cachePriority').props.disabled, false)
  assert.equal(hostNodes(tree, (props) => props['data-bc-error'] === 'reasoningEffort').length, 1)
  assert.match(json(tree), /p\/m 未声明支持强度/)
  await unmount(tree)
})

test('saved model and effort values stay visible and are marked when outside capabilities', async () => {
  const legacy = await renderPage({
    value: formValue({ summarizationProvider: 'legacy', summarizationModel: 'retired' }),
    handler: router({ models: modelsPayload() }),
  })
  assert.equal(byName(legacy.tree, 'summarizationProvider').props.value, 'legacy')
  assert.equal(byName(legacy.tree, 'summarizationModel').props.value, 'retired')
  assert.match(json(legacy.tree), /未列于宿主候选中/)
  assert.equal(byName(legacy.tree, 'summaryRoute').props.value, 'custom')
  assert.ok(byData(legacy.tree, 'route-warning')[0])
  await change(legacy.tree, byName(legacy.tree, 'thresholdRatio'), '0.7')
  await clickButton(legacy.tree, '保存设置')
  await flush()
  assert.equal(legacy.mutateCalls.length, 1, 'the candidate warning must not block a save')
  await unmount(legacy.tree)

  const effort = await renderPage({
    value: formValue({ summarizationProvider: 'p', summarizationModel: 'm', reasoningEffort: 'ultra' }),
    handler: router({ models: modelsPayload() }),
  })
  const select = byName(effort.tree, 'reasoningEffort')
  assert.equal(select.props.value, 'ultra')
  const savedOption = hostNodes(
    effort.tree,
    (props) => props.value === 'ultra',
  )[0]
  assert.ok(savedOption)
  assert.match(json(effort.tree), /p\/m 未声明支持强度/)
  assert.match(json(effort.tree), /ultra · 未声明支持/)
  await unmount(effort.tree)
})

test('provider/model clear as a pair and unknown capability is labelled', async () => {
  const paired = await renderPage({
    value: formValue({ summarizationProvider: 'p', summarizationModel: 'm' }),
    handler: router({ models: modelsPayload() }),
  })
  await change(paired.tree, byName(paired.tree, 'summarizationProvider'), '')
  assert.equal(byName(paired.tree, 'summarizationProvider').props.value, '')
  assert.equal(byName(paired.tree, 'summarizationModel').props.value, '')
  await unmount(paired.tree)

  const unknown = await renderPage({
    value: formValue({ summarizationProvider: 'p', summarizationModel: 'm' }),
    handler: router({ models: { enabled: false, routes: [] } }),
  })
  assert.equal(byName(unknown.tree, 'reasoningEffort').type, 'input')
  assert.match(byName(unknown.tree, 'reasoningEffort').props.placeholder, /能力未知/)
  assert.equal(byName(unknown.tree, 'reasoningEffort').props.value, '')
  await unmount(unknown.tree)
})

test('retention switches preserve both drafts and save only the active form', async () => {
  const { tree, mutateCalls } = await renderPage({
    value: formValue({ retainRatio: 0.2 }),
  })
  assert.ok(byName(tree, 'retainRatio'))
  await change(tree, byName(tree, 'retainMode'), 'tokens')
  assert.equal(hostNodes(tree, (props) => props.name === 'retainRatio').length, 0)
  await change(tree, byName(tree, 'retainTokens'), '1000')
  await change(tree, byName(tree, 'retainMode'), 'ratio')
  assert.equal(byName(tree, 'retainRatio').props.value, '20')
  await change(tree, byName(tree, 'retainRatio'), '0.25')
  await change(tree, byName(tree, 'retainMode'), 'tokens')
  assert.equal(byName(tree, 'retainTokens').props.value, '1000')
  await change(tree, byName(tree, 'retainMode'), 'ratio')
  assert.equal(byName(tree, 'retainRatio').props.value, '25')
  await change(tree, byName(tree, 'retainMode'), 'tokens')
  await clickButton(tree, '保存设置')
  await flush()
  assert.equal(mutateCalls.length, 1)
  const ops = mutateCalls[0].ops
  assert.ok(ops.some((op) => op.op === 'unset' && op.path[0] === 'retainRatio'))
  assert.ok(
    ops.some(
      (op) => op.op === 'set' && op.path[0] === 'retainTokens' && op.value === 1000,
    ),
  )
  await unmount(tree)
})

test('policy retention drafts survive inheritance and save only the selected value', async () => {
  const { tree, mutateCalls } = await renderPage({
    value: formValue({ modelPolicies: [{ provider: 'p', model: 'm', retainRatio: 0.2 }] }),
  })
  await change(tree, byName(tree, 'policies.0.retainMode'), 'tokens')
  await change(tree, byName(tree, 'policies.0.retainTokens'), '4096')
  await change(tree, byName(tree, 'policies.0.retainMode'), 'inherit')
  await change(tree, byName(tree, 'policies.0.retainMode'), 'ratio')
  assert.equal(byName(tree, 'policies.0.retainRatio').props.value, '20')
  await change(tree, byName(tree, 'policies.0.retainRatio'), '0.25')
  await change(tree, byName(tree, 'policies.0.retainMode'), 'tokens')
  assert.equal(byName(tree, 'policies.0.retainTokens').props.value, '4096')
  await change(tree, byName(tree, 'policies.0.retainMode'), 'ratio')
  assert.equal(byName(tree, 'policies.0.retainRatio').props.value, '25')
  await clickButton(tree, '保存设置')
  await flush()
  assert.equal(mutateCalls.length, 1)
  assert.deepEqual(mutateCalls[0].ops.find((op) => op.path[0] === 'modelPolicies').value,
    [{ provider: 'p', model: 'm', retainRatio: 0.25 }])
  await unmount(tree)
})

test('save sends one atomic mutation with the expected revision and preserves model policies', async () => {
  const { tree, mutateCalls } = await renderPage({
    value: formValue({
      retainRatio: 0.16,
      modelPolicies: [{ provider: 'p', model: 'm', maxTokens: 100 }],
    }),
  })
  const handoff = hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] === 'handoff')[0]
  await click(tree, handoff)
  await change(tree, byName(tree, 'summaryRoute'), 'custom')
  await change(tree, byName(tree, 'summarizationProvider'), 'p')
  await change(tree, byName(tree, 'summarizationModel'), 'm')
  await change(tree, byName(tree, 'thresholdRatio'), '0.7')
  await change(tree, byName(tree, 'headroomTokens'), '32768')
  await change(tree, byName(tree, 'retainMode'), 'tokens')
  await change(tree, byName(tree, 'retainTokens'), '8000')
  await act(async () => {
    byName(tree, 'cachePriority').props.onChange({ target: { checked: false } })
  })
  await change(tree, byName(tree, 'maxTokens'), '4096')
  await change(tree, byName(tree, 'compactionRetries'), '2')
  await change(tree, byName(tree, 'maxOverflowRetries'), '0')
  await act(async () => byName(tree, 'auto').props.onChange({ target: { checked: false } }))
  assert.match(json(tree), /p\/m/)
  assert.equal(byName(tree, 'policies.0.maxTokens').props.value, '100')

  await clickButton(tree, '保存设置')
  await flush()
  assert.equal(mutateCalls.length, 1)
  const { ops, expectedRevision } = mutateCalls[0]
  assert.equal(expectedRevision, 3)
  const find = (path) => ops.find((op) => op.path[0] === path)
  assert.deepEqual(find('mode'), { op: 'set', path: ['mode'], value: 'handoff' })
  assert.deepEqual(find('summarizationProvider'), { op: 'set', path: ['summarizationProvider'], value: 'p' })
  assert.deepEqual(find('summarizationModel'), { op: 'set', path: ['summarizationModel'], value: 'm' })
  assert.deepEqual(find('thresholdRatio'), { op: 'set', path: ['thresholdRatio'], value: 0.7 })
  assert.deepEqual(find('headroomTokens'), { op: 'set', path: ['headroomTokens'], value: 32768 })
  assert.deepEqual(find('retainTokens'), { op: 'set', path: ['retainTokens'], value: 8000 })
  assert.deepEqual(find('retainRatio'), { op: 'unset', path: ['retainRatio'] })
  assert.deepEqual(find('cachePriority'), { op: 'set', path: ['cachePriority'], value: false })
  assert.deepEqual(find('auto'), { op: 'set', path: ['auto'], value: false })
  assert.deepEqual(find('maxTokens'), { op: 'set', path: ['maxTokens'], value: 4096 })
  assert.deepEqual(find('compactionRetries'), { op: 'set', path: ['compactionRetries'], value: 2 })
  assert.deepEqual(find('maxOverflowRetries'), { op: 'set', path: ['maxOverflowRetries'], value: 0 })
  assert.equal(ops.some((op) => op.path[0] === 'modelPolicies'), false)
  await unmount(tree)
})

test('save success asks for a profile reload and sends no write HTTP', async () => {
  const { tree, mutateCalls, calls } = await renderPage()
  await change(tree, byName(tree, 'thresholdRatio'), '0.7')
  await clickButton(tree, '保存设置')
  await flush()
  assert.equal(mutateCalls.length, 1)
  const message = byData(tree, 'save-saved')[0]
  assert.ok(message)
  assert.match(json(tree), /已保存，重载 DSH 后生效/)
  assert.equal(byData(tree, 'save-footer').length, 0)
  assert.ok(calls.length >= 2)
  assert.ok(calls.every((call) => call.init.method === 'GET'))
  assert.ok(calls.every((call) => call.url.startsWith('/better-compact/api/')))
  await unmount(tree)
})

test('a host revision change surfaces a conflict instead of silently overwriting', async () => {
  const first = await renderPage()
  await change(first.tree, byName(first.tree, 'thresholdRatio'), '0.7')
  const external = {
    state: {
      ...first.form.state,
      revision: 4,
      value: formValue({ thresholdRatio: 0.75 }),
    },
    mutate: first.form.mutate,
  }
  await first.update(external)
  assert.ok(byData(first.tree, 'revision-conflict')[0])
  assert.match(json(first.tree), /配置已被其他页面更新/)
  const saveButton = byData(first.tree, 'save-button')[0]
  assert.equal(saveButton.props.disabled, true)
  await click(first.tree, saveButton)
  await flush()
  assert.equal(first.mutateCalls.length, 0)
  await clickButton(first.tree, '重新读取')
  await flush()
  assert.equal(byData(first.tree, 'revision-conflict').length, 0)
  assert.equal(byName(first.tree, 'thresholdRatio').props.value, '75')
  await unmount(first.tree)
})

test('a refused or failed save keeps the draft and never reports success', async () => {
  const refused = await renderPage({ formOptions: { mutateResult: false } })
  await change(refused.tree, byName(refused.tree, 'thresholdRatio'), '0.7')
  await clickButton(refused.tree, '保存设置')
  await flush()
  assert.ok(byData(refused.tree, 'save-rejected')[0])
  assert.match(json(refused.tree), /草稿已保留/)
  assert.equal(byName(refused.tree, 'thresholdRatio').props.value, '70')
  assert.equal(json(refused.tree).includes('已保存，重载后生效'), false)
  await unmount(refused.tree)

  const transported = await renderPage({
    formOptions: { mutateError: new Error('socket closed') },
  })
  await change(transported.tree, byName(transported.tree, 'thresholdRatio'), '0.7')
  await clickButton(transported.tree, '保存设置')
  await flush()
  const transport = byData(transported.tree, 'save-transport')[0]
  assert.ok(transport)
  assert.match(json(transported.tree), /socket closed/)
  assert.equal(byName(transported.tree, 'thresholdRatio').props.value, '70')
  assert.equal(json(transported.tree).includes('已保存，重载后生效'), false)
  await unmount(transported.tree)
})

test('threshold number updates draft metrics while runtime measurements remain unchanged', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { displayTitle: 'One' } } })
  const { tree, mutateCalls } = await renderPage({ sessions, handler: router({ session: sessionPayload() }) })
  await change(tree, byName(tree, 'thresholdRatio'), '0.6')
  assert.equal(byName(tree, 'thresholdRatio').props.value, '60')
  assert.equal(byData(tree, 'draft-trigger')[0].children.join(''), '120,000 tokens')
  await change(tree, byName(tree, 'thresholdRatio'), '0.5')
  assert.equal(byName(tree, 'thresholdRatio').props.value, '50')
  assert.equal(byData(tree, 'draft-trigger')[0].children.join(''), '100,000 tokens')
  assert.equal(byData(tree, 'runtime-trigger')[0].children.join(''), '160,000 tokens')
  assert.equal(byData(tree, 'current-tokens')[0].children.join(''), '142,000 tokens')
  assert.equal(mutateCalls.length, 0)
  await unmount(tree)
})

test('older inspect payload keeps measured values and discloses unavailable draft budget inputs', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { displayTitle: 'One' } } })
  const budget = measuredBudget()
  delete budget.reservedCompletionTokens
  delete budget.messageBudgetTokens
  const { tree } = await renderPage({ sessions, handler: router({ session: sessionPayload({ budget }) }) })
  assert.equal(byData(tree, 'current-tokens')[0].children.join(''), '142,000 tokens')
  assert.equal(byData(tree, 'runtime-trigger')[0].children.join(''), '160,000 tokens')
  assert.match(visibleText(tree), /200,000 tokens/)
  assert.ok(byData(tree, 'budget-incomplete')[0])
  assert.equal(byData(tree, 'draft-budget').length, 0)
  assert.equal(byData(tree, 'draft-window-bar').length, 0)
  assert.equal(byData(tree, 'draft-retain').length, 0, 'no allocation is fabricated without the window inputs')
  await unmount(tree)
})

test('budget unknowns stay unknown while measured values, framing and safe cut are shown', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { id: 'session-1', displayTitle: 'One', running: false } } })
  const unknown = await renderPage({ sessions, handler: router({ session: sessionPayload({
    budget: { contextWindow: null, currentTokens: null, measurement: 'unavailable', fixedTokens: null, thresholdTokens: null, retainTokens: null, summaryMaxTokens: null }, preview: null,
  }) }) })
  assert.ok(byData(unknown.tree, 'budget-incomplete')[0])
  assert.equal(/(?:^|[^\d,])0 tokens/.test(visibleText(unknown.tree)), false)
  assert.equal(visibleText(unknown.tree).includes('100%'), false)
  await unmount(unknown.tree)
  const measured = await renderPage({ sessions, handler: router({ session: sessionPayload() }) })
  assert.match(visibleText(measured.tree), /模型窗口/)
  assert.match(visibleText(measured.tree), /200,000 tokens/)
  assert.match(visibleText(measured.tree), /当前上下文/)
  assert.match(visibleText(measured.tree), /142,000 tokens/)
  assert.match(visibleText(measured.tree), /用量已校准/)
  assert.ok(byData(measured.tree, 'current-marker').length >= 1)
  assert.ok(hostNodes(measured.tree, (props) => props.className === 'dsh-bc-current-line').length >= 1)
  assert.match(visibleText(measured.tree), /实际数量可能略多/)
  assert.match(byData(measured.tree, 'safe-cut')[0].children.join(''), /选区 2–9/)
  assert.match(byData(measured.tree, 'safe-cut')[0].children.join(''), /50,098 tokens/)
  await unmount(measured.tree)
})

test('no safe cut and budget conflict reasons point at the controls to change', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { id: 'session-1', displayTitle: 'One', running: false } } })
  const { tree } = await renderPage({
    sessions,
    handler: router({
      session: sessionPayload({
        diagnostics: [
          'routed model reserves 64000 completion tokens of its 30000-token context window, leaving no message budget; configure a larger adapter contextWindow or a smaller maxTokens',
          'routed model retainTokens (20000) must be less than threshold tokens 16000; lower the retention budget or raise the trigger',
          'routed model retainTokens (20000) must be less than threshold tokens 16000; lower the retention budget or raise the trigger',
        ],
        preview: {
          beforeTokens: 142000,
          afterUpperBoundTokens: null,
          rangeStart: null,
          rangeEnd: null,
          reason: 'no safe compactable range: the session has no older balanced span left after the system prompt and retained tail',
        },
      }),
    }),
  })
  const text = json(tree)
  assert.ok(byData(tree, 'no-safe-cut')[0])
  assert.match(text, /模型容量不足/)
  assert.match(text, /保留预算与触发线冲突/)
  assert.match(text, /请调整摘要模型|请降低保留预算|请降低 headroomTokens/)
  assert.match(text, /固定前缀 \/ 近期保留未留出安全区间/)
  assert.equal((text.match(/模型容量不足/g) ?? []).length, 1)
  await unmount(tree)
})

test('compaction status distinguishes completed, unknown cache usage and persistence-error', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { id: 'session-1', displayTitle: 'One', running: false } } })
  const completed = await renderPage({ sessions, handler: router({ session: sessionPayload() }) })
  assert.ok(byData(completed.tree, 'last-compaction')[0])
  assert.match(json(completed.tree), /已完成 · 自动/)
  const cacheRows = hostNodes(completed.tree, (props) => props.className === 'dsh-bc-row').filter((node) => node.children.some((child) => typeof child === 'object' && child.findAll((part) => part.type === 'span' && part.children.includes('缓存读取')).length))
  assert.equal(cacheRows.length, 1)
  assert.match(visibleText(completed.tree), /未报告的数值显示为未知/)
  assert.equal(cacheRows[0].children[1].children.join(''), '未知', 'missing cache usage is never rendered as zero')
  await unmount(completed.tree)

  const persistence = await renderPage({
    sessions,
    handler: router({
      session: sessionPayload({
        lastCompaction: {
          id: 'c9',
          trigger: 'manual',
          status: 'persistence-error',
          mode: 'handoff',
          beforeTokens: 1000,
          afterTokens: null,
          durationMs: null,
          cacheReadTokens: null,
          cacheWriteTokens: null,
          error: 'flush failed',
        },
      }),
    }),
  })
  assert.match(json(persistence.tree), /持久化失败 · 手动/)
  assert.ok(byData(persistence.tree, 'persistence-error')[0])
  assert.match(json(persistence.tree), /摘要可能已写入，但会话保存失败/)
  assert.match(json(persistence.tree), /flush failed/)
  await unmount(persistence.tree)

  const usage = await renderPage({
    sessions,
    handler: router({
      session: sessionPayload({
        lastCompaction: {
          ...sessionPayload().lastCompaction,
          cacheReadTokens: 7,
          cacheWriteTokens: 3,
        },
      }),
    }),
  })
  assert.match(json(usage.tree), /缓存读取/)
  assert.match(json(usage.tree), /7 tokens/)
  assert.match(json(usage.tree), /缓存写入/)
  assert.match(json(usage.tree), /3 tokens/)
  await unmount(usage.tree)
})

test('handoff continuation and deduplicated diagnostics are shown', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { id: 'session-1', displayTitle: 'One', running: false } } })
  const { tree } = await renderPage({
    sessions,
    handler: router({
      session: sessionPayload({
        diagnostics: ['diagnostic one', 'diagnostic one', 'diagnostic two'],
        handoffContinuation: {
          compactionId: 'c1',
          status: 'skipped',
          blockers: ['a user question is still pending'],
          at: 1,
        },
      }),
    }),
  })
  const continuation = byData(tree, 'handoff-continuation')[0]
  assert.ok(continuation)
  assert.match(json(tree), /本次续作已跳过/)
  assert.match(json(tree), /a user question is still pending/)
  assert.equal(hostNodes(tree, (props, node) => node.type === 'button' && node.children.some((child) => typeof child === 'string' && child.includes('续作'))).length, 0, 'diagnostic continuation display has no scheduling action')
  assert.equal((json(tree).match(/diagnostic one/g) ?? []).length, 1)
  assert.match(json(tree), /diagnostic two/)
  await unmount(tree)
})

test('a foreign compaction engine suppresses budget/preview but keeps real records', async () => {
  const sessions = makeSessions({ ids: ['session-1'], byId: { 'session-1': { id: 'session-1', displayTitle: 'One', running: false } } })
  const { tree } = await renderPage({
    sessions,
    handler: router({
      session: sessionPayload({
        engine: { owner: 'foreign-preset', inspectApplies: false, reason: 'a different compaction engine owns this session' },
      }),
    }),
  })
  const text = json(tree)
  assert.match(text, /其他压缩引擎/)
  assert.equal(byData(tree, 'budget-window-bar').length, 0)
  assert.equal(byData(tree, 'safe-cut').length, 0)
  assert.ok(byData(tree, 'last-compaction')[0])
  assert.match(text, /已完成 · 自动/)
  assert.match(byData(tree, 'engine-note')[0].children.join(''), /其他压缩引擎/)
  await unmount(tree)
})

test('session selection fetches the chosen session, aborts stale requests and stays empty without sessions', async () => {
  const sessions = makeSessions({
    ids: ['session-1', 'session-2'],
    byId: {
      'session-1': { id: 'session-1', displayTitle: 'One', running: false },
      'session-2': { id: 'session-2', displayTitle: 'Two', running: true },
    },
  })
  const { tree, calls } = await renderPage({
    sessions,
    handler: router({
      session: sessionPayload(),
    }),
  })
  const firstCall = calls.find((call) => call.url.includes('sessionId=session-1'))
  assert.ok(firstCall)
  await change(tree, byName(tree, 'inspectSession'), 'session-2')
  await flush()
  const secondCall = calls.find((call) => call.url.includes('sessionId=session-2'))
  assert.ok(secondCall)
  assert.equal(firstCall.init.signal.aborted, true)
  await unmount(tree)

  const empty = await renderPage()
  assert.equal(empty.calls.some((call) => call.url.includes('sessionId=')), false)
  assert.match(json(empty.tree), /选择参考会话后可查看当前用量、预算与压缩记录/)
  assert.ok(byData(empty.tree, 'status-empty')[0])
  await unmount(empty.tree)
})

test('inspect failure leaves the form editable and never triggers a write', async () => {
  const { tree, mutateCalls, calls } = await renderPage({
    handler: async (url) => {
      if (url === '/better-compact/api/models') return { enabled: false, routes: [] }
      return httpError(404, { code: 'SESSION_NOT_FOUND', message: 'session is not visible' })
    },
  })
  assert.match(json(tree), /session is not visible/)
  assert.equal(byName(tree, 'thresholdRatio').props.disabled, false, 'a diagnostic failure does not lock settings')
  const handoff = hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] === 'handoff')[0]
  await click(tree, handoff)
  await clickButton(tree, '保存设置')
  await flush()
  assert.equal(mutateCalls.length, 1)
  assert.equal(mutateCalls[0].ops[0].value, 'handoff')
  assert.ok(calls.every((call) => call.init.method === 'GET'))
  await unmount(tree)
})

test('form loading, unavailable and missing states are explicit', async () => {
  const { exports } = loadClient()
  let tree
  await act(async () => {
    tree = TestRenderer.create(
      h(exports.BetterCompactConfigEntry, {
        view: 'page',
        form: { state: { status: 'loading', writable: false, revision: undefined, value: undefined } },
      }),
    )
  })
  assert.match(json(tree), /正在读取配置…/)
  await unmount(tree)

  await act(async () => {
    tree = TestRenderer.create(
      h(exports.BetterCompactConfigEntry, {
        view: 'page',
        form: { state: { status: 'unavailable', writable: false, revision: undefined, value: undefined } },
      }),
    )
  })
  assert.match(json(tree), /宿主未提供可编辑表单/)
  assert.equal(json(tree).includes('mode-cards'), false)
  await unmount(tree)

  await act(async () => {
    tree = TestRenderer.create(h(exports.BetterCompactConfigEntry, { view: 'page' }))
  })
  assert.match(json(tree), /等待宿主配置表单/)
  await unmount(tree)
})

test('page uses host theme tokens, reduced motion and labels every control', async () => {
  const { tree } = await renderPage()
  const styleNode = hostNodes(tree, (props, node) => node.type === 'style')[0]
  assert.ok(styleNode)
  const css = styleNode.children.join('')
  assert.match(css, /var\(--dsw-alias-/)
  assert.match(css, /var\(--dsw-focus-ring-/)
  assert.match(css, /font-variant-numeric:tabular-nums/)
  assert.match(css, /prefers-reduced-motion:reduce/)
  assert.match(css, /@container better-compact \(max-width:560px\)/)
  assert.match(css, /:focus-visible/)
  assert.ok(css.includes('--cfg-accent:var(--dsw-alias-state-business-primary,'))
  assert.ok(css.includes('--cfg-solid:var(--dsw-alias-button-primary-fill,'))
  assert.ok(css.includes('--cfg-on-accent:var(--dsw-alias-label-primary-foreground,'))
  assert.doesNotMatch(css, /(?:repeating-)?linear-gradient|stroke-dasharray|border-style:dashed/)
  assert.ok(css.includes('@media (max-width:640px), (pointer:coarse)'))
  assert.doesNotMatch(css.replace(/--cfg-[a-z-]+:[^;}]+/g, ''), /#[0-9a-fA-F]{3,8}\b/)

  const controls = hostNodes(tree, (props, node) => ['input', 'textarea'].includes(node.type) || props.role === 'combobox')
  assert.ok(controls.length >= 10)
  for (const control of controls) {
    assert.equal(typeof control.props.name, 'string', 'every control must carry a name')
    let labelled = typeof control.props['aria-label'] === 'string' && control.props['aria-label'].length > 0
    if (typeof control.props.id === 'string' && control.props.id.length > 0) {
      labelled = hostNodes(tree, (props) => props.htmlFor === control.props.id).length > 0
    }
    let parent = control.parent
    while (!labelled && parent !== null) {
      if (parent.type === 'label') labelled = true
      parent = parent.parent
    }
    assert.ok(labelled, `control ${control.props.name} must have an associated label`)
  }
  await unmount(tree)
})

test('client source contains no token-count or compaction-selection implementation', () => {
  assert.doesNotMatch(SOURCE, /tokenMeter|compactableRange|estimateMessage|estimateToolsTokens|selectCompactableRange/)
  assert.doesNotMatch(SOURCE, /\/better-compact\/api\/[a-z/]+['"`][\s\S]{0,200}method:\s*['"](?:POST|PUT|PATCH|DELETE)/)
  assert.match(SOURCE, /method: 'GET'/)
})

test('the bold capacity editor remains present in narrow layouts with native retention controls', async () => {
  const { tree } = await renderPage()
  assert.ok(byData(tree, 'process-editor')[0])
  assert.equal(byData(tree, 'capacity-bar').length, 1)
  const cards = hostNodes(tree, (props) => props.role === 'radio' && props['data-mode'] !== undefined)
  assert.equal(cards.length, 4)
  assert.ok(cards.every((card) => card.findAll((node) => node.type === 'svg').length === 0))
  assert.equal(byData(tree, 'runtime-preview').length, 0)
  const choices = hostNodes(tree, (props) => props.name === 'retainMode')
  assert.deepEqual(choices.map((node) => [node.props.type, node.props.value]), [['radio', 'ratio'], ['radio', 'tokens']])
  assert.equal(byName(tree, 'retainRatio').props.type, 'number')
  const css = hostNodes(tree, (props, node) => node.type === 'style')[0].children.join('')
  assert.ok(css.includes('@container better-compact (max-width:700px)'))
  assert.ok(css.includes('@container better-compact (max-width:560px)'))
  assert.ok(!css.includes('.dsh-bc-process-grid{display:none'))
  await unmount(tree)
})

test('manual-only compaction hides its trigger without discarding the configured ratio', async () => {
  const { tree } = await renderPage({ value: formValue({ auto: false, thresholdRatio: 0.73 }) })
  for (const name of ['thresholdRatio', 'retainRatio']) assert.equal(hostNodes(tree, (props) => props.name === name).length, 0)
  await act(async () => byName(tree, 'auto').props.onChange({ target: { checked: true } }))
  assert.equal(byName(tree, 'thresholdRatio').props.disabled, false)
  assert.equal(byName(tree, 'thresholdRatio').props.value, '73')
  await unmount(tree)
})

test('model policy edits save atomically and enforce retention and summary dependencies', async () => {
  const { tree, mutateCalls } = await renderPage()
  await click(tree, byData(tree, 'add-policy')[0])
  await change(tree, byName(tree, 'policies.0.provider'), 'custom')
  await change(tree, byName(tree, 'policies.0.model'), 'large')
  await change(tree, byName(tree, 'policies.0.thresholdRatio'), '0.1')
  await clickButton(tree, '保存设置')
  assert.equal(mutateCalls.length, 0, 'inherited retention cannot exceed a policy trigger')
  await change(tree, byName(tree, 'policies.0.retainMode'), 'tokens')
  await change(tree, byName(tree, 'policies.0.retainTokens'), '8000')
  await change(tree, byName(tree, 'policies.0.summaryMode'), 'custom')
  await change(tree, byName(tree, 'policies.0.summarizationProvider'), 'other')
  await clickButton(tree, '保存设置')
  assert.equal(mutateCalls.length, 0, 'summary provider and model must be a complete pair')
  await change(tree, byName(tree, 'policies.0.summarizationModel'), 'summary')
  await clickButton(tree, '保存设置')
  assert.equal(mutateCalls.length, 1)
  assert.equal(mutateCalls[0].expectedRevision, 3)
  assert.equal(mutateCalls[0].ops.length, 2)
  assert.deepEqual(mutateCalls[0].ops.find((op) => op.path[0] === 'modelPolicies'), { op: 'set', path: ['modelPolicies'], value: [{
    provider: 'custom', model: 'large', thresholdRatio: 0.1, retainTokens: 8000,
    summarizationProvider: 'other', summarizationModel: 'summary',
  }] })
  assert.deepEqual(mutateCalls[0].ops.find((op) => op.path[0] === 'retainTokens'), { op: 'unset', path: ['retainTokens'] })
  await unmount(tree)
})
