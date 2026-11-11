import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AUTO_SELECTED_WARNING, createBetterAskTool } from '../src/ask-tool.js'

const base = {
  name: 'ask_user_question',
  description: 'Base official description.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            question: { type: 'string' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, description: { type: 'string' } },
                required: ['label'],
              },
            },
            multi_select: { type: 'boolean' },
          },
          required: ['id', 'question'],
        },
      },
    },
    required: ['questions'],
  },
  output: {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { answers: { type: 'array' } },
      required: ['answers'],
    },
    render: () => [{ type: 'text', text: 'base' }],
  },
  async execute() { throw new Error('base execute must not run') },
}

const questions = [
  { id: 'one', question: 'One?', options: [{ label: 'A' }, { label: 'B' }] },
  { id: 'multi', question: 'Multi?', multi_select: true, options: [{ label: 'X' }, { label: 'Y (Recommended)' }] },
  { id: 'none', question: 'Free?' },
]
const args = { questions }

function makeHarness({ goal, config, timed = { pending: true, callId: 'c1' }, asked } = {}) {
  const calls = { timed: [], plain: [] }
  const ctx = {
    get(name) {
      if (name === 'userQuestions') {
        return {
          ask: async request => {
            calls.plain.push(request)
            return asked ?? { answers: [{ id: 'one', selected: ['A'] }, { id: 'multi', selected: [] }, { id: 'none', selected: [] }] }
          },
          askTimed: async (request, callId, timeoutMs) => {
            calls.timed.push({ request, callId, timeoutMs })
            return timed
          },
        }
      }
      if (name === 'goals') return { get: () => goal }
      return undefined
    },
  }
  const readConfig = () => ({ questionTimeoutSeconds: 5, timeoutBehavior: 'native', goalTimeoutBehavior: 'native', ...config })
  const definition = createBetterAskTool(ctx, base, readConfig)
  const exec = { agent: {}, callId: 'c1', signal: new AbortController().signal }
  return { definition, exec, calls }
}

test('input contract keeps official fields and exposes optional detail', () => {
  const harness = makeHarness()
  assert.equal(harness.definition.name, base.name)
  assert.equal(harness.definition.description, base.description)
  assert.equal(harness.definition.parameters.properties.questions.items.properties.detail.type, 'string')
  assert.equal(base.parameters.properties.questions.items.properties.detail, undefined, 'base schema must not be mutated')
  assert.equal(harness.definition.parameters.properties.timeout.type, 'integer')
  assert.match(harness.definition.parameters.properties.timeout.description, /omit.*plugin setting/)
  assert.ok(!harness.definition.parameters.required?.includes('timeout'))
  assert.equal(base.parameters.properties.timeout, undefined, 'base schema must not be mutated')
  assert.equal(harness.definition.output.schema.oneOf[0].properties.autoSelected.type, 'boolean')
  assert.equal(harness.definition.output.schema.oneOf[0].properties.warning.type, 'string')
  assert.equal(harness.definition.output.schema.oneOf[1].properties.pending.type, 'boolean')
  assert.equal(harness.definition.output.schema.oneOf[1].properties.autoSelected, undefined)
})

test('native timed request stays lossless JSON', async () => {
  const harness = makeHarness()
  await harness.definition.execute(args, harness.exec)
  const better = harness.calls.timed[0].request.better
  assert.deepEqual(JSON.parse(JSON.stringify(better)), better)
})

test('question detail is forwarded and validated as a string', async () => {
  const harness = makeHarness()
  const withDetail = { questions: [{ id: 'one', question: 'One?', detail: 'Plan body with **markdown**' }] }
  await harness.definition.execute(withDetail, harness.exec)
  assert.equal(harness.calls.timed[0].request.questions[0].detail, 'Plan body with **markdown**')
  await assert.rejects(
    () => harness.definition.execute({ questions: [{ id: 'one', question: 'One?', detail: 7 }] }, harness.exec),
    /detail/,
  )
})

test('native behavior forwards the plugin wait, not the compatibility marker, and returns the official pending shape', async () => {
  const harness = makeHarness()
  const result = await harness.definition.execute({ ...args, timeout: -1 }, harness.exec)
  assert.equal(result.pending, true)
  assert.match(result.message, /No answer batch arrived/)
  assert.equal(harness.calls.timed.length, 1)
  assert.equal(harness.calls.timed[0].timeoutMs, 5000)
  assert.equal(harness.calls.timed[0].request.agent, harness.exec.agent)
  assert.equal(harness.calls.timed[0].request.better.waitMs, 5000)
  assert.equal(harness.calls.timed[0].request.better.timeoutMode, 'native')
  assert.equal(harness.calls.timed[0].request.better.defaultAnswer, undefined)
  assert.equal(harness.calls.plain.length, 0)
})

test('default behavior backstops the plugin wait with the default batch', async () => {
  const harness = makeHarness({ config: { timeoutBehavior: 'default' } })
  const result = await harness.definition.execute(args, harness.exec)
  assert.deepEqual(result, {
    answers: [
      { id: 'one', selected: ['A'] },
      { id: 'multi', selected: ['Y (Recommended)'] },
      { id: 'none', selected: [] },
    ],
    autoSelected: true,
    warning: AUTO_SELECTED_WARNING,
  })
  const better = harness.calls.timed[0].request.better
  assert.deepEqual(better.defaultAnswer, result)
  assert.equal(better.timeoutMode, 'default')
})

test('goal-active mode uses goalTimeoutBehavior', async () => {
  const harness = makeHarness({
    goal: { phase: 'active', activation: 'armed' },
    config: { timeoutBehavior: 'native', goalTimeoutBehavior: 'default' },
  })
  const result = await harness.definition.execute(args, harness.exec)
  assert.deepEqual(result.answers.map(answer => answer.id), ['one', 'multi', 'none'])
  assert.equal(harness.calls.timed[0].request.better.timeoutMode, 'default')
})

test('disabled wait uses the plain ask path with the official call id', async () => {
  const harness = makeHarness({ config: { questionTimeoutSeconds: -1 } })
  const result = await harness.definition.execute(args, harness.exec)
  assert.deepEqual(result.answers.map(answer => answer.id), ['one', 'multi', 'none'])
  assert.equal(harness.calls.plain.length, 1)
  assert.equal(harness.calls.plain[0].wait.callId, 'c1')
  assert.equal(harness.calls.plain[0].agent, harness.exec.agent)
  assert.equal(harness.calls.timed.length, 0)
})

test('a client auto answer keeps the autoSelected warning', async () => {
  const auto = {
    answers: [
      { id: 'one', selected: ['A'] },
      { id: 'multi', selected: ['X'] },
      { id: 'none', selected: [] },
    ],
    autoSelected: true,
  }
  const harness = makeHarness({ timed: auto })
  const result = await harness.definition.execute(args, harness.exec)
  assert.deepEqual(result, {
    answers: [
      { id: 'one', selected: ['A'] },
      { id: 'multi', selected: ['X'] },
      { id: 'none', selected: [] },
    ],
    autoSelected: true,
    warning: AUTO_SELECTED_WARNING,
  })
  assert.deepEqual(harness.definition.output.render(args, result), [{ type: 'text', text: 'base' }])
})

test('duplicate question ids use the official error text', async () => {
  const harness = makeHarness()
  await assert.rejects(
    () => harness.definition.execute({ questions: [{ id: 'dup', question: 'A' }, { id: 'dup', question: 'B' }] }, harness.exec),
    /question id "dup" must be unique within this call/,
  )
  assert.equal(harness.calls.timed.length, 0)
})

test('timed asks without a live agent are rejected', async () => {
  const harness = makeHarness()
  await assert.rejects(
    () => harness.definition.execute(args, { callId: 'c1', signal: new AbortController().signal }),
    /timed questions require a live agent/,
  )
})