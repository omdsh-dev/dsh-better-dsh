import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  GOAL_SECTIONS,
  PROMPT_VARIABLES,
  assertSummaryStructure,
  buildCustomInstruction,
  customPromptVariables,
  expandCustomPrompt,
} from '../src/prompts.js'

const state = {
  goal: { objective: 'Ship the custom mode', phase: 'active', roundsStarted: 2, maxGoalRounds: 5 },
  todos: [
    { status: 'in_progress', content: 'write tests' },
    { status: 'pending', content: 'update docs' },
  ],
  questions: [{ callId: 'call-1', state: 'pending', questions: [{ question: 'Proceed?' }] }],
  jobs: [{ id: 'job-1', kind: 'bash', status: 'running', label: 'npm test' }],
  children: [{ id: 'child-1', depth: 1, label: 'scout' }],
}

const context = {
  target: { provider: 'p', model: 'm' },
  policy: { thresholdRatio: 0.8, retainRatio: 0.16 },
  sessionId: 'session-1',
  now: new Date('2026-11-08T00:00:00.000Z'),
}

test('the editor and runtime share exactly ten variables', () => {
  assert.deepEqual(
    PROMPT_VARIABLES.map((entry) => entry.token),
    ['goal', 'todos', 'questions', 'jobs', 'children', 'date', 'session', 'model', 'trigger', 'retain'],
  )
})

test('customPromptVariables renders authoritative state without inventing values', () => {
  const values = customPromptVariables(state, context)
  assert.match(values.goal, /Ship the custom mode/)
  assert.match(values.todos, /write tests/)
  assert.match(values.todos, /update docs/)
  assert.match(values.questions, /call-1/)
  assert.match(values.questions, /Proceed\?/)
  assert.match(values.jobs, /npm test/)
  assert.match(values.children, /scout/)
  assert.equal(values.date, '2026-11-08T00:00:00.000Z')
  assert.equal(values.session, 'session-1')
  assert.equal(values.model, 'p/m')
  assert.equal(values.trigger, '80%')
  assert.equal(values.retain, '16%')
  assert.equal(customPromptVariables({}, context).goal, '(no authoritative goal)')
  assert.equal(customPromptVariables({}, context).todos, '(no todos)')
  assert.equal(
    customPromptVariables({}, { ...context, policy: { thresholdRatio: 0.5, retainTokens: 1200 } }).retain,
    '1200 tokens',
  )
})

test('expandCustomPrompt replaces known variables once and leaves unknown tokens literal', () => {
  assert.equal(
    expandCustomPrompt('A {{goal}} B {{ missing }} C {{date}}', { goal: 'G', date: 'D' }),
    'A G B {{ missing }} C D',
  )
  assert.equal(expandCustomPrompt('{{ goal }}', { goal: 'spaced' }), 'spaced')
  assert.equal(expandCustomPrompt('{{goal}}', { goal: '{{date}}' }), '{{date}}')
  assert.equal(expandCustomPrompt('no variables', {}), 'no variables')
})

test('buildCustomInstruction is only the expanded prompt and fails closed when empty', () => {
  assert.equal(buildCustomInstruction('Keep {{goal}}.', { goal: 'the task' }), 'Keep the task.')
  assert.equal(buildCustomInstruction('{{unknown}}', {}), '{{unknown}}')
  assert.throws(
    () => buildCustomInstruction('   ', {}),
    (error) => error.code === 'BETTER_COMPACT_PROMPT' && /empty/.test(error.message),
  )
})

test('custom summaries accept any non-empty text; goal still requires its sections', () => {
  assert.doesNotThrow(() => assertSummaryStructure('a free-form checkpoint', 'custom'))
  assert.throws(() => assertSummaryStructure('   ', 'custom'), /summary output is empty/)
  assert.throws(() => assertSummaryStructure('a free-form checkpoint', 'goal'), /missing required sections/)
  assert.doesNotThrow(() => assertSummaryStructure(GOAL_SECTIONS.map((heading) => heading + '\n- x').join('\n'), 'goal'))
})
