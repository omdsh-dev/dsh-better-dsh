/** Built-closure and carrier behavior tests. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

let entry
globalThis.window = {
  __ModuleLoader__: {
    load(value) { entry = value },
  },
}
await import(pathToFileURL(new URL('../lib/client.js', import.meta.url).pathname).href)
const react = {
  memo: (component) => component,
  createElement: () => null,
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
  useMemo: (factory) => factory(),
  useCallback: (callback) => callback,
  useSyncExternalStore: () => undefined,
  createContext: () => ({ Provider: () => null }),
  Fragment: Symbol('Fragment'),
}
const jsxRuntime = { jsx: () => null, jsxs: () => null, Fragment: react.Fragment }
const fakeRequire = (id) => {
  if (id === 'react') return react
  if (id === 'react/jsx-runtime') return jsxRuntime
  if (id === '@deepseek-ai/dsh-client-store') return { defineStore: () => ({}) }
  return {}
}
const bundle = entry.factory(fakeRequire)
const PendingQuestion = bundle.PendingQuestion
const QuestionCards = bundle.QuestionCards

test('bundle is one loader closure exposing the client contract', () => {
  assert.equal(entry.id, 'dsh-better-ask-user')
  assert.equal(typeof bundle.apply, 'function')
  assert.ok(Array.isArray(bundle.inject))
  assert.equal(typeof PendingQuestion, 'function')
  assert.equal(typeof QuestionCards, 'function')
})

test('card presence follows registration and removal for the history row', () => {
  const cards = new QuestionCards(() => () => {})
  const presence = cards.presence('session', 'call')
  let changes = 0
  const stop = presence.subscribe(() => { changes += 1 })
  try {
    assert.equal(presence.getSnapshot(), false)
    const card = cards.ensure('session', [{ id: 'q', question: 'Pick' }], 'call')
    assert.equal(presence.getSnapshot(), true)
    assert.equal(changes, 1)
    card.remove()
    assert.equal(presence.getSnapshot(), false)
    assert.equal(changes, 2)
  } finally { stop() }
})

function harness(settings) {
  const questions = [{ id: 'q', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }] }]
  const pending = new PendingQuestion('session', questions, 'call', undefined, undefined, settings)
  let resolved
  let rejected
  const channel = {
    deadline: Date.now() + 5000,
    resolve: (answer) => { resolved = answer },
    reject: (code) => { rejected = code },
    delegate: () => {},
  }
  pending.attachWaterfall(channel)
  return { pending, channel, get resolved() { return resolved }, get rejected() { return rejected } }
}

test('bundle registers the ask history row for top-level and nested calls', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.match(source, /tool\.call\.toolview/)
  assert.match(source, /ask_user_question/)
  assert.match(source, /history\.review/)
})

test('history row uses an icon exported by DSH next primitives', async () => {
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /IconQuestionOutline14/)
  assert.match(source, /IconQuestionOutlineRegular/)
})

test('input bump resets the countdown to the configured window', () => {
  const h = harness({ waitMs: 5000, timeoutMode: 'native' })
  assert.equal(h.pending.snapshot().waitMs, 5000)
  assert.equal(h.pending.snapshot().timeoutMode, 'native')
  h.pending.bump()
  assert.ok(h.pending.snapshot().countdown.remainingMs > 4500)
  h.pending.close()
})

test('native timeout rejects the waterfall with ASK_TIMED_OUT', () => {
  const h = harness({ waitMs: 5000, timeoutMode: 'native' })
  h.pending.timeout()
  assert.equal(h.rejected, 'ASK_TIMED_OUT')
  assert.equal(h.resolved, undefined)
  h.pending.close()
})

test('default timeout resolves the host-provided default answer', () => {
  const answer = { answers: [{ id: 'q', selected: ['A'] }], autoSelected: true }
  const h = harness({ waitMs: 5000, timeoutMode: 'default', defaultAnswer: answer })
  h.pending.timeout()
  assert.deepEqual(h.resolved, answer)
  assert.equal(h.rejected, undefined)
  h.pending.close()
})

test('takeTime hard-stops the countdown and bump cannot revive it', () => {
  const h = harness({ waitMs: 5000, timeoutMode: 'default', defaultAnswer: { answers: [], autoSelected: true } })
  h.pending.takeTime()
  h.pending.bump()
  h.pending.timeout()
  assert.equal(h.pending.snapshot().waitState, 'waiting')
  assert.equal(h.resolved, undefined)
  assert.equal(h.rejected, undefined)
  h.pending.close()
})
test('css modules build: file-scoped names, no cross-file collisions, valid svg xmlns', async () => {
  const styleTags = []
  const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document')
  const prevDocument = globalThis.document
  try {
    globalThis.document = {
      querySelector: () => null,
      createElement: () => ({ dataset: {} }),
      head: { appendChild: (tag) => styleTags.push(tag) },
    }
    entry.factory(fakeRequire)
  } finally {
    if (hadDocument) globalThis.document = prevDocument
    else delete globalThis.document
  }
  assert.equal(styleTags.length, 6, 'every css module injects its own style tag')
  const owners = new Map()
  for (const style of styleTags) {
    const css = style.textContent.replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = new Set([...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(match => match[1]))
    assert.ok(selectors.size > 0)
    for (const selector of selectors) {
      assert.equal(owners.has(selector), false, selector + ' leaks across modules')
      owners.set(selector, style.dataset.pluginCss)
    }
  }
  const css = styleTags.map((tag) => tag.textContent).join('\n')
  for (const scoped of ['QuestionComposer_card', 'PlanReviewPanel_card', 'AskHistoryRow_row', 'AskHistoryRow_state', 'QuestionReplyView_bubble', 'QuestionWaitBar_bar', 'settings_choices', 'settings_choice', 'settings_sectionLabel']) {
    assert.match(css, new RegExp('\\.' + scoped + '[ ,{]'), scoped + ' must be scoped per source file')
  }
  assert.doesNotMatch(css, /bau-/, 'no naive prefix rewriting may remain')
  // Selects now use their native arrow; keep the parser regression with a URI fixture.
  const builder = await readFile(new URL('../scripts/build-client.mjs', import.meta.url), 'utf8')
  assert.match(builder, /'\.css': 'local-css'/, 'production CSS must use the native parser')
  const { transform } = await import('esbuild')
  const uri = await transform(".uri { background: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E\"); }", { loader: 'local-css' })
  assert.match(uri.code, /xmlns='http:\/\/www\.w3\.org\/2000\/svg'/, 'svg data URI xmlns must stay intact')
})