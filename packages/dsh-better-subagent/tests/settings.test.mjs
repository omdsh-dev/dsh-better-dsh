/**
 * Settings wiring tests (src/settings.js): delayed webServer route registration
 * and the "this row owns its own page" settings policy, with no legacy-file
 * import (Apollo owns its old config migration in S4).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CAPABILITIES_ALIAS_PREFIX, CAPABILITIES_PREFIX } from '../src/panel.js'
import { mountSettings } from '../src/settings.js'

/** fake ctx: record injections and invoke callbacks with the supplied services. */
function makeMountCtx(services, { fiber = { id: 'fiber' } } = {}) {
  const injections = []
  const ctx = {
    fiber,
    inject(names, callback) {
      injections.push(names)
      const key = names.join(',')
      if (!Object.hasOwn(services, key)) return
      callback(services[key])
    },
  }
  return { ctx, injections }
}

test('mountSettings: injects webServer then settings', () => {
  const { ctx, injections } = makeMountCtx({})
  mountSettings(ctx, {})
  assert.deepEqual(injections, [['webServer'], ['settings']])
})

test('mountSettings: registers canonical + Apollo alias capability routes', () => {
  const routes = []
  const effects = []
  const { ctx } = makeMountCtx({
    webServer: {
      webServer: { register: (route) => { routes.push(route); return () => {} } },
      effect: (factory, label) => { effects.push(label); return factory() },
      get: () => undefined,
    },
  })
  mountSettings(ctx, { trustedHosts: ['dsh.example.com'] })
  assert.equal(routes.length, 2)
  assert.deepEqual(routes.map((route) => route.path), [CAPABILITIES_PREFIX, CAPABILITIES_ALIAS_PREFIX])
  for (const route of routes) {
    assert.equal(route.kind, 'prefix')
    assert.equal(typeof route.handler, 'function')
  }
  assert.deepEqual(effects, ['better-subagent-panel: /better-subagent/api capabilities routes'])
})

test('mountSettings: registers the row-config page policy (auto:false + this fiber)', () => {
  const configureCalls = []
  const fiber = { id: 'better-subagent-fiber' }
  const { ctx } = makeMountCtx({
    settings: {
      settings: { configure: (...args) => { configureCalls.push(args); return () => {} } },
      effect: (factory) => factory(),
    },
  }, { fiber })
  mountSettings(ctx, {})
  assert.deepEqual(configureCalls, [[{ auto: false }, fiber]])
})

test('mountSettings: a failing policy registration only warns', () => {
  const warnings = []
  const { ctx } = makeMountCtx({
    settings: {
      settings: { configure: () => { throw new Error('already configured') } },
      effect: () => () => {},
      logger: { warn: (message) => warnings.push(message) },
    },
  })
  assert.doesNotThrow(() => mountSettings(ctx, {}))
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /page policy was not registered/)
})

test('mountSettings: settings service without configure is handled like a failure', () => {
  const warnings = []
  const { ctx } = makeMountCtx({
    settings: {
      settings: {},
      effect: () => () => {},
      logger: { warn: (message) => warnings.push(message) },
    },
  })
  assert.doesNotThrow(() => mountSettings(ctx, {}))
  assert.equal(warnings.length, 1)
})

test('settings source has no legacy-file import or Apollo dependency', () => {
  const source = readFileSync(new URL('../src/settings.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /eng\.json|atlas\.json|dsh-home|from '@menghuan1918\/dsh-apollo/)
})
