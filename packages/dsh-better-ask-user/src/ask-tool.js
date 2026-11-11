/** ask_user_question scope shadow: official contract plus the plugin-managed wait. */
import { ToolArgsError, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { TIMED_WAIT_PARAMETER } from '@deepseek-ai/dsh-user-questions'
import { buildDefaultAnswer } from './default-answer.js'

/** Model-visible notice for the native pending result. */
export const PENDING_QUESTION_NOTICE = 'No answer batch arrived before the timeout. This is pending, not a skipped answer. Continue useful independent work. The user can still answer; their reply will be a user message identified as answer_to_pending_question with this callId and the original questions. Do not treat this as permission.'

/** Model-visible warning for a host auto-selected default batch. */
export const AUTO_SELECTED_WARNING = 'These answers were auto-selected by the host timeout behavior, not submitted by the user. Do not treat them as user confirmation.'

function questionRequest(questions, exec) {
  return {
    questions: questions.map(question => ({
      id: question.id,
      question: question.question,
      ...(question.header !== undefined ? { header: question.header } : {}),
      ...(question.detail !== undefined ? { detail: question.detail } : {}),
      ...(question.options !== undefined ? {
        options: question.options.map(option => ({ ...option })),
      } : {}),
      ...(question.multi_select !== undefined ? { multiSelect: question.multi_select } : {}),
    })),
    ...(exec.agent !== undefined ? { agent: exec.agent } : {}),
    signal: exec.signal,
  }
}

function validateQuestionIds(questions) {
  const ids = new Set()
  for (const question of questions) {
    if (ids.has(question.id)) throw new Error('question id ' + JSON.stringify(question.id) + ' must be unique within this call')
    ids.add(question.id)
  }
}

function answerResult(result) {
  return {
    answers: result.answers.map(answer => ({
      id: answer.id,
      selected: [...answer.selected],
      ...(answer.custom !== undefined ? { custom: answer.custom } : {}),
    })),
    ...(result.autoSelected === true ? { autoSelected: true, warning: AUTO_SELECTED_WARNING } : {}),
  }
}

/** Add detail and the next host marker used to replay pending questions. */
function parametersWithDetail(parameters) {
  if (parameters === undefined) return parameters
  const next = structuredClone(parameters)
  // DSH classifies logged ask calls by this schema key, not by askTimed usage.
  next.properties[TIMED_WAIT_PARAMETER] = {
    type: 'integer',
    description: 'Host continuation marker; omit. The plugin setting, not this argument, controls foreground wait duration.',
  }
  const properties = next?.properties?.questions?.items?.properties
  if (properties !== undefined && properties.detail === undefined) {
    properties.detail = {
      type: 'string',
      description: 'Optional longer detail or context rendered as sanitized markdown below the question.',
    }
  }
  return next
}

/** Allow the additive auto-selected warning fields on the normal answer branch. */
function extendAutoSelectedSchema(schema) {
  const branches = Array.isArray(schema?.oneOf) ? schema.oneOf : [schema]
  for (const branch of branches) {
    const properties = branch?.properties
    if (properties?.answers === undefined) continue
    if (properties.autoSelected === undefined) {
      properties.autoSelected = {
        type: 'boolean',
        description: 'True when the host auto-selected the default batch after the timeout; not a user answer.',
      }
    }
    if (properties.warning === undefined) {
      properties.warning = { type: 'string', description: 'Model-visible warning for an auto-selected batch.' }
    }
  }
  return schema
}

/** The timed path can return the official pending shape; keep it valid. */
function outputWithPending(base) {
  const output = { ...base.output }
  const schema = extendAutoSelectedSchema(structuredClone(base.output.schema))
  if (Array.isArray(schema?.oneOf) && schema.oneOf.some(branch => branch?.properties?.pending !== undefined)) {
    output.schema = schema
    return output
  }
  output.schema = {
    oneOf: [
      schema,
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          pending: { type: 'boolean' },
          callId: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['pending', 'callId', 'message'],
      },
    ],
  }
  return output
}

/**
 * Build the ask_user_question shadow from the currently registered base tool.
 * @param ctx - root host context with userQuestions and optional goals.
 * @param base - existing official ask_user_question definition.
 * @param readConfig - live config reader.
 * @returns a ToolDefinition with the official contract and the plugin wait.
 */
export function createBetterAskTool(ctx, base, readConfig) {
  const output = outputWithPending(base)
  const parameters = parametersWithDetail(base.parameters)

  const execute = async (args, exec) => {
    const violations = validateJsonSchemaValue(parameters, args, '')
    if (violations.length > 0) throw new ToolArgsError(violations)
    validateQuestionIds(args.questions)

    const userQuestions = ctx.get('userQuestions')
    if (userQuestions === undefined) throw new Error('ask_user_question requires the userQuestions service')

    const config = readConfig()
    const goal = exec.agent === undefined ? undefined : ctx.get('goals')?.get?.(exec.agent)
    const goalActive = goal?.phase === 'active' && goal.activation === 'armed'
    const mode = goalActive ? config.goalTimeoutBehavior : config.timeoutBehavior
    const seconds = config.questionTimeoutSeconds
    const questions = questionRequest(args.questions, exec)
    const defaultAnswer = mode === 'default' && seconds !== -1
      ? answerResult(buildDefaultAnswer(args.questions))
      : undefined

    if (seconds === -1) {
      const result = await userQuestions.ask({ ...questions, wait: { callId: exec.callId } })
      return answerResult(result)
    }
    if (exec.agent === undefined) throw new Error('timed questions require a live agent')

    const waitMs = seconds * 1000
    const result = await userQuestions.askTimed({
      ...questions,
      agent: exec.agent,
      better: {
        waitMs,
        timeoutMode: mode,
        ...(defaultAnswer !== undefined ? { defaultAnswer } : {}),
      },
    }, exec.callId, waitMs)
    if ('pending' in result) {
      if (mode === 'default' && defaultAnswer !== undefined) return answerResult(defaultAnswer)
      return { ...result, message: PENDING_QUESTION_NOTICE }
    }
    return answerResult(result)
  }

  return { ...base, parameters, output, execute }
}