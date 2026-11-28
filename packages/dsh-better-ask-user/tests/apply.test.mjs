import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ToolRegistryUnavailableError } from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'

const base = {
  name: 'ask_user_question',
  description: 'Base official description.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' }, question: { type: 'string' } }, required: ['id', 'question'] },
      },
    },
    required: ['questions'],
  },
  output: { schema: { oneOf: [{ type: 'object', properties: { pending: { type: 'boolean' } } }, { type: 'object', properties: { answers: { type: 'array' } } }] } },
  async execute() { return { pending: true, callId: 'c1', message: 'pending' } },
}

const runCode = {
  name: 'run_code',
  description: 'Program entry.',
  parameters: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
  output: { schema: { type: 'object', properties: {} }, render: () => [] },
  async execute() { return {} },
}

function harness(getTool) {
  const registered = []
  const ptcCalls = []
  const events = []
  const tools = {
    get: getTool,
    register: (definition) => { registered.push(definition); return () => {} },
  }
  const agent = {
    ctx: { get: (name) => name === 'tools' ? tools : undefined },
  }
  const ctx = {
    inject: (names, callback) => {
      if (names[0] === 'settings') return
      ptcCalls.push(names)
      callback({ betterPtc: { register: (name) => { ptcCalls.push(name); return () => {} } }, effect: () => {} })
    },
    agents: { list: () => [agent] },
    on: (event) => { events.push(event); return () => {} },
    effect: (register) => { const dispose = register(); return dispose },
    get: (name) => name === 'userQuestions' ? {} : undefined,
  }
  apply(ctx, {})
  return { registered, ptcCalls, events }
}

test('apply shadows ask_user_question per agent and registers the shared PTC exemption', () => {
  const { registered, ptcCalls, events } = harness((name) => name === 'ask_user_question' ? base : undefined)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'ask_user_question')
  assert.equal(registered[0].description, base.description)
  assert.equal(registered[0].parameters.properties.questions.items.properties.detail.type, 'string')
  assert.equal(base.parameters.properties.questions.items.properties.detail, undefined)
  assert.equal(registered[0].output.schema.oneOf[0].properties.pending.type, 'boolean')
  assert.equal(registered[0].output.schema.oneOf[1].properties.autoSelected.type, 'boolean')
  assert.equal(registered[0].output.schema.oneOf[1].properties.warning.type, 'string')
  assert.deepEqual(ptcCalls, [['betterPtc'], 'ask_user_question'])
  assert.deepEqual(events, ['agent/created', 'agent/disposed'])
})

test('apply falls back to the vendored official definition when a PTC root hides the ask row', () => {
  const { registered, ptcCalls } = harness((name) => name === 'run_code' ? runCode : undefined)
  assert.equal(registered.length, 1)
  const shadow = registered[0]
  assert.equal(shadow.name, 'ask_user_question')
  assert.match(shadow.description, /^Ask the user a concise question when you need confirmation/)
  assert.match(shadow.description, /do not ask it again, and do not treat the skip as permission\.$/)
  assert.equal(shadow.parameters.properties.questions.items.properties.detail.type, 'string')
  assert.equal(shadow.parameters.properties.timeout.type, 'integer')
  assert.ok(shadow.output.schema.oneOf.some(branch => branch.properties?.pending !== undefined))
  assert.ok(shadow.output.schema.oneOf.some(branch => branch.properties?.answers !== undefined))
  assert.equal(ptcCalls.at(-1), 'ask_user_question')
})

test('apply leaves compositions without an ask row or a selected root untouched', () => {
  assert.equal(harness(() => undefined).registered.length, 0)
  assert.equal(harness(() => { throw new ToolRegistryUnavailableError() }).registered.length, 0)
  assert.throws(() => harness(() => { throw new Error('broken tools service') }), /broken tools service/)
})
