import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, normalizeConfig } from '../src/config.js'

test('missing config uses native behavior and 120 seconds', () => {
  assert.deepEqual(normalizeConfig(undefined), DEFAULTS)
  assert.deepEqual(normalizeConfig({}), DEFAULTS)
})

test('accepts -1 and both behaviors', () => {
  assert.deepEqual(normalizeConfig({
    questionTimeoutSeconds: -1,
    timeoutBehavior: 'default',
    goalTimeoutBehavior: 'default',
  }), { questionTimeoutSeconds: -1, timeoutBehavior: 'default', goalTimeoutBehavior: 'default' })
})

test('invalid seconds and behaviors fall back without throwing', () => {
  for (const seconds of [0, -2, 1.5, '30', 2147484, null]) {
    assert.equal(normalizeConfig({ questionTimeoutSeconds: seconds }).questionTimeoutSeconds, 120, String(seconds))
  }
  assert.equal(normalizeConfig({ timeoutBehavior: 'auto' }).timeoutBehavior, 'native')
  assert.equal(normalizeConfig({ goalTimeoutBehavior: 'auto' }).goalTimeoutBehavior, 'native')
})

test('volatile refs are read through get()', () => {
  assert.deepEqual(normalizeConfig({
    questionTimeoutSeconds: { get: () => 30 },
    timeoutBehavior: { get: () => 'default' },
    goalTimeoutBehavior: { get: () => 'default' },
  }), { questionTimeoutSeconds: 30, timeoutBehavior: 'default', goalTimeoutBehavior: 'default' })
})
