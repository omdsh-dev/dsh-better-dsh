/** Row configuration page: question wait and timeout behavior. */
import { useCallback, useId, useState, type ReactNode } from 'react'
import type { SettingsKey } from './settings-locales.ts'
import { settingsEn } from './settings-locales.ts'
import css from './settings.module.css'

const DEFAULTS = { questionTimeoutSeconds: 120, timeoutBehavior: 'native', goalTimeoutBehavior: 'native' } as const
const MAX_QUESTION_TIMEOUT_SECONDS = 2147483

type Behavior = 'native' | 'default'
interface ConfigValue {
  questionTimeoutSeconds: number
  timeoutBehavior: Behavior
  goalTimeoutBehavior: Behavior
}
interface Draft {
  questionTimeoutSeconds: string
  timeoutBehavior: Behavior
  goalTimeoutBehavior: Behavior
}
interface DraftState {
  revision: number
  value: Draft
}

const fallbackT = (key: SettingsKey): string => settingsEn[key]

function normalize(value: any): ConfigValue {
  const seconds = value?.questionTimeoutSeconds
  return {
    questionTimeoutSeconds: seconds === -1 || (Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_QUESTION_TIMEOUT_SECONDS)
      ? seconds
      : DEFAULTS.questionTimeoutSeconds,
    timeoutBehavior: value?.timeoutBehavior === 'default' ? 'default' : 'native',
    goalTimeoutBehavior: value?.goalTimeoutBehavior === 'default' ? 'default' : 'native',
  }
}

function toDraft(value: ConfigValue): Draft {
  return {
    questionTimeoutSeconds: String(value.questionTimeoutSeconds),
    timeoutBehavior: value.timeoutBehavior,
    goalTimeoutBehavior: value.goalTimeoutBehavior,
  }
}

function parseSeconds(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '-1') return -1
  if (!/^[0-9]+$/.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_QUESTION_TIMEOUT_SECONDS ? value : undefined
}

function same(left: ConfigValue, right: ConfigValue): boolean {
  return left.questionTimeoutSeconds === right.questionTimeoutSeconds
    && left.timeoutBehavior === right.timeoutBehavior
    && left.goalTimeoutBehavior === right.goalTimeoutBehavior
}

function parseDraft(draft: Draft): ConfigValue | undefined {
  const seconds = parseSeconds(draft.questionTimeoutSeconds)
  if (seconds === undefined) return undefined
  return { questionTimeoutSeconds: seconds, timeoutBehavior: draft.timeoutBehavior, goalTimeoutBehavior: draft.goalTimeoutBehavior }
}

/** Native radio semantics with one compact segmented surface. */
function Choices({ id, value, options, disabled, describedBy, onChange }: {
  id: string
  value: string
  options: Array<{ value: string; label: string }>
  disabled: boolean
  describedBy?: string
  onChange: (value: string) => void
}) {
  const name = useId()
  return (
    <div className={css.choices} id={id} role="radiogroup" aria-labelledby={`${id}-label`} aria-disabled={disabled}>
      {options.map((option) => (
        <label className={css.choice} key={option.value}>
          <input
            id={`${id}-${option.value}`}
            type="radio" name={name} value={option.value}
            checked={value === option.value} disabled={disabled}
            aria-describedby={describedBy}
            onChange={() => { onChange(option.value) }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  )
}

/** Radio-backed choice cards with a small diagram per consequence. */
function ChoiceCards({ id, value, options, disabled, describedBy, onChange }: {
  id: string
  value: string
  options: Array<{ value: string; label: string; description: string; diagram: ReactNode }>
  disabled: boolean
  describedBy?: string
  onChange: (value: string) => void
}) {
  const name = useId()
  return (
    <div className={css.cards} id={id} role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={describedBy} aria-disabled={disabled}>
      {options.map((option) => (
        <label className={css.card} key={option.value} data-choice={option.value}>
          <input
            id={`${id}-${option.value}`}
            className={css.cardInput}
            type="radio" name={name} value={option.value}
            checked={value === option.value} disabled={disabled}
            aria-describedby={`${id}-${option.value}-desc`}
            onChange={() => { onChange(option.value) }}
          />
          <span className={css.cardHead}>
            <span className={css.cardName}>{option.label}</span>
            <span className={css.cardMark} aria-hidden="true" />
          </span>
          <span className={css.cardDesc} id={`${id}-${option.value}-desc`}>{option.description}</span>
          <span className={css.cardDiagram} aria-hidden="true">{option.diagram}</span>
        </label>
      ))}
    </div>
  )
}

/** Question goes out, wait, then the timeout keeps it open and answerable. */
function OpenFlow() {
  return (
    <svg viewBox="0 0 104 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="5" width="24" height="14" rx="3" />
      <path d="M7 10h12M7 14h7" strokeWidth="1" />
      <path d="M27 12h14" />
      <circle cx="47" cy="12" r="4" />
      <path d="M51 12h14" />
      <path d="m61 8 4 4-4 4" />
      <path d="M71 7v10M78 7v10M85 7v10" strokeWidth="1" />
    </svg>
  )
}

/** Question goes out, wait, then the default answer is selected automatically. */
function DefaultFlow() {
  return (
    <svg viewBox="0 0 104 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="1" y="5" width="24" height="14" rx="3" />
      <path d="M7 10h12M7 14h7" strokeWidth="1" />
      <path d="M27 12h16" />
      <circle cx="49" cy="12" r="4" />
      <path d="M53 12h16" />
      <circle cx="78" cy="12" r="7" />
      <path d="m75 12 2 2 4-4" />
    </svg>
  )
}

/** Page body, rendered inside the settings host's row config page. */
export function SettingsPage({ form, t = fallbackT }: { form?: any; t?: (key: SettingsKey) => string }) {
  const state = form?.state
  const revision: number | undefined = state?.revision
  const host = state?.status === 'ready' ? normalize(state.value) : null
  const base = host === null ? null : toDraft(host)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [busy, setBusy] = useState(false)
  const [timedSeconds, setTimedSeconds] = useState(String(DEFAULTS.questionTimeoutSeconds))
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const live = draft !== null && draft.revision === revision ? draft.value : base
  const parsed = live === null ? undefined : parseDraft(live)
  const writable = state?.status === 'ready' && state?.writable === true
  const dirty = host !== null && (parsed === undefined || !same(host, parsed))

  const edit = useCallback((mutate: (baseDraft: Draft) => Draft) => {
    setNotice(null)
    if (base === null) return
    setDraft((previous) => {
      const current = previous !== null && previous.revision === revision ? previous.value : base
      return { revision: revision ?? 0, value: mutate(current) }
    })
  }, [base, revision])

  const save = useCallback(async () => {
    if (form === undefined || host === null || parsed === undefined) return
    if (!writable || busy || !dirty) return
    const ops: Array<{ op: 'set'; path: string[]; value: unknown }> = []
    if (host.questionTimeoutSeconds !== parsed.questionTimeoutSeconds) {
      ops.push({ op: 'set', path: ['questionTimeoutSeconds'], value: parsed.questionTimeoutSeconds })
    }
    if (host.timeoutBehavior !== parsed.timeoutBehavior) {
      ops.push({ op: 'set', path: ['timeoutBehavior'], value: parsed.timeoutBehavior })
    }
    if (host.goalTimeoutBehavior !== parsed.goalTimeoutBehavior) {
      ops.push({ op: 'set', path: ['goalTimeoutBehavior'], value: parsed.goalTimeoutBehavior })
    }
    if (ops.length === 0) return
    setBusy(true)
    setNotice(null)
    try {
      const accepted = await form.mutate(ops, revision)
      if (accepted) setNotice({ tone: 'ok', text: t('saved') })
      else setNotice({ tone: 'error', text: t('conflict') })
    } catch (error) {
      setNotice({ tone: 'error', text: t('saveFailed') + String((error as any)?.message ?? error) })
    } finally {
      setBusy(false)
    }
  }, [busy, dirty, form, host, parsed, revision, t, writable])

  if (state === undefined) {
    return <div className={css.cfg}><p className={css.note} role="status">{t('waiting')}</p></div>
  }
  if (state.status === 'loading') {
    return <div className={css.cfg}><p className={css.note} role="status">{t('loading')}</p></div>
  }
  if (host === null || live === null) {
    return <div className={css.cfg}><p className={css.note} role="alert">{t('unavailable')}</p></div>
  }

  const invalid = parsed === undefined
  const unlimited = live.questionTimeoutSeconds === '-1'
  const controlsDisabled = !writable || busy
  const seconds = parsed?.questionTimeoutSeconds
  const waitAmount = unlimited ? '∞' : seconds === undefined ? '—' : `${t('timelineWait')} ${seconds} ${t('seconds')}`
  const presets = [
    { seconds: 30, label: `30${t('secondShort')}` },
    { seconds: 120, label: `2${t('minuteShort')}` },
    { seconds: 300, label: `5${t('minuteShort')}` },
    { seconds: 600, label: `10${t('minuteShort')}` },
  ]
  const behaviorCards = [
    { value: 'native', label: t('native'), description: t('nativeHint'), diagram: <OpenFlow /> },
    { value: 'default', label: t('default'), description: t('defaultHint'), diagram: <DefaultFlow /> },
  ]

  return (
    <div className={css.cfg} aria-busy={busy} data-settings-dirty={dirty} data-settings-busy={busy}>
      <header className={css.pageHead}>
        <h2 className={css.title} id="better-ask-user-title">{t('title')}</h2>
        <p className={css.purpose}>{t('purpose')}</p>
        {writable ? null : <span className={css.badge} role="status">{t('readonly')}</span>}
      </header>
      <section className={css.group} aria-label={t('title')}>
        <div className={css.section} data-ask-section="wait">
          <div className={css.waitHead}>
            <h3 className={css.sectionLabel} id="better-ask-user-wait-mode-label">{t('waitLabel')}</h3>
            <Choices
              id="better-ask-user-wait-mode" value={unlimited ? 'unlimited' : 'timed'}
              options={[{ value: 'timed', label: t('timed') }, { value: 'unlimited', label: t('unlimited') }]}
              disabled={controlsDisabled} describedBy="better-ask-user-wait-hint"
              onChange={(value) => {
                const nextUnlimited = value === 'unlimited'
                if (nextUnlimited && !invalid) setTimedSeconds(live.questionTimeoutSeconds)
                edit(current => ({ ...current, questionTimeoutSeconds: nextUnlimited ? '-1' : timedSeconds }))
              }}
            />
          </div>
          {unlimited ? null : <div className={css.waitControl}>
            <span className={css.duration}>
              <input
                id="better-ask-user-wait" className={css.input}
                aria-label={t('durationLabel')}
                aria-describedby={invalid ? 'better-ask-user-error' : 'better-ask-user-wait-hint'}
                type="text" inputMode="numeric" aria-invalid={invalid || undefined}
                value={live.questionTimeoutSeconds} disabled={controlsDisabled}
                onChange={(event) => { edit(current => ({ ...current, questionTimeoutSeconds: event.target.value })) }}
              />
              <span className={css.unit}>{t('seconds')}</span>
            </span>
            <div className={css.presets} role="group" aria-label={t('presetLabel')}>
              {presets.map((preset) => (
                <button
                  key={preset.seconds} type="button" className={css.chip}
                  data-preset={preset.seconds}
                  aria-pressed={seconds === preset.seconds}
                  disabled={controlsDisabled}
                  onClick={() => { edit(current => ({ ...current, questionTimeoutSeconds: String(preset.seconds) })) }}
                >{preset.label}</button>
              ))}
            </div>
          </div>}
          <div className={css.timeline} data-unlimited={unlimited} aria-hidden="true">
            <span className={css.timelineNode}>{t('timelineAsk')}</span>
            <span className={css.timelineRail}>
              <span className={css.timelineChip}>{waitAmount}</span>
            </span>
            <span className={css.timelineNode}>{unlimited ? t('unlimited') : t('timelineEnd')}</span>
          </div>
          <p className={css.sectionNote} id="better-ask-user-wait-hint">{t(unlimited ? 'unlimitedHint' : 'waitHint')}</p>
          {invalid && <p className={css.fieldError} id="better-ask-user-error" role="alert">{t('invalidWait')}</p>}
        </div>
        {unlimited ? null : <div className={css.section} data-ask-section="timeout">
          <h3 className={css.sectionLabel} id="better-ask-user-behavior-label">{t('timeoutTitle')}</h3>
          <ChoiceCards
            id="better-ask-user-behavior" value={live.timeoutBehavior} options={behaviorCards}
            disabled={controlsDisabled}
            onChange={(value) => { edit(current => ({ ...current, timeoutBehavior: value as Behavior })) }}
          />
        </div>}
        <div className={css.section} data-ask-section="goal">
          <h3 className={css.sectionLabel} id="better-ask-user-goal-behavior-label">{t('goalBehaviorLabel')}</h3>
          <p className={css.sectionNote} id="better-ask-user-goal-hint">{t('goalExplain')}</p>
          <ChoiceCards
            id="better-ask-user-goal-behavior" value={live.goalTimeoutBehavior} options={behaviorCards}
            disabled={controlsDisabled} describedBy="better-ask-user-goal-hint"
            onChange={(value) => { edit(current => ({ ...current, goalTimeoutBehavior: value as Behavior })) }}
          />
        </div>
      </section>
      {notice !== null && <p className={notice.tone === 'ok' ? css.status : css.fieldError} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      {dirty && <div className={css.footer} id="better-ask-user-settings-footer">
        <span className={css.status}>{t('dirty')}</span>
        <button type="button" className={css.button} id="better-ask-user-discard" disabled={controlsDisabled} onClick={() => {
          setDraft(null)
          setNotice(null)
          setTimedSeconds(String(host.questionTimeoutSeconds === -1 ? DEFAULTS.questionTimeoutSeconds : host.questionTimeoutSeconds))
        }}>{t('discard')}</button>
        <button
          type="button" className={css.primary} data-settings-save disabled={controlsDisabled || invalid}
          aria-busy={busy} onClick={() => { void save() }}
        >
          {busy && <span className={css.spinner} aria-hidden="true" />}
          {busy ? t('saving') : t('save')}
        </button>
      </div>}
    </div>
  )
}

/** Row-config entry component: list summary plus the page body. */
export function SettingsEntry(props: any) {
  const t = props.t ?? fallbackT
  if (props.view === 'summary') return <span>{t('summary')}</span>
  return <SettingsPage form={props.form} t={t} />
}
