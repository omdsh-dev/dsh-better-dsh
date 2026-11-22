/**
 * Durable CLI identities live outside the compactable conversation surface.
 *
 * Compatibility contract: the KV namespace keeps the historical
 * `apollo_cli_<sha256(profile.dir)[:16]>` name, version 1, `sessions` table and
 * per-record layout. The package rename must NOT rename, copy or clear an
 * existing store: the same profile path has to reopen the same records so
 * already-created CLI subagents remain continuable after the upgrade.
 */

import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { KvUnit } from '@deepseek-ai/dsh-storage'
import type { CliSessionRecord } from './cli/types.js'

/** Historical namespace prefix; intentionally NOT derived from the new package name. */
export const KV_NAMESPACE_PREFIX = 'apollo_cli_'

/** Durable CLI identities live outside the compactable conversation surface. */
export async function openCliSessions(ctx: Context): Promise<CliSessions> {
  const profile = ctx.get('profileContext') as { dir?: string } | undefined
  const namespace = createHash('sha256').update(profile?.dir ?? 'default').digest('hex').slice(0, 16)
  const backend = ctx.storage.backend.get('json')
  if (!backend?.kv) throw new Error('Better Subagent CLI subagents require the JSON storage backend')
  const unit = await backend.kv.open({
    name: `${KV_NAMESPACE_PREFIX}${namespace}`, version: 1, tables: ['sessions'], hasGlobal: false, layout: 'per-record',
  })
  try {
    const snapshot = await unit.loadAll()
    return new CliSessions(unit, snapshot.tables.sessions ?? {})
  } catch (error) {
    await unit.close()
    throw error
  }
}

export class CliSessions {
  declare unit: Pick<KvUnit, 'putRecord' | 'deleteRecord' | 'close'>
  declare records: Map<string, unknown>
  declare writes: Promise<void>
  declare closed: boolean

  constructor(unit: Pick<KvUnit, 'putRecord' | 'deleteRecord' | 'close'>, records: Record<string, unknown> = {}) {
    this.unit = unit
    this.records = new Map(Object.entries(records))
    this.writes = Promise.resolve()
    this.closed = false
  }

  get(id: string): CliSessionRecord | undefined {
    const value = this.records.get(id) as Partial<CliSessionRecord> | undefined
    if (value === undefined) return undefined
    if (value?.version !== 1 || !['codex', 'claude'].includes(value.cli as string) || value.id !== id
      || typeof value.parentId !== 'string' || typeof value.cwd !== 'string'
      || typeof value.model !== 'string' || typeof value.effort !== 'string'
      || typeof value.executable !== 'string' || !Array.isArray(value.delivered)) {
      throw new Error(`Better Subagent CLI session ${id} has invalid stored state`)
    }
    return structuredClone(value) as CliSessionRecord
  }

  async put(record: CliSessionRecord): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(record.id)) throw new Error('Invalid Better Subagent CLI session id')
    const detached = structuredClone(record)
    await this.enqueue(async () => {
      await this.unit.putRecord('sessions', detached.id, detached)
      this.records.set(detached.id, detached)
    })
  }

  async delete(id: string): Promise<void> {
    await this.enqueue(async () => {
      await this.unit.deleteRecord('sessions', id)
      this.records.delete(id)
    })
  }

  enqueue(write: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Better Subagent CLI session store is closed'))
    const pending = this.writes.then(write)
    this.writes = pending.catch(() => {})
    return pending
  }

  async close(): Promise<void> {
    this.closed = true
    await this.writes
    await this.unit.close()
  }
}
