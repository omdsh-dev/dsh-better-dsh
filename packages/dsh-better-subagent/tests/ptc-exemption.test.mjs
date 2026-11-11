/** Unit tests for the wait_subagent PTC exemption registration. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountPtcExemption } from '../src/ptc-exemption.js'

test('registers wait_subagent with the shared betterPtc service', () => {
  const calls = []
  const effects = []
  mountPtcExemption({
    inject: (names, callback) => {
      calls.push(names)
      callback({
        betterPtc: {
          register: (toolName) => {
            calls.push(toolName)
            return () => { calls.push('dispose') }
          },
        },
        effect: (register, label) => {
          effects.push(label)
          effects.push(register())
        },
      })
    },
  })
  assert.deepEqual(calls, [['betterPtc'], 'wait_subagent'])
  assert.equal(effects.length, 2)
  assert.match(effects[0], /PTC deadline exemption/)
  effects[1]()
  assert.deepEqual(calls, [['betterPtc'], 'wait_subagent', 'dispose'])
})

test('missing inject and missing service are safe no-ops', () => {
  assert.doesNotThrow(() => mountPtcExemption({}))
  assert.doesNotThrow(() => mountPtcExemption({
    inject: (names, callback) => { callback({ betterPtc: { register: () => () => {} } }) },
  }))
})
