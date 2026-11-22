import { isDeepStrictEqual } from 'node:util'

/** One migration section's report shape (subset consumed by admission). */
export interface MigrationSectionReport {
  error?: string
  reason?: string
  fields?: string[]
  [key: string]: unknown
}

/** The report returned by runMigration and consumed by the admission gate. */
export interface MigrationReport {
  status: string
  error?: string
  compact?: MigrationSectionReport
  subagent?: MigrationSectionReport
  [key: string]: unknown
}

/** Minimal context used by the admission gate. */
export interface AdmissionContext {
  on(event: string, listener: (...args: any[]) => any, options?: { prepend?: boolean }): unknown
  get?(name: string): any
}

/** Do not run a turn or manual summary using pre-migration defaults. */
export function mountMigrationAdmission(ctx: AdmissionContext): (result: MigrationReport) => void {
  let report: MigrationReport = { status: 'pending' }
  let requiresReload = false
  const assertReady = (): void => {
    if (report.status !== 'complete') {
      const detail = report.error ?? report.compact?.error ?? report.compact?.reason ?? report.subagent?.error
      const error = new Error('Better DSH 配置迁移尚未完成（' + report.status + '）。请检查迁移诊断，修复配置后重载 profile。' + (detail ? ' ' + detail : '')) as Error & { code: string }
      error.code = 'APOLLO_MIGRATION_PENDING'
      throw error
    }
    if (requiresReload) {
      const error = new Error('Better DSH 已迁移压缩配置，但当前引擎仍使用旧快照。请重载 profile 后继续；刷新网页不会应用压缩配置。') as Error & { code: string }
      error.code = 'APOLLO_MIGRATION_RELOAD_REQUIRED'
      throw error
    }
  }
  ctx.on('agent/pre-step', (_payload: unknown, next: () => unknown) => {
    assertReady()
    return next()
  }, { prepend: true })
  // Manual /compact does not enter pre-step. Guard its provider boundary too,
  // without replacing the compaction service or changing any request messages.
  ctx.on('llm/stream', async function* (_options: unknown, next: () => AsyncIterable<unknown>) {
    assertReady()
    yield* next()
  }, { prepend: true })
  return (result: MigrationReport): void => {
    report = result
    const compact = ctx.get?.('betterCompactConfig')
    requiresReload = result.status === 'complete' && (result.compact?.fields?.length ?? 0) > 0
      && compact !== undefined && !isDeepStrictEqual(compact.snapshot(), compact.current())
  }
}
