import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, extractMarkdownPlainText, IconEditOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingQuestion, PlanReview, QuestionComposerProps } from './contract/slots.ts'
import { QuestionWaitBar } from './QuestionWaitBar.tsx'
import css from './PlanReviewPanel.module.css'

/** The panel's own props: the question domain face, the narrowed review, and the locale seat. */
export type PlanReviewPanelProps =
  { pending: PendingQuestion; review: PlanReview } & Pick<QuestionComposerProps, 't' | 'renderSlot' | 'useQuestionCard'>

/**
 * Optional-prop spread for a decision button's tooltip: `title` is optional on
 * the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
 *
 * @param description - the asker's option description, when it carries one.
 * @returns The `title` prop to spread, or nothing.
 */
function tooltip(description: string | undefined): { title?: string } {
  return description === undefined ? {} : { title: description }
}

/**
 * Render plan review controls; the submitted document opens in the sidebar.
 *
 * @param props - the question domain face, the narrowed plan review, and `t`.
 * @returns The plan-review takeover for this request.
 */
export function PlanReviewPanel({ pending, review, t, renderSlot, useQuestionCard }: PlanReviewPanelProps) {
  // Foreground decisions wait for the resolved frame; accepted Remote decisions
  // hide the panel. A failed send re-enables the buttons and shows the error.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const card = useQuestionCard(pending.key, snapshot => snapshot)
  const canDecide = card !== undefined && !card.closed && card.channel !== 'none'
  const surface = useRef<HTMLElement>(null)
  const sentVia = useRef<'waterfall' | null>(null)
  useEffect(() => {
    if (sentVia.current !== 'waterfall' || card?.state !== 'continued') return
    sentVia.current = null
    setBusy(false)
    setError(t('error.resubmit'))
  }, [card?.state, t])
  useEffect(() => {
    const release = (): void => { pending.releaseFocus() }
    const refocus = (): void => {
      if (surface.current?.contains(document.activeElement) === true) pending.holdFocus()
    }
    const visibilityChanged = (): void => { if (document.hidden) release(); else refocus() }
    window.addEventListener('blur', release)
    window.addEventListener('focus', refocus)
    document.addEventListener('visibilitychange', visibilityChanged)
    return () => {
      release()
      window.removeEventListener('blur', release)
      window.removeEventListener('focus', refocus)
      document.removeEventListener('visibilitychange', visibilityChanged)
    }
  }, [pending])
  const settle = (send: () => Promise<void>, remote = false): void => {
    setBusy(true)
    setError(null)
    sentVia.current = pending.snapshot().channel === 'waterfall' ? 'waterfall' : null
    void send()
      .then(() => {
        if (!remote) return
        setBusy(false)
        void pending.dismiss().catch(() => { setError(t('status.sent')) })
      })
      .catch((cause: unknown) => {
        sentVia.current = null
        setBusy(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  }
  const decide = (label: string): void => {
    settle(() => pending.answer({ answers: [{ id: review.id, selected: [label] }] }), pending.snapshot().channel === 'rpc')
  }
  const decline = review.decline
  const summary = useMemo(() => {
    const title = extractMarkdownPlainText(review.plan, { mode: 'first-line' })
    const description = extractMarkdownPlainText(review.plan, { mode: 'first-paragraph' })
    return { title, description: description === title ? '' : description }
  }, [review.plan])

  return (
    <div className={css.frame} data-plan-review-key={pending.key}>
      <section
        ref={surface} className={css.card} aria-label={review.question} aria-busy={busy}
        onFocusCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pending.holdFocus() }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) pending.releaseFocus() }}
      >
        <div className={css.strip}>
          <span className={css.panelLabel}>{t('plan.header')}</span>
          <div className={css.previewActions}>
            {renderSlot('conversation.plan-review.actions', { review, requestKey: pending.key })}
          </div>
        </div>
        <QuestionWaitBar card={card} t={t} busy={busy} onTakeTime={() => { pending.takeTime() }} />
        <div className={css.summary} data-plan-document>
          <div className={css.documentHeading}>
            <svg className={css.documentIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 12h6M9 16h6" /></svg>
            <h3 className={css.title}>{summary.title}</h3>
          </div>
          {summary.description !== '' && <p className={css.description}>{summary.description}</p>}
        </div>
        <div className={css.footer} data-plan-decision>
          <div className={css.feedback} role={error === null ? 'status' : 'alert'} aria-atomic="true" data-error={error !== null || undefined}>
            {busy && <span className={css.spinner} aria-hidden="true" />}
            {error ?? (busy ? t('submitting') : null)}
          </div>
          <div className={css.actions}>
            {decline !== undefined && (
              <button
                type="button" className={css.decline} {...tooltip(decline.description)}
                aria-describedby={decline.description === undefined ? undefined : `plan-decline-${pending.key}`}
                disabled={busy || !canDecide} onClick={() => { decide(decline.label) }}
              >
                {decline.label}
              </button>
            )}
            <Button
              variant="outline" className={css.discuss} icon={<IconEditOutlineRegular size={14} />}
              disabled={busy} onClick={() => { settle(() => pending.dismiss()) }}
            >
              {t('plan.discuss')}
            </Button>
            <Button
              variant="primary" className={css.primary} {...tooltip(review.approve.description)}
              aria-describedby={review.approve.description === undefined ? undefined : `plan-approve-${pending.key}`}
              disabled={busy || !canDecide} onClick={() => { decide(review.approve.label) }}
            >
              {t('plan.approve')}
            </Button>
          </div>
        </div>
        {decline?.description !== undefined && (
          <span className={css.srOnly} id={`plan-decline-${pending.key}`}>{decline.description}</span>
        )}
        {review.approve.description !== undefined && (
          <span className={css.srOnly} id={`plan-approve-${pending.key}`}>{review.approve.description}</span>
        )}
      </section>
    </div>
  )
}
