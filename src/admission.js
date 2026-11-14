import { isDeepStrictEqual } from 'node:util'

/** Do not run a turn or manual summary using pre-migration defaults. */
export function mountMigrationAdmission(ctx, options = {}) {
  let report = { status: 'pending' }
  let requiresReload = false
  let retries = 0
  const retryLimit = options.retryLimit ?? 1
  const accept = (result) => {
    report = result
    const compact = ctx.get?.('betterCompactConfig')
    requiresReload = result.status === 'complete' && result.compact?.fields?.length > 0
      && compact !== undefined && !isDeepStrictEqual(compact.snapshot(), compact.current())
  }
  const assertReady = () => {
    if (report.status !== 'complete') {
      const detail = report.error ?? report.compact?.error ?? report.compact?.reason ?? report.subagent?.error
      const error = new Error('Better DSH 配置迁移尚未完成（' + report.status + '）。请检查迁移诊断，修复配置后重载 profile。' + (detail ? ' ' + detail : ''))
      error.code = 'APOLLO_MIGRATION_PENDING'
      throw error
    }
    if (requiresReload) {
      const error = new Error('Better DSH 已迁移压缩配置，但当前引擎仍使用旧快照。请重载 profile 后继续；刷新网页不会应用压缩配置。')
      error.code = 'APOLLO_MIGRATION_RELOAD_REQUIRED'
      throw error
    }
  }
  // A load-time attempt that failed because the host mounted the plugin inside
  // an HMR transaction cannot write settings from inside that transaction, and
  // the per-process migration latch would otherwise keep the gate closed for
  // every later turn. Turns are not HMR transactions, so one bounded retry from
  // the turn path is enough to clear that transient failure (cold-boot races
  // where the target rows activate late are covered by the same retry).
  const refresh = async () => {
    if (report.status === 'complete' || typeof options.retry !== 'function') return
    if (retries >= retryLimit) return
    let result
    try {
      result = await options.retry()
    } catch {
      return
    }
    if (result === undefined) return
    retries += 1
    accept(result)
  }
  const step = async (_payload, next) => {
    await refresh()
    assertReady()
    return next()
  }
  ctx.on('agent/pre-step', step, { prepend: true })
  // Manual /compact does not enter pre-step. Guard its provider boundary too,
  // without replacing the compaction service or changing any request messages.
  ctx.on('llm/stream', async function* (_options, next) {
    await refresh()
    assertReady()
    yield* next()
  }, { prepend: true })
  return accept
}
