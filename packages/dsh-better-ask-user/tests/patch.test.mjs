import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'

test('bundle patch disables the official Web card and inserts both stable rows', () => {
  const entries = yaml.load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  assert.deepEqual(entries[0], { id: 'ui-user-questions', disabled: true })
  assert.deepEqual(entries[1].insert, [
    { id: 'dsh-better-ptc', name: 'dsh-better-ptc' },
    { id: 'dsh-better-ask-user', name: 'dsh-better-ask-user' },
  ])
})
