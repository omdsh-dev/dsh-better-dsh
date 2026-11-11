import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readConfig } from '../src/config.js'
import { BetterCompactEngine } from '../src/engine.js'

function makeEngine({ contextWindow = 100000, output = 'custom checkpoint text' } = {}) {
  const engine = Object.create(BetterCompactEngine.prototype)
  engine.mode = 'custom'
  engine.snapshot = readConfig({
    mode: 'custom',
    customPrompt: 'Goal: {{goal}}\nTodos:\n{{todos}}',
    maxTokens: 100,
    cachePriority: false,
    thresholdRatio: 0.8,
    retainRatio: 0.16,
  })
  let captured
  engine.ctx = {
    llm: {
      resolveModelInfo: async () => ({ provider: 'p', id: 'm', context: { contextWindow } }),
      stream: async function* (options) {
        captured = options
        if (output.length === 0) {
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: output }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: output } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    get(name) {
      if (name === 'goals') {
        return { get: () => ({ id: 'g1', revision: 1, objective: 'Ship the custom mode', phase: 'active', roundsStarted: 1, maxGoalRounds: 3 }) }
      }
      if (name === 'sessionProjections') {
        return {
          stateOf(_session, key) {
            return key === 'todos' ? [{ status: 'in_progress', content: 'write tests' }] : { questions: { active: [] } }
          },
        }
      }
      if (name === 'jobs') return { list: () => [] }
      if (name === 'agents') return { list: () => [] }
      return undefined
    },
    logger: { warn() {}, info() {} },
  }
  engine._resolveRoute = () => ({
    target: { provider: 'p', model: 'm' },
    policy: { maxTokens: 100, thresholdRatio: 0.8, retainRatio: 0.16 },
  })
  return { engine, captured: () => captured }
}

const agent = { id: 'a1', session: { id: 's1', toolHistory: () => [] } }
const input = { messages: [{ role: 'user', content: [{ type: 'text', text: 'earlier history' }] }] }

test('custom mode sends only the expanded prompt as the final user message', async () => {
  const { engine, captured } = makeEngine()
  const result = await engine._summarizeEnhanced(input, agent, undefined)
  const options = captured()
  const final = options.messages.at(-1)
  assert.equal(final.role, 'user')
  assert.equal(final.content[0].type, 'text')
  assert.match(final.content[0].text, /Goal: Ship the custom mode/)
  assert.match(final.content[0].text, /- \[in_progress\] write tests/)
  assert.equal(final.content[0].text.includes('## Authoritative state'), false)
  assert.equal(final.content[0].text.includes('## Current Goal'), false)
  assert.equal(options.maxTokens, 100)
  assert.equal(options.provider, 'p')
  assert.equal(options.model, 'm')
  assert.deepEqual(result.summary, [{ type: 'text', text: 'custom checkpoint text' }])
  assert.equal(result.llmStreamCall, true)
})

test('custom mode fails closed on empty output', async () => {
  const { engine } = makeEngine({ output: '' })
  await assert.rejects(
    engine._summarizeEnhanced(input, agent, undefined),
    (error) => error.code === 'BETTER_COMPACT_STRUCTURE' && /summary output is empty/.test(error.message),
  )
})

test('custom mode refuses a prompt that cannot fit the model window', async () => {
  const { engine } = makeEngine({ contextWindow: 10 })
  await assert.rejects(
    engine._summarizeEnhanced(input, agent, undefined),
    (error) => error.code === 'BETTER_COMPACT_BUDGET' && /custom prompt/.test(error.message),
  )
})
