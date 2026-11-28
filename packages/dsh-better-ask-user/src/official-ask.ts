/**
 * Vendored official `ask_user_question` definition for compositions whose root
 * hides it from name lookups.
 *
 * DSH 0.2.3-alpha.3 resolves `ctx.tools.get()` through the scope's selected
 * root; a PTC root only answers `run_code`, so the official ask tool row cannot
 * be read there even though programs still bind it. This copy keeps the
 * model-facing schema and description that the native composition clones, so
 * the shadow registers with the same contract in both modes.
 */
import type { JsonSchemaNode, ToolDefinition } from '@deepseek-ai/dsh-tools'

/** Official pre-timed description, including the skipped-answer guidance. */
const DESCRIPTION = 'Ask the user a concise question when you need confirmation, a choice, or missing information before proceeding. '
  + 'An answer item with empty selected and no custom means the user skipped that question: '
  + 'continue without it, do not ask it again, and do not treat the skip as permission.'

/** Official legacy tool parameters, canonical JSON Schema as registered by the host. */
const PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      description: 'Questions to ask the user before continuing.',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          id: { type: 'string', description: 'Stable id for this question; echoed in the answer.' },
          question: { type: 'string', description: 'The specific question to ask the user.' },
          header: {
            type: 'string',
            description: 'Optional short heading for the question, such as "Confirm" or "Choose Mode".',
          },
          options: {
            type: 'array',
            description: 'Optional choices to show the user. If you recommend one, put it first and append "(Recommended)" to that label.',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                label: { type: 'string', description: 'Short user-facing option label.' },
                description: { type: 'string', description: 'One sentence explaining the tradeoff or impact.' },
              },
              required: ['label'],
            },
          },
          multi_select: {
            type: 'boolean',
            description: 'Whether the user may select more than one option. Defaults to false.',
          },
        },
        required: ['id', 'question'],
      },
    },
  },
  required: ['questions'],
}

/** Official legacy answers-only output schema; the shadow adds its pending branch. */
const OUTPUT_SCHEMA: JsonSchemaNode = {
  type: 'object',
  additionalProperties: false,
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          selected: { type: 'array', items: { type: 'string' } },
          custom: { type: 'string' },
        },
        required: ['id', 'selected'],
      },
    },
  },
  required: ['answers'],
}

/**
 * Build a fresh copy of the official definition.
 * @returns a schema-only base; the shadow replaces `execute` and never calls it.
 */
export function officialAskBase(): ToolDefinition {
  return {
    name: 'ask_user_question',
    description: DESCRIPTION,
    parameters: structuredClone(PARAMETERS),
    output: {
      schema: structuredClone(OUTPUT_SCHEMA),
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async () => {
      throw new Error('the vendored official ask base is schema-only')
    },
  }
}
