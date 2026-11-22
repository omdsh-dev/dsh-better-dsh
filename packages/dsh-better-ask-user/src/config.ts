/** Formal row Config and live-value normalization. */
import z from '@deepseek-ai/schemastery'

/** Largest question wait a native platform timer can represent, in seconds. */
export const MAX_QUESTION_TIMEOUT_SECONDS = 2147483

/** Plain defaults mirrored by the client form. */
export const DEFAULTS = Object.freeze({
  questionTimeoutSeconds: 120,
  timeoutBehavior: 'native',
  goalTimeoutBehavior: 'native',
})

const QuestionTimeout = z
  .union([z.const(-1), z.natural().min(1).max(MAX_QUESTION_TIMEOUT_SECONDS)])
  .default(DEFAULTS.questionTimeoutSeconds)

/** The plugin row's formal configuration; every field hot-updates. */
export const Config = z.object({
  questionTimeoutSeconds: QuestionTimeout.volatile(),
  timeoutBehavior: z.union(['native', 'default']).default(DEFAULTS.timeoutBehavior).volatile(),
  goalTimeoutBehavior: z.union(['native', 'default']).default(DEFAULTS.goalTimeoutBehavior).volatile(),
})

export interface AskConfig {
  questionTimeoutSeconds: number
  timeoutBehavior: 'native' | 'default'
  goalTimeoutBehavior: 'native' | 'default'
}

function primitive(value: unknown): unknown {
  return value !== null && typeof value === 'object' && typeof (value as { get?: unknown }).get === 'function'
    ? (value as { get(): unknown }).get()
    : value
}

/** Normalize arbitrary live config to the exact default shape; never throw. */
export function normalizeConfig(value: unknown): AskConfig {
  const source = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  const seconds = primitive(source.questionTimeoutSeconds)
  const behavior = primitive(source.timeoutBehavior)
  const goalBehavior = primitive(source.goalTimeoutBehavior)
  return {
    questionTimeoutSeconds: seconds === -1
      || (typeof seconds === 'number' && Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_QUESTION_TIMEOUT_SECONDS)
      ? seconds
      : DEFAULTS.questionTimeoutSeconds,
    timeoutBehavior: behavior === 'native' || behavior === 'default'
      ? behavior
      : DEFAULTS.timeoutBehavior,
    goalTimeoutBehavior: goalBehavior === 'native' || goalBehavior === 'default'
      ? goalBehavior
      : DEFAULTS.goalTimeoutBehavior,
  }
}

/** Read the current live config. */
export function readConfig(value: unknown): AskConfig {
  return normalizeConfig(value)
}
