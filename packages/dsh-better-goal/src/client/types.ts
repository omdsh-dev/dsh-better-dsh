import type * as React from 'react'
import type { GoalActivation, GoalPhase, GoalRef, GoalSnapshot } from '@deepseek-ai/dsh-goal/client'
export type { GoalPhase, GoalRef } from '@deepseek-ai/dsh-goal/client'

export type Dispose = () => void
export type Translate = (key: string, params?: Record<string, unknown> | null) => string
export type Implementation = 'native' | 'enhanced'
export type RoundLimitMode = 'agent' | 'unlimited' | 'fixed'
export interface GoalConfig {
  implementation: Implementation
  nativeDefaultMaxGoalRounds: number
  nativeBlockedAfterConsecutiveRounds: number
  roundLimitMode: RoundLimitMode
  roundLimit: number
  spinHintSeconds: number
  jobWaitSeconds: number
}
export type GoalDraft = { [K in keyof GoalConfig]: string }
export type NativeField = 'nativeDefaultMaxGoalRounds' | 'nativeBlockedAfterConsecutiveRounds'
export type ParseResult = { value: GoalConfig; error?: undefined; field?: undefined } | {
  value?: undefined
  error: 'invalidImplementation' | 'invalidMode' | 'invalidRoundLimit' | 'invalidNative' | 'invalidSpinHint' | 'invalidJobWait'
  field?: NativeField
}
export interface ConfigOp { op: 'set'; path: (keyof GoalConfig)[]; value: GoalConfig[keyof GoalConfig] }
export interface ConfigForm {
  state?: { status: string; revision?: number; value?: Record<string, unknown>; writable?: boolean }
  mutate(ops: ConfigOp[], revision: number | undefined): Promise<boolean>
}
export interface ConfigProps { form?: ConfigForm; t?: Translate; view?: string }
export interface RuntimeConfig {
  runtime?: { implementation?: Implementation }
  requiresReload?: boolean
  activeConfig?: GoalConfig
}
export type Activation = GoalActivation
export type Goal = GoalSnapshot
export interface GoalHistoryEntry extends Goal { cleared?: boolean; roundsStarted: number; updatedAt: number }
export interface HistoryProjection { entries: GoalHistoryEntry[]; error: string | null }
export interface GoalProjection { goal?: Goal | null; roundsStarted?: number }
export interface ActionResult { ok: boolean; error?: { code?: string; message?: string } }
export type GoalAction = () => Promise<ActionResult | undefined>
export interface GoalActions {
  onEdit(objective: string): Promise<ActionResult | undefined>
  onPause: GoalAction
  onResume: GoalAction
  onClear: GoalAction
}
export interface GoalBarProps extends GoalActions {
  goal?: Goal | null
  roundsStarted?: number
  activation?: Activation
  onHistory?: () => void
  historyOpen?: boolean
  t?: Translate
}
export interface GoalHistoryProps {
  history?: HistoryProjection | null
  currentGoalId?: string
  currentPhase?: GoalPhase
  open?: boolean
  onToggle?: () => void
  showTrigger?: boolean
  t?: Translate
}
export interface ActivationSnapshot { id?: string; revision?: number; activation?: Activation }
export interface Observable<T> { getSnapshot(): T; subscribe(listener: () => void): Dispose }
export interface SessionState { running?: boolean; openState?: string; openError?: unknown }
export interface Session extends Observable<SessionState> { projections: { faceOf(key: string): Observable<unknown> } }
export interface SessionBinding { session: Session }
export interface ActivationDeps {
  projection: Observable<unknown>
  session: Observable<SessionState>
  getGoal(): Promise<{ ok: boolean; value?: ActivationSnapshot } | undefined>
  subscribeActivation(listener: (goal: ActivationSnapshot | undefined) => void): Dispose
  subscribeReset(listener: () => void): Dispose
}
export interface UseProjection {
  (key: 'goal'): GoalProjection | null | undefined
  (key: 'better-goal-history'): HistoryProjection | null | undefined
}
export interface GoalDockProps extends GoalActions {
  useProjection?: UseProjection
  useGoalActivation?: (selector: (snapshot: ActivationSnapshot) => Activation | undefined) => Activation | undefined
  t?: Translate
}
export interface GoalContext {
  sessions: {
    binding(sessionId: string): SessionBinding | undefined
    using<T>(sessionId: string, options: { source: string }, callback: (reference: { binding: SessionBinding }) => Promise<T>): Promise<T>
  }
  remote: {
    goals: {
      edit(sessionId: string, ref: GoalRef, update: { objective: string }): Promise<ActionResult>
      pause(sessionId: string, ref: GoalRef): Promise<ActionResult>
      resume(sessionId: string, ref: GoalRef): Promise<ActionResult>
      clear(sessionId: string, ref: GoalRef): Promise<ActionResult>
      get(sessionId: string): ReturnType<ActivationDeps['getGoal']>
    }
    $on(event: string, listener: (event: { sessionId: string; goal?: ActivationSnapshot }) => void): Dispose
  }
  on(event: string, listener: () => void): Dispose
  locale: { register(namespace: string, dictionaries: Record<string, Record<string, string>>): Dispose; bind(namespace: string): Translate }
  effect(callback: () => Dispose, label: string): void
  // Slot overloads are supplied dynamically by the host and differ by slot name.
  slots: {
    inject(name: string, callback: () => Dispose): Dispose
    register(options: { name: string; id?: string; order?: number; locale: string; key?: string; inject?: (sessionId: string) => unknown }, component: React.ComponentType<any>): Dispose
  }
}
export interface IconButtonProps {
  label: string
  disabled?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onBlur?: React.FocusEventHandler<HTMLButtonElement>
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>
  expanded?: boolean
  danger?: boolean
  armed?: boolean
  buttonRef?: React.Ref<HTMLButtonElement>
  children?: React.ReactNode
}
export interface ChoiceProps {
  id?: string
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  onChange(value: string): void
}
export interface FieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  t?: Translate
  children?: React.ReactNode
}
