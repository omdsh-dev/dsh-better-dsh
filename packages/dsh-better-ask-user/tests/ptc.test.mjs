import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountPtcExemption } from '../src/ptc.js'

test('registers ask_user_question with betterPtc and effects cleanup', () => {
  const calls = []
  const effects = []
  mountPtcExemption({
    inject: (names, callback) => {
      calls.push(names)
      callback({
        betterPtc: { register: (name) => { calls.push(name); return () => { calls.push('dispose') } } },
        effect: (register, label) => { effects.push(label); effects.push(register()) },
      })
    },
  })
  assert.deepEqual(calls, [['betterPtc'], 'ask_user_question'])
  assert.equal(effects.length, 2)
  assert.match(effects[0], /PTC deadline exemption/)
  effects[1]()
  assert.deepEqual(calls, [['betterPtc'], 'ask_user_question', 'dispose'])
})

test('missing inject and missing service are safe no-ops', () => {
  assert.doesNotThrow(() => mountPtcExemption({}))
  assert.doesNotThrow(() => mountPtcExemption({ inject: (names, callback) => callback({}) }))
})
