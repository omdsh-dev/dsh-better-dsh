/** Exercise the public client apply/request/projection boundary, not a duplicate card registry. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const compiled = await build({
  entryPoints: [new URL('../src/client/index.ts', import.meta.url).pathname],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-store'],
  plugins: [{ name: 'host-css-boundary', setup(builder) {
    builder.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default {}', loader: 'js' }))
  } }],
})
const require = createRequire(import.meta.url)
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(id => {
  if (id === '@deepseek-ai/dsh-client-store') return { defineStore: () => ({}) }
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
  return require(id)
}, module, module.exports)
const { apply } = module.exports

const sessionId = 'session'
const callId = 'ordinary-call'
const questions = [{ id: 'q', question: 'Pick', options: [{ label: 'A' }, { label: 'B' }] }]

function harness(projectionFirst) {
  const disposers = []
  const seats = new Map()
  const questionSubscribers = new Set()
  let projected = { active: projectionFirst ? [{ callId, questions, state: 'continued' }] : [], settled: [] }
  let listener
  let closeClaim
  const questionsFace = {
    getSnapshot: () => projected,
    subscribe(fn) { questionSubscribers.add(fn); return () => questionSubscribers.delete(fn) },
  }
  const inboxFace = { getSnapshot: () => undefined, subscribe: () => () => {} }
  const ctx = {
    effect(start) {
      const stop = start()
      disposers.push(stop)
      return stop
    },
    locale: { register: () => () => {} },
    slots: { inject: () => () => {}, register: () => () => {} },
    uiConversation: { events: { register() {} } },
    reflect: { provide: () => () => {} },
    uiSession: { registerPendingInteraction: () => pending => {
      seats.set(pending.key, pending)
      return () => seats.delete(pending.key)
    } },
    sessions: {
      scopeOf: () => sessionId,
      list: { getSnapshot: () => ({ byId: { [sessionId]: { id: sessionId } } }), subscribe: () => () => {} },
      binding: () => ({ session: { projections: { faceOf: name => name === 'userQuestions' ? questionsFace : inboxFace } } }),
    },
    remote: {
      $on(name, handler) { assert.equal(name, 'user-questions/request'); listener = handler },
      userQuestions: {
        answer: async () => ({ ok: true, value: true }),
        attachWait(agent, call, signal) {
          assert.equal(agent, sessionId)
          assert.equal(call, callId)
          const end = Promise.withResolvers()
          closeClaim = () => end.resolve({ done: true })
          signal.addEventListener('abort', closeClaim, { once: true })
          let opened = false
          return {
            [Symbol.asyncIterator]() { return this },
            next() {
              if (opened) return end.promise
              opened = true
              return Promise.resolve({ done: false, value: { remainingMs: 5000 } })
            },
            dispose: closeClaim,
          }
        },
      },
    },
  }
  apply(ctx)
  return {
    pending: () => [...seats.values()][0],
    request: better => listener.call({}, { questions, wait: { callId, timed: true }, better }, () => assert.fail('the client owns this question')),
    project() {
      projected = { active: [{ callId, questions, state: 'continued' }], settled: [] }
      for (const fn of questionSubscribers) fn()
    },
    async close() {
      closeClaim?.()
      for (const dispose of disposers.reverse()) await dispose?.()
    },
  }
}

for (const projectionFirst of [false, true]) {
  for (const mode of ['native', 'default']) {
    test((projectionFirst ? 'projection-first' : 'request-first') + ' preserves ordinary ' + mode + ' timing config on the shared card', async () => {
      const h = harness(projectionFirst)
      const previous = h.pending()
      const answer = { answers: [{ id: 'q', selected: ['B'] }], autoSelected: true }
      const result = h.request({ waitMs: 9000, timeoutMode: mode, defaultAnswer: answer })
      // Observe a native rejection before invoking the carrier timeout.
      const observed = result.then(value => ({ value }), error => ({ error }))
      try {
        await Promise.resolve()
        const pending = h.pending()
        assert.ok(pending)
        if (projectionFirst) assert.equal(pending, previous, 'the projection and forwarded request share one public carrier')
        h.project()
        assert.equal(h.pending(), pending)
        assert.equal(pending.snapshot().waitMs, 9000)
        assert.equal(pending.snapshot().timeoutMode, mode)
        pending.bump()
        assert.ok(pending.snapshot().countdown.remainingMs > 8500, 'input extension uses request policy even for an existing card')
        pending.timeout()
        const outcome = await observed
        if (mode === 'default') assert.deepEqual(outcome.value, answer)
        else assert.equal(outcome.error?.code, 'ASK_TIMED_OUT')
      } finally { await h.close() }
    })
  }
}
