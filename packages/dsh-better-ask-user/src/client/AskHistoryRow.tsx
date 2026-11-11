/** History row for ask_user_question: compact summary plus a live or review action. */
import { useState } from 'react'
import { IconChevronRightOutlineRegular, IconQuestionOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps, UserQuestionRecord } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { AskUserQuestionItem } from '@deepseek-ai/dsh-user-questions/types'
import css from './AskHistoryRow.module.css'

type AskHistoryRowProps = ToolCallViewProps & PropsLocale<'question'> & InjectFace<{
  revealPanel: (callId: string) => boolean
  reviewPanel: (callId: string, record: UserQuestionRecord) => boolean
  keyedHooks: { questionPanelLive: (callId: string) => HostObservable<boolean> }
}>

interface AnswerEntry {
  id: string
  selected: string[]
  custom?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function resultText(content: readonly unknown[]): string | undefined {
  const parts: string[] = []
  for (const block of content) {
    if (!isRecord(block) || block.type !== 'text' || typeof block.text !== 'string') continue
    parts.push(block.text)
  }
  return parts.length === 0 ? undefined : parts.join('\n')
}

function questionList(argsRaw: string): AskUserQuestionItem[] | undefined {
  const parsed = parseJson(argsRaw)
  if (!isRecord(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return undefined
  const questions: AskUserQuestionItem[] = []
  for (const candidate of parsed.questions) {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.question !== 'string') return undefined
    questions.push({
      id: candidate.id,
      question: candidate.question,
      ...(typeof candidate.header === 'string' ? { header: candidate.header } : {}),
      ...(typeof candidate.detail === 'string' ? { detail: candidate.detail } : {}),
      ...(Array.isArray(candidate.options)
        ? {
            options: candidate.options.flatMap(option => isRecord(option) && typeof option.label === 'string'
              ? [{
                  label: option.label,
                  ...(typeof option.description === 'string' ? { description: option.description } : {}),
                }]
              : []),
          }
        : {}),
      ...(typeof candidate.multi_select === 'boolean' ? { multiSelect: candidate.multi_select } : {}),
    })
  }
  return questions
}

function answerList(text: string | undefined): AnswerEntry[] | undefined {
  if (text === undefined) return undefined
  const parsed = parseJson(text)
  if (!isRecord(parsed) || !Array.isArray(parsed.answers)) return undefined
  const answers: AnswerEntry[] = []
  for (const candidate of parsed.answers) {
    if (!isRecord(candidate)
      || typeof candidate.id !== 'string'
      || !Array.isArray(candidate.selected)
      || !candidate.selected.every(value => typeof value === 'string')
      || (candidate.custom !== undefined && typeof candidate.custom !== 'string')) return undefined
    answers.push({
      id: candidate.id,
      selected: candidate.selected,
      ...(candidate.custom === undefined ? {} : { custom: candidate.custom }),
    })
  }
  return answers
}

/**
 * The compact history re-entry for one ask call, top-level or nested.
 *
 * The action follows what is actually reachable, not a guess from the result
 * shape: a card still in the plugin registry opens the live panel, and a
 * settled call opens a read-only review built from its recorded answers. A
 * finished question therefore stays inspectable even when it recorded no
 * answers, and never offers a reopen that cannot succeed.
 */
export function AskHistoryRow({
  callId,
  block,
  phase,
  useProjection,
  useQuestionPanelLive,
  revealPanel,
  reviewPanel,
  t,
}: AskHistoryRowProps): React.JSX.Element {
  const [failedAction, setFailedAction] = useState<string | null>(null)
  const argsRaw = 'kind' in block ? block.call?.argsRaw ?? '' : 'argsRaw' in block ? block.argsRaw : ''
  const output = 'kind' in block ? resultText(block.content) : undefined
  const questions = questionList(argsRaw)
  // A late reply settles through the projection, not through a second tool result.
  const settled = useProjection('userQuestions', view => view?.settled.find(row => row.callId === callId))
  const answers = settled?.answers ?? answerList(output) ?? []
  // Every settled call with readable questions can be reviewed; an empty answer
  // batch still shows the question and its "no answer recorded" state.
  const record: UserQuestionRecord | undefined = questions !== undefined && phase === 'result'
    ? { questions, answers }
    : undefined
  const live = useQuestionPanelLive(callId, present => present === true)
  const errorCode = 'kind' in block ? block.error?.code : undefined
  // A live card is the truth; a terminal label belongs only to the settled view.
  const status = live
    ? undefined
    : errorCode === 'ASK_ABORTED' || errorCode === 'interrupted'
      ? t('history.interrupted')
      : errorCode === 'ASK_CANCELLED'
        ? t('history.cancelled')
        : undefined
  const summary = questions?.[0]?.question.split('\n').find(line => line.trim() !== '')?.trim() ?? t('history.title')
  const action = live
    ? () => revealPanel(callId)
    : record === undefined
      ? undefined
      : () => reviewPanel(callId, record)
  const review = !live && record !== undefined
  const actionKey = `${callId}-${review ? 'review' : 'open'}`
  const actionLabel = review ? t('history.review') : t('history.reopen')

  const trailing = action === undefined
    ? status === undefined ? null : <span className={css.state}>{status}</span>
    : (
      <span className={css.open}>
        {status !== undefined && <span className={css.state}>{status}</span>}
        {actionLabel}<IconChevronRightOutlineRegular size={14} />
      </span>
    )

  const content = (
    <>
      <span className={css.icon} aria-hidden="true"><IconQuestionOutlineRegular /></span>
      <span className={css.summary} title={summary}>{summary}</span>
      {trailing}
    </>
  )
  return (
    <div className={css.frame} role="group" aria-label={t('history.title')}>
      {action === undefined
        ? <div className={css.row} data-question-history={callId}>{content}</div>
        : <button
            type="button" className={css.row} data-question-history={callId} data-history-action={review ? 'review' : 'open'}
            onClick={() => { setFailedAction(action() ? null : actionKey) }}
            aria-label={`${actionLabel}${status === undefined ? '' : ` · ${status}`} · ${summary}`}
          >{content}</button>}
      {failedAction === actionKey && <span className={css.error} role="alert">{t('history.unavailable')}</span>}
    </div>
  )
}
