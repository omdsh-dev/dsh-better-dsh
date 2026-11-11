import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDefaultAnswer, isRecommended } from '../src/default-answer.js'

test('single select always picks the first option', () => {
  const result = buildDefaultAnswer([
    { id: 'one', question: 'Pick', options: [{ label: 'A' }, { label: 'B (Recommended)' }] },
  ])
  assert.deepEqual(result, { answers: [{ id: 'one', selected: ['A'] }], autoSelected: true })
})

test('multi select picks every recommended option', () => {
  const result = buildDefaultAnswer([
    { id: 'multi', question: 'Pick', multi_select: true, options: [
      { label: 'X' }, { label: 'Y (推荐)' }, { label: 'Z (Recommended)' },
    ] },
  ])
  assert.deepEqual(result.answers[0].selected, ['Y (推荐)', 'Z (Recommended)'])
})

test('multi select without recommendations picks the first option', () => {
  const result = buildDefaultAnswer([
    { id: 'multi', question: 'Pick', multi_select: true, options: [{ label: 'X' }, { label: 'Y' }] },
  ])
  assert.deepEqual(result.answers[0].selected, ['X'])
})

test('a question without options is skipped with an empty selection', () => {
  const result = buildDefaultAnswer([{ id: 'free', question: 'Type' }])
  assert.deepEqual(result.answers, [{ id: 'free', selected: [] }])
  assert.equal(result.autoSelected, true)
})

test('recommendation detection covers ASCII and Chinese suffixes only', () => {
  assert.equal(isRecommended('Do it (Recommended)'), true)
  assert.equal(isRecommended('执行（推荐）'), true)
  assert.equal(isRecommended('Recommended for later'), false)
  assert.equal(isRecommended('普通选项'), false)
})
