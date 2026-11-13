/** Real React controls with host primitives replaced at the rendering boundary. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import React from 'react'
import { act, create } from 'react-test-renderer'

const compiled = await build({
  stdin: {
    contents: "export { QuestionReplyBubble } from './src/client/QuestionReplyView.tsx'; export { AskHistoryRow } from './src/client/AskHistoryRow.tsx'; export { QuestionComposer } from './src/client/QuestionComposer.tsx'; export { SettingsPage } from './src/client/settings.tsx'; export { PlanReviewPanel } from './src/client/PlanReviewPanel.tsx'; export { PendingQuestion } from './src/client/contract/slots.ts'; export { en } from './src/client/locales.ts';",
    resolveDir: new URL('..', import.meta.url).pathname,
    loader: 'tsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  plugins: [{ name: 'css-at-host-boundary', setup(builder) {
    builder.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
  } }],
})
const require = createRequire(import.meta.url)
const module = { exports: {} }
let clipboard = async () => true
const host = {
  Tooltip: ({ children }) => children,
  writeClipboard: (...args) => clipboard(...args),
  Button: ({ children, icon, variant, ...props }) => React.createElement('button', props, icon, children),
  ...Object.fromEntries(['IconCopyOutlineRegular', 'IconQuestionOutlineRegular', 'IconEditOutlineRegular', 'IconCheckOutlineRegular', 'IconChevronDownOutlineRegular', 'IconChevronLeftOutlineRegular', 'IconChevronRightOutlineRegular', 'IconChevronUpOutlineRegular', 'IconCloseOutlineRegular'].map(name => [name, () => null])),
  MarkdownText: ({ text }) => React.createElement('span', null, text),
  extractMarkdownPlainText: text => text.replace(/^#+\s*/, '').split('\n')[0],
}
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? host : require(id), module, module.exports)
const { QuestionReplyBubble, AskHistoryRow, QuestionComposer, SettingsPage, PlanReviewPanel, PendingQuestion, en } = module.exports
const byId = (tree, id) => tree.root.find(node => typeof node.type === 'string' && node.props.id === id)
const change = (tree, id, value) => act(() => {
  const first = byId(tree, id)
  const node = first.props.role === 'radiogroup'
    ? first.findAllByType('input').find(input => input.props.value === value)
    : first
  assert.ok(node, id + ' has choice ' + value)
  node.props.onChange({ target: { value } })
})
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.includes(text) || node.findAllByType('span').some(span => span.children.includes(text)))
const values = { questionTimeoutSeconds: 300, timeoutBehavior: 'native', goalTimeoutBehavior: 'default' }

function settings(value = values, mutate = async () => true, writable = true) {
  const form = { state: { status: 'ready', revision: 7, writable, value }, mutate }
  let tree
  act(() => { tree = create(React.createElement(SettingsPage, { form })) })
  return { tree, form }
}

test('settings covers all three schema fields and saves exact revisioned changes', async () => {
  const writes = []
  const { tree } = settings(values, async (...args) => { writes.push(args); return true })
  change(tree, 'better-ask-user-wait', '45')
  change(tree, 'better-ask-user-behavior', 'default')
  change(tree, 'better-ask-user-goal-behavior', 'native')
  await act(async () => { button(tree, 'Save').props.onClick() })
  assert.deepEqual(writes, [[[
    { op: 'set', path: ['questionTimeoutSeconds'], value: 45 },
    { op: 'set', path: ['timeoutBehavior'], value: 'default' },
    { op: 'set', path: ['goalTimeoutBehavior'], value: 'native' },
  ], 7]])
  act(() => tree.unmount())
})

test('unlimited wait hides dependent controls, retains their values and restores duration', async () => {
  const writes = []
  const { tree } = settings(values, async (...args) => { writes.push(args); return true })
  change(tree, 'better-ask-user-wait-mode', 'unlimited')
  assert.equal(tree.root.findAllByType('input').filter(node => node.props.type !== 'radio').length, 0)
  assert.equal(tree.root.findAllByProps({ id: 'better-ask-user-behavior' }).length, 0, 'timeout cards hide without a countdown')
  assert.equal(tree.root.findAllByProps({ id: 'better-ask-user-goal-behavior', role: 'radiogroup' }).length, 1, 'goal behavior stays visible without a countdown')
  await act(async () => { button(tree, 'Save').props.onClick() })
  assert.deepEqual(writes[0], [[{ op: 'set', path: ['questionTimeoutSeconds'], value: -1 }], 7])
  change(tree, 'better-ask-user-wait-mode', 'timed')
  assert.equal(byId(tree, 'better-ask-user-wait').props.value, '300')
  assert.equal(byId(tree, 'better-ask-user-goal-behavior-native').props.disabled, false)
  assert.equal(byId(tree, 'better-ask-user-goal-behavior-default').props.checked, true)
  act(() => tree.unmount())
})

test('invalid duration blocks saving and a newer host revision replaces stale drafts', () => {
  const { tree, form } = settings()
  change(tree, 'better-ask-user-wait', '0')
  assert.equal(button(tree, 'Save').props.disabled, true)
  assert.equal(byId(tree, 'better-ask-user-wait').props['aria-invalid'], true)
  assert.equal(byId(tree, 'better-ask-user-error').props.role, 'alert')
  act(() => { tree.update(React.createElement(SettingsPage, { form: { ...form, state: { ...form.state, revision: 8, value: { ...values, questionTimeoutSeconds: 60 } } } })) })
  assert.equal(byId(tree, 'better-ask-user-wait').props.value, '60')
  assert.equal(button(tree, 'Save'), undefined)
  act(() => tree.unmount())
})

test('a rejected settings revision preserves the draft and reports the conflict', async () => {
  const { tree } = settings(values, async () => false)
  change(tree, 'better-ask-user-wait', '60')
  await act(async () => button(tree, 'Save').props.onClick())
  assert.equal(byId(tree, 'better-ask-user-wait').props.value, '60')
  assert.ok(JSON.stringify(tree.toJSON()).includes('changed in another window'))
  act(() => tree.unmount())
})

test('read-only settings disables every editable control', () => {
  const { tree } = settings(values, undefined, false)
  for (const node of [...tree.root.findAllByType('input'), ...tree.root.findAllByType('select'), ...tree.root.findAllByType('button')]) assert.equal(node.props.disabled, true)
  act(() => tree.unmount())
})

const t = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace('{' + name + '}', value), en[key] ?? key)
function plan(mode = 'default') {
  const questions = [{ id: 'plan', question: 'Review?', detail: '# Work', options: [{ label: 'Approve original' }, { label: 'Decline original' }] }]
  const pending = new PendingQuestion('session', questions, 'plan-call', undefined, undefined, { waitMs: 5000, timeoutMode: mode, defaultAnswer: { answers: [{ id: 'plan', selected: ['Approve original'] }], autoSelected: true } })
  let answer
  const channel = { deadline: Date.now() + 5000, resolve: value => { answer = value }, reject: () => {}, delegate: () => {} }
  pending.attachWaterfall(channel)
  const review = { id: 'plan', question: 'Review?', plan: '# Work', approve: questions[0].options[0], decline: questions[0].options[1] }
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = { addEventListener() {}, removeEventListener() {}, activeElement: null, hidden: false }
  let tree
  act(() => { tree = create(React.createElement(PlanReviewPanel, { pending, review, t, renderSlot: () => null, useQuestionCard: (_key, select) => select(React.useSyncExternalStore(pending.subscribe, pending.getSnapshot)) })) })
  return { tree, pending, channel, get answer() { return answer }, close() { act(() => tree.unmount()); pending.close(); delete globalThis.window; delete globalThis.document } }
}

test('plan review shows auto policy and Take time stops the actual countdown', () => {
  const h = plan()
  try {
    assert.ok(JSON.stringify(h.tree.toJSON()).includes(en['wait.auto']))
    const wait = () => h.tree.root.findByProps({ 'data-question-wait': true })
    assert.equal(wait().props['data-wait-state'], 'counting')
    const remaining = h.tree.root.find(node => node.type === 'circle' && node.props.pathLength === '100')
    assert.ok(remaining.props.strokeDashoffset >= 0 && remaining.props.strokeDashoffset < 10, 'progress reflects the real remaining wait')
    act(() => h.pending.holdFocus())
    assert.equal(wait().props['data-wait-state'], 'paused')
    assert.ok(JSON.stringify(h.tree.toJSON()).includes(en['wait.pauseLabel']))
    act(() => h.pending.releaseFocus())
    assert.equal(wait().props['data-wait-state'], 'counting')
    act(() => button(h.tree, en['wait.takeTime']).props.onClick())
    assert.equal(h.pending.snapshot().waitState, 'waiting')
    act(() => h.pending.timeout())
    assert.equal(h.answer, undefined)
    assert.ok(JSON.stringify(h.tree.toJSON()).includes(en['wait.held']))
  } finally { h.close() }
})

test('plan approval submits the original option label', async () => {
  const h = plan('native')
  try {
    await act(async () => button(h.tree, en['plan.approve']).props.onClick())
    assert.deepEqual(h.answer, { answers: [{ id: 'plan', selected: ['Approve original'] }] })
  } finally { h.close() }
})

test('plan decline submits its own option label', async () => {
  const h = plan('native')
  try {
    await act(async () => button(h.tree, 'Decline original').props.onClick())
    assert.deepEqual(h.answer, { answers: [{ id: 'plan', selected: ['Decline original'] }] })
  } finally { h.close() }
})

test('plan controls recover when foreground settlement becomes a late reply', async () => {
  const h = plan('native')
  try {
    await act(async () => button(h.tree, en['plan.approve']).props.onClick())
    assert.equal(button(h.tree, en['plan.approve']).props.disabled, true)
    act(() => {
      h.pending.detachWaterfall(h.channel)
      h.pending.attachRpc({ answer: async () => {}, dismiss: async () => {} })
      h.pending.setState('continued')
    })
    assert.equal(button(h.tree, en['plan.approve']).props.disabled, false)
    assert.ok(JSON.stringify(h.tree.toJSON()).includes(en['error.resubmit']))
    assert.ok(JSON.stringify(h.tree.toJSON()).includes(en['wait.continued']))
  } finally { h.close() }
})


const rowArgs = JSON.stringify({ questions: [{ id: 'q', question: 'Pick', detail: '**Context**', multi_select: true, options: [{ label: 'A' }] }] })

function rowProps({ callId = 'history-call', state = { live: false, projected: undefined }, reveal, review } = {}) {
  return {
    callId,
    t,
    useProjection: (_key, select) => select(state.projected),
    useQuestionPanelLive: (_key, select = value => value) => select(state.live),
    revealPanel: reveal ?? (() => true),
    reviewPanel: review ?? (() => true),
  }
}

test('history row opens a live card, then reviews a settled call with full question details', () => {
  const calls = []
  const state = { live: true }
  const props = rowProps({
    state,
    reveal: id => { calls.push(['open', id]); return true },
    review: (id, record) => { calls.push(['review', id, record]); return true },
  })
  let tree
  act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'result', block: { kind: 'tool-result', call: { argsRaw: rowArgs }, content: [{ type: 'text', text: JSON.stringify({ pending: true }) }] } })) })
  act(() => button(tree, 'Open').props.onClick())
  assert.deepEqual(calls, [['open', 'history-call']])
  const answers = [{ id: 'q', selected: ['A'] }]
  state.live = false
  act(() => { tree.update(React.createElement(AskHistoryRow, { ...props, phase: 'result', block: { kind: 'tool-result', call: { argsRaw: rowArgs }, content: [{ type: 'text', text: JSON.stringify({ answers }) }] } })) })
  act(() => button(tree, 'Review').props.onClick())
  assert.equal(calls[1][1], 'history-call')
  assert.equal(calls[1][2].questions[0].detail, '**Context**')
  assert.equal(calls[1][2].questions[0].multiSelect, true)
  assert.deepEqual(calls[1][2].answers, answers)
  state.live = true
  act(() => { tree.update(React.createElement(AskHistoryRow, { ...props, phase: 'start', block: { argsRaw: rowArgs } })) })
  assert.ok(button(tree, 'Open'))
  act(() => tree.unmount())
})

test('an interrupted settled call reviews its questions and never offers a dead open', () => {
  let seen
  const props = rowProps({
    callId: 'aborted',
    reveal: () => { throw new Error('must not open a removed card') },
    review: (_id, record) => { seen = record; return true },
  })
  const block = {
    kind: 'tool-result', call: { argsRaw: rowArgs },
    content: [{ type: 'text', text: 'Error: ask_user_question was aborted before the user answered' }],
    isError: true, error: { name: 'UserQuestionError', code: 'ASK_ABORTED' },
  }
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'result', block })) })
    assert.equal(button(tree, 'Open'), undefined)
    assert.ok(JSON.stringify(tree.toJSON()).includes(en['history.interrupted']))
    act(() => button(tree, 'Review').props.onClick())
    assert.deepEqual(seen.answers, [])
    assert.equal(seen.questions[0].question, 'Pick')
  } finally { if (tree) act(() => tree.unmount()) }
})

test('a cancelled settled call reviews its questions under the cancelled label', () => {
  const props = rowProps({ callId: 'cancelled' })
  const block = {
    kind: 'tool-result', call: { argsRaw: rowArgs },
    content: [{ type: 'text', text: 'Error: ask_user_question was cancelled' }],
    isError: true, error: { name: 'UserQuestionError', code: 'ASK_CANCELLED' },
  }
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'result', block })) })
    assert.equal(button(tree, 'Open'), undefined)
    assert.ok(JSON.stringify(tree.toJSON()).includes(en['history.cancelled']))
    assert.ok(button(tree, 'Review'))
  } finally { if (tree) act(() => tree.unmount()) }
})

test('a pending result whose card was removed reviews instead of offering a dead open', () => {
  let seen
  const props = rowProps({ callId: 'pending-gone', review: (_id, record) => { seen = record; return true } })
  const block = { kind: 'tool-result', call: { argsRaw: rowArgs }, content: [{ type: 'text', text: JSON.stringify({ pending: true, callId: 'pending-gone' }) }] }
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'result', block })) })
    assert.equal(button(tree, 'Open'), undefined)
    act(() => button(tree, 'Review').props.onClick())
    assert.deepEqual(seen.answers, [])
  } finally { if (tree) act(() => tree.unmount()) }
})

test('a late reply reviews the answers recorded by the projection', () => {
  const answers = [{ id: 'q', selected: ['A'] }]
  let seen
  const props = rowProps({
    callId: 'late',
    state: { live: false, projected: { settled: [{ callId: 'late', answers }] } },
    review: (_id, record) => { seen = record; return true },
  })
  const block = { kind: 'tool-result', call: { argsRaw: rowArgs }, content: [{ type: 'text', text: JSON.stringify({ pending: true, callId: 'late' }) }] }
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'result', block })) })
    act(() => button(tree, 'Review').props.onClick())
    assert.deepEqual(seen.answers, answers)
  } finally { if (tree) act(() => tree.unmount()) }
})

test('a running call with no live card offers neither open nor review', () => {
  const props = rowProps({ callId: 'starting' })
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'start', block: { argsRaw: rowArgs } })) })
    assert.equal(button(tree, 'Open'), undefined)
    assert.equal(button(tree, 'Review'), undefined)
  } finally { if (tree) act(() => tree.unmount()) }
})

test('removing the live card takes the open affordance with it', () => {
  const state = { live: true }
  const props = rowProps({ callId: 'removed', state })
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'start', block: { argsRaw: rowArgs } })) })
    assert.ok(button(tree, 'Open'))
    state.live = false
    act(() => { tree.update(React.createElement(AskHistoryRow, { ...props, phase: 'start', block: { argsRaw: rowArgs } })) })
    assert.equal(button(tree, 'Open'), undefined)
    assert.equal(button(tree, 'Review'), undefined)
  } finally { if (tree) act(() => tree.unmount()) }
})

test('a review card with no recorded answers says so', () => {
  const questions = [{ id: 'q', question: 'Pick', options: [{ label: 'A' }] }]
  const pending = new PendingQuestion('session', questions, 'review-call', undefined, [])
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = { addEventListener() {}, removeEventListener() {}, activeElement: null }
  function Surface() {
    const [progress, setProgress] = React.useState({})
    const actions = React.useMemo(() => ({ replace() {}, clear() {}, prune() {} }), [])
    return React.createElement(QuestionComposer, {
      matched: pending, t, actions, renderSlot: () => null,
      useStore: select => select({ progressByRequest: progress }),
      useQuestionCard: (_key, select) => select(React.useSyncExternalStore(pending.subscribe, pending.getSnapshot)),
    })
  }
  let tree
  try {
    act(() => { tree = create(React.createElement(Surface)) })
    assert.ok(JSON.stringify(tree.toJSON()).includes(en['review.unanswered']))
  } finally {
    if (tree) act(() => tree.unmount())
    pending.close()
    delete globalThis.window
    delete globalThis.document
  }
})

test('option buttons use native keyboard activation and submit the selected original label', async () => {
  const questions = [{ id: 'pick', question: 'Pick a route', options: [{ label: 'A (Recommended)' }, { label: 'B' }] }]
  const pending = new PendingQuestion('session', questions, 'pick-call')
  let answer
  pending.attachWaterfall({ resolve: value => { answer = value }, reject() {}, delegate() {} })
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = { addEventListener() {}, removeEventListener() {}, activeElement: null }
  function Surface() {
    const [progress, setProgress] = React.useState({})
    const actions = React.useMemo(() => ({
      replace: (key, value) => setProgress(previous => ({ ...previous, [key]: value })),
      clear() {}, prune() {},
    }), [])
    return React.createElement(QuestionComposer, {
      matched: pending, t, actions, renderSlot: () => null,
      useStore: select => select({ progressByRequest: progress }),
      useQuestionCard: (_key, select) => select(React.useSyncExternalStore(pending.subscribe, pending.getSnapshot)),
    })
  }
  let tree
  try {
    act(() => { tree = create(React.createElement(Surface)) })
    const b = tree.root.find(node => node.type === 'button' && node.props['aria-label'] === 'B')
    assert.equal(b.props.tabIndex, -1)
    const a = tree.root.findAllByProps({ role: 'radio' }).find(node => node.type === 'button' && node.props['aria-checked'])
    assert.equal(a.props.tabIndex, 0)
    let focused = false
    act(() => a.props.onKeyDown({ key: 'ArrowDown', preventDefault() {}, stopPropagation() {}, currentTarget: { parentElement: { querySelectorAll: () => [{ focus() {} }, { focus() { focused = true } }] } } }))
    assert.equal(focused, true)
    assert.equal(tree.root.findByProps({ 'aria-label': 'B' }).props.tabIndex, 0)
    b.props.onKeyDown({ key: 'Enter', preventDefault() { assert.fail('Enter must use the button activation') } })
    act(() => b.props.onClick())
    assert.equal(answer, undefined)
    assert.equal(tree.root.findByProps({ 'aria-label': 'B' }).props['aria-checked'], true)
    await act(async () => button(tree, 'submit').props.onClick())
    assert.deepEqual(answer, { answers: [{ id: 'pick', selected: ['B'] }] })
  } finally {
    if (tree) act(() => tree.unmount())
    pending.close()
    delete globalThis.window
    delete globalThis.document
  }
})


test('settings dirty state, busy state and savebar follow the saved revision', async () => {
  let accept
  const { tree, form } = settings(values, () => new Promise(resolve => { accept = resolve }))
  const root = () => tree.root.find(node => node.type === 'div' && 'data-settings-dirty' in node.props)
  try {
    assert.equal(button(tree, 'Save'), undefined)
    assert.equal(root().props['data-settings-dirty'], false)
    assert.equal(tree.root.findAllByType('select').length, 0)
    assert.equal(tree.root.findAllByType('details').length, 0, 'goal behavior is not folded away')
    change(tree, 'better-ask-user-wait', '45')
    assert.equal(root().props['data-settings-dirty'], true)
    act(() => button(tree, 'Save').props.onClick())
    assert.equal(root().props['data-settings-busy'], true)
    assert.equal(button(tree, 'Saving…').props.disabled, true)
    await act(async () => {
      tree.update(React.createElement(SettingsPage, { form: { ...form, state: { ...form.state, revision: 8, value: { ...values, questionTimeoutSeconds: 45 } } } }))
      accept(true)
    })
    assert.equal(root().props['data-settings-dirty'], false)
    assert.equal(root().props['data-settings-busy'], false)
    assert.equal(button(tree, 'Save'), undefined)
    assert.ok(JSON.stringify(tree.toJSON()).includes('Saved'))
    change(tree, 'better-ask-user-wait', '0')
    assert.equal(root().props['data-settings-dirty'], true)
    act(() => button(tree, 'Discard').props.onClick())
    assert.equal(byId(tree, 'better-ask-user-wait').props.value, '45')
    assert.equal(root().props['data-settings-dirty'], false)
  } finally { act(() => tree.unmount()) }
})

test('settings save failure keeps the draft available to retry', async () => {
  const { tree } = settings(values, async () => { throw new Error('Disconnected') })
  try {
    change(tree, 'better-ask-user-wait', '45')
    await act(async () => button(tree, 'Save').props.onClick())
    assert.equal(byId(tree, 'better-ask-user-wait').props.value, '45')
    assert.equal(button(tree, 'Save').props.disabled, false)
    assert.ok(tree.root.findAllByProps({ role: 'alert' }).some(node => node.children.includes('Save failed: Disconnected')))
  } finally { act(() => tree.unmount()) }
})

test('history re-entry reports an ended record without promising a retry', () => {
  let available = false
  const props = {
    callId: 'closed', phase: 'start', block: { argsRaw: '{}' }, t,
    useProjection: (_key, select) => select(undefined),
    useQuestionPanelLive: (_key, select = value => value) => select(true),
    revealPanel: () => available,
    reviewPanel: () => false,
  }
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, props)) })
    act(() => button(tree, 'Open').props.onClick())
    assert.ok(JSON.stringify(tree.toJSON()).includes(en['history.unavailable']))
    available = true
    act(() => button(tree, 'Open').props.onClick())
    assert.equal(tree.root.findAllByProps({ role: 'alert' }).length, 0)
  } finally { if (tree) act(() => tree.unmount()) }
})

test('reply copy exposes pending, failed and copied states while retaining full text', async () => {
  const data = { callId: 'reply', outcome: 'answered', time: 0, text: '', questions: [{ id: 'q', question: 'Choose a route', options: [{ label: 'A' }] }], answers: [{ id: 'q', selected: ['A'], custom: 'Additional context' }] }
  globalThis.window = { clearTimeout, setTimeout }
  let settle
  let copiedText
  clipboard = text => { copiedText = text; return new Promise(resolve => { settle = resolve }) }
  let tree
  const copyButton = () => tree.root.findAllByType('button').find(node => node.props['aria-label'] === 'copy' || node.props['aria-label'] === 'copied')
  try {
    act(() => { tree = create(React.createElement(QuestionReplyBubble, { data, t })) })
    act(() => copyButton().props.onClick())
    assert.equal(copyButton().props.disabled, true)
    assert.equal(copyButton().props['aria-busy'], true)
    await act(async () => settle(false))
    assert.equal(copyButton().props.disabled, false)
    assert.ok(JSON.stringify(tree.toJSON()).includes(en['reply.copyFailed']))
    clipboard = async text => { copiedText = text; return true }
    await act(async () => copyButton().props.onClick())
    assert.equal(copyButton().props['aria-label'], 'copied')
    assert.match(copiedText, /Choose a route/)
    assert.match(copiedText, /Additional context/)
    const toggle = tree.root.findAllByType('button').find(node => 'aria-expanded' in node.props)
    act(() => toggle.props.onClick())
    assert.equal(toggle.props['aria-controls'], tree.root.findByType('dl').props.id)
  } finally {
    if (tree) act(() => tree.unmount())
    clipboard = async () => true
    delete globalThis.window
  }
})

test('a pending start without a live card shows the waiting fallback and no dead open', () => {
  const props = rowProps({ callId: 'ptc-pending', state: { live: false } })
  let tree
  try {
    act(() => { tree = create(React.createElement(AskHistoryRow, { ...props, phase: 'start', block: { argsRaw: rowArgs } })) })
    assert.equal(button(tree, 'Open'), undefined)
    assert.equal(button(tree, 'Review'), undefined)
    assert.ok(JSON.stringify(tree.toJSON()).includes(en['history.waiting']))
  } finally { if (tree) act(() => tree.unmount()) }
})
