import { useRef } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { QuestionCardSnapshot } from './contract/slots.ts'
import css from './QuestionWaitBar.module.css'

/** A view of the carrier's countdown; the carrier owns every timing decision. */
export function QuestionWaitBar({ card, t, busy, onTakeTime }: {
  card: QuestionCardSnapshot | undefined
  t: PropsLocale<'question'>['t']
  busy: boolean
  onTakeTime: () => void
}) {
  const countdown = card?.countdown
  const initialWindow = useRef(countdown?.remainingMs)
  if (card === undefined || (countdown === undefined && card.state !== 'continued')) return null
  const continued = card.state === 'continued'
  const held = card.waitState === 'waiting' || card.waitState === 'editing'
  const running = !held && !continued && countdown?.running === true
  const seconds = Math.max(0, Math.ceil((countdown?.remainingMs ?? 0) / 1000))
  const duration = card.waitMs ?? initialWindow.current
  const fraction = duration === undefined || duration <= 0 ? undefined : Math.min(1, Math.max(0, (countdown?.remainingMs ?? 0) / duration))
  const status = continued ? t('wait.continued') : held ? t('wait.held')
    : t(!running ? 'wait.paused' : card.timeoutMode === 'default' ? 'wait.autoCountdown' : 'wait.countdown', { seconds })
  return (
    <div className={css.bar} data-question-wait data-wait-state={continued ? 'continued' : held ? 'held' : running ? 'counting' : 'paused'}>
      <span className={css.clock} aria-hidden="true">
        <svg viewBox="0 0 32 32" className={css.ring}>
          <circle className={css.track} cx="16" cy="16" r="13" />
          {!held && !continued && fraction !== undefined && <circle className={css.remaining} cx="16" cy="16" r="13" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - fraction)} />}
        </svg>
        {!running ? <svg className={css.pause} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">{continued ? <path d="m3 8 3 3 7-7" /> : <path d="M6 4v8M10 4v8" />}</svg> : <span className={css.clockHand} /> }
      </span>
      <div className={css.status} role={held || continued ? 'status' : undefined} aria-atomic="true">
        <span className={css.time} aria-label={status}>{held || continued ? status : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
        {!held && !continued && !running && <span className={css.policy}>{t('wait.pauseLabel')}</span>}
        {!held && !continued && <span className={css.policy}>{t(card.timeoutMode === 'default' ? 'wait.auto' : 'wait.extend')}</span>}
      </div>
      {!held && !continued && <button type="button" className={css.takeTime} disabled={busy} onClick={onTakeTime}>{t('wait.takeTime')}</button>}
    </div>
  )
}
