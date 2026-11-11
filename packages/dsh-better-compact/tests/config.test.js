import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  Config,
  DEFAULTS,
  MAX_CUSTOM_PROMPT_CHARS,
  MODES,
  readConfig,
  toNativeConfig,
} from '../src/config.js'

test('custom mode is a first-class mode with a bounded prompt', () => {
  assert.deepEqual(MODES, ['native', 'goal', 'handoff', 'custom'])
  assert.equal(readConfig({}).customPrompt, '')
  const custom = readConfig({ mode: 'custom', customPrompt: 'Keep {{goal}} and {{todos}}.' })
  assert.equal(custom.mode, 'custom')
  assert.equal(custom.customPrompt, 'Keep {{goal}} and {{todos}}.')
  const schemaValue = Config({ mode: 'custom', customPrompt: 'x' })
  assert.equal(typeof schemaValue.customPrompt.get, 'function')
  assert.equal(schemaValue.customPrompt.get(), 'x')
})

test('custom mode rejects missing, blank, non-string and oversized prompts', () => {
  assert.throws(() => readConfig({ mode: 'custom' }), /customPrompt is required/)
  assert.throws(() => readConfig({ mode: 'custom', customPrompt: '   ' }), /customPrompt is required/)
  assert.throws(() => readConfig({ mode: 'custom', customPrompt: 3 }), /customPrompt must be a string/)
  assert.throws(
    () => readConfig({ mode: 'custom', customPrompt: 'x'.repeat(MAX_CUSTOM_PROMPT_CHARS + 1) }),
    /at most 8000 characters/,
  )
  assert.doesNotThrow(() => readConfig({ mode: 'custom', customPrompt: 'x'.repeat(MAX_CUSTOM_PROMPT_CHARS) }))
})

test('customPrompt never reaches the native engine config', () => {
  const snapshot = readConfig({ mode: 'custom', customPrompt: 'Only for custom mode.' })
  const native = toNativeConfig(snapshot)
  assert.equal('customPrompt' in native, false)
  assert.equal('mode' in native, false)
  assert.equal(native.maxTokens, DEFAULTS.headroomTokens)
})

test('unknown configuration keys still fail closed', () => {
  assert.throws(() => readConfig({ mode: 'goal', unknownPrompt: 'x' }), /unknown configuration key/)
})
