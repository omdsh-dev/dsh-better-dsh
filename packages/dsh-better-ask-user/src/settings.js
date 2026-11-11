/** Use the custom browser settings page and migrate the legacy goal wait. */

export const LEGACY_GOAL_NS = 'dsh-better-goal'
export const ASK_NS = 'dsh-better-ask-user'
export const MAX_QUESTION_TIMEOUT_SECONDS = 2147483
const WAIT_MS = 3000
const WAIT_INTERVAL_MS = 50

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms) })

function hasOwn(value, key) {
  return value !== null && typeof value === 'object' && Object.hasOwn(value, key)
}

async function descriptor(service, ns) {
  try {
    const rows = await service.describe()
    if (!Array.isArray(rows)) return undefined
    return rows.find(row => row?.ns === ns)
  } catch {
    return undefined
  }
}

function validSeconds(value) {
  return value === -1 || (Number.isInteger(value) && value >= 1 && value <= MAX_QUESTION_TIMEOUT_SECONDS)
}

/**
 * Copy an explicit legacy dsh-better-goal questionTimeoutSeconds into this
 * row's questionTimeoutSeconds. The target's explicit value always wins; the
 * source's default 120 is not treated as a custom value. Safe to repeat.
 * @param service - settings service with describe / update.
 * @returns a status report.
 */
export async function migrateLegacyQuestionTimeout(service) {
  if (typeof service?.describe !== 'function' || typeof service?.update !== 'function') {
    return { status: 'unavailable' }
  }
  const deadline = Date.now() + WAIT_MS
  let source = await descriptor(service, LEGACY_GOAL_NS)
  let target = await descriptor(service, ASK_NS)
  while ((source === undefined || target === undefined) && Date.now() < deadline) {
    await sleep(WAIT_INTERVAL_MS)
    source = await descriptor(service, LEGACY_GOAL_NS)
    target = await descriptor(service, ASK_NS)
  }
  if (source === undefined || target === undefined) return { status: 'pending' }
  if (!hasOwn(source.user, 'questionTimeoutSeconds')) return { status: 'no-change' }
  if (hasOwn(target.user, 'questionTimeoutSeconds')) return { status: 'no-change' }
  const value = source.value?.questionTimeoutSeconds
  if (!validSeconds(value)) return { status: 'no-change' }
  if (service.writable === false) return { status: 'pending' }
  try {
    await service.update(ASK_NS, { questionTimeoutSeconds: value }, target.revision)
  } catch (error) {
    return { status: 'error', error: error instanceof Error ? error.message : String(error) }
  }
  const after = await descriptor(service, ASK_NS)
  return after?.user?.questionTimeoutSeconds === value
    ? { status: 'complete', value }
    : { status: 'pending', value }
}

/** Use the custom browser settings page instead of a generated form. */
export function mountSettings(ctx) {
  ctx.inject(['settings'], (inner) => {
    const dispose = inner.settings.configure({ auto: false }, ctx.fiber)
    inner.effect(() => dispose, 'better-ask-user: settings page')
  })
}

/** Run the legacy goal-wait migration once the settings service is available. */
export function mountLegacyMigration(ctx) {
  ctx.inject(['settings'], (inner) => {
    const service = inner.settings ?? inner
    void migrateLegacyQuestionTimeout(service).catch((error) => {
      inner.logger?.warn?.('better-ask-user: legacy question wait migration failed: ' + String(error))
    })
  })
}