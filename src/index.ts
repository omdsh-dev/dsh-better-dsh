/**
 * Better DSH's single host row registers bundled skills, its own minimal row
 * settings, and the one-time old-config migration into the independent
 * dsh-better-subagent / dsh-better-compact / dsh-better-ask-user rows. Presets
 * are still delivered by bundle patches. Browser code is an esbuild-bundled
 * closure factory. The PTC deadline exemption is owned by the independent
 * dsh-better-ptc singleton row, not this package.
 *
 * Better DSH no longer implements subagent CLI protocols/routing, the wait tool,
 * capability/model HTTP probes, tier/delegation prompt generation or the child
 * exit guard — those are owned by the standalone plugins and only assembled
 * here through the shared stable rows.
 */

import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-skill'
import { mountMigration } from './migrate.js'
import { mountMigrationAdmission } from './admission.js'
import { mountSettings } from './settings.js'
export { Config } from './config.js'
export type { BetterDshConfig } from './config.js'

const PROVIDER_NAME = 'dsh-better-dsh'
/** Rank of bundled contributions in the local-provider ladder (user roots override). */
const BUNDLED_RANK = 600
const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))
const SKILLS_DIR = join(PACKAGE_ROOT, 'skills')
const SKILL_NAME = /^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/

/** Cordis plugin name (the profile row id is `apollo-skills`). */
export const name = 'apollo-skills'
/** Service required by the bundled skill provider. */
export const inject = ['skills']

/** Parsed SKILL.md frontmatter and body. */
interface ParsedSkill {
  name: string
  description: string
  whenToUse?: string
  disableModelInvocation?: boolean
  userInvocable?: boolean
  metadata: Record<string, string>
  body: string
}

/** One discovered candidate plus the data needed to load it later. */
interface ObservedSkill {
  file: string
  name: string
  summary: Omit<SkillCandidate, 'rank' | 'locator' | 'path' | 'metadata'> & {
    invocation: { modelInvocable: boolean; userInvocable: boolean }
    source: 'bundled'
  }
}

interface Discovery {
  candidates: SkillCandidate[]
  byLocator: Map<string, { file: string; name: string; summary: ObservedSkill['summary'] }>
}

/** Register the packaged skills provider, mount settings and old-config migration. */
export function apply(ctx: Context, config?: unknown): void {
  ctx.skills.registerProvider(() => createProvider(ctx))
  if (typeof ctx.inject === 'function') {
    const onResult = typeof ctx.on === 'function' ? mountMigrationAdmission(ctx as unknown as Parameters<typeof mountMigrationAdmission>[0]) : undefined
    const settings = mountSettings(ctx as unknown as Parameters<typeof mountSettings>[0], config)
    mountMigration(ctx as unknown as Parameters<typeof mountMigration>[0], config, { legacyImport: settings.legacyImport, onResult })
  }
}

function createProvider(ctx: Context): SkillProvider {
  let discovery: Promise<Discovery> | undefined
  const observed = (): Promise<Discovery> => (discovery ??= discover(ctx))
  return {
    name: PROVIDER_NAME,
    async list(_options: SkillLookupOptions) {
      return (await observed()).candidates
    },
    async get(candidate: SkillCandidate) {
      const entry = (await observed()).byLocator.get(String(candidate.locator))
      if (entry === undefined) return undefined
      const parsed = await parseSkillFile(entry.file)
      if (parsed === undefined || parsed.name !== entry.name) return undefined
      return {
        ...entry.summary,
        content: parsed.body,
        path: entry.file,
        metadata: parsed.metadata,
      } satisfies SkillDefinition
    },
  }
}

/** Scan the packaged skills tree once; malformed entries warn and skip. */
async function discover(ctx: Context): Promise<Discovery> {
  const candidates: SkillCandidate[] = []
  const byLocator = new Map<string, { file: string; name: string; summary: ObservedSkill['summary'] }>()
  let entries
  try {
    entries = await readdir(SKILLS_DIR, { withFileTypes: true })
  } catch (error) {
    ctx.logger.warn(`dsh-better-dsh: skills directory unreadable: ${error instanceof Error ? error.message : String(error)}`)
    return { candidates, byLocator }
  }
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue
    const file = join(SKILLS_DIR, entry.name, 'SKILL.md')
    const parsed = await parseSkillFile(file)
    if (parsed === undefined) {
      ctx.logger.warn(`dsh-better-dsh: skill file ${file} ignored: missing or invalid frontmatter`)
      continue
    }
    if (!SKILL_NAME.test(parsed.name)) {
      ctx.logger.warn(`dsh-better-dsh: skill file ${file} ignored: name "${parsed.name}" is not kebab-case`)
      continue
    }
    const summary: ObservedSkill['summary'] = {
      name: parsed.name,
      description: parsed.description,
      ...(parsed.whenToUse === undefined ? {} : { whenToUse: parsed.whenToUse }),
      invocation: {
        modelInvocable: parsed.disableModelInvocation !== true,
        userInvocable: parsed.userInvocable !== false,
      },
      provider: PROVIDER_NAME,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: dirname(file) },
    }
    const candidate: SkillCandidate = {
      ...summary,
      rank: BUNDLED_RANK,
      locator: file,
      path: file,
      metadata: parsed.metadata,
    }
    candidates.push(candidate)
    byLocator.set(file, { file, name: parsed.name, summary })
  }
  return { candidates, byLocator }
}

/**
 * Parse one SKILL.md: `---`-fenced frontmatter with single-line `key: value`
 * pairs, then the raw body. Values may be double- or single-quoted; unknown
 * keys are preserved in `metadata`. Returns undefined when the file cannot
 * be read or the frontmatter lacks `name` and `description`.
 */
async function parseSkillFile(file: string): Promise<ParsedSkill | undefined> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return undefined
  }
  const lines = raw.split('\n')
  if (lines[0] === undefined || lines[0].replace(/\r$/, '') !== '---') return undefined
  const fields = new Map<string, string>()
  let cursor = 1
  for (; cursor < lines.length; cursor += 1) {
    const line = lines[cursor].replace(/\r$/, '')
    if (line === '---') break
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line)
    if (match === null) return undefined
    fields.set(match[1], unquote(match[2].trim()))
  }
  if (cursor >= lines.length) return undefined
  const name = fields.get('name')
  const description = fields.get('description')
  if (typeof name !== 'string' || name === '' || typeof description !== 'string' || description === '') {
    return undefined
  }
  fields.delete('name')
  fields.delete('description')
  const whenToUse = fields.get('whenToUse')
  const disableModelInvocation = booleanField(fields, 'disable-model-invocation')
  if (disableModelInvocation === null) return undefined
  const userInvocable = booleanField(fields, 'user-invocable')
  if (userInvocable === null) return undefined
  fields.delete('whenToUse')
  fields.delete('disable-model-invocation')
  fields.delete('user-invocable')
  const metadata: Record<string, string> = {}
  for (const [key, value] of fields) metadata[key] = value
  return {
    name,
    description,
    ...(whenToUse === undefined ? {} : { whenToUse }),
    ...(disableModelInvocation === undefined ? {} : { disableModelInvocation }),
    ...(userInvocable === undefined ? {} : { userInvocable }),
    metadata,
    body: lines.slice(cursor + 1).join('\n'),
  }
}

/** Strip one pair of matching single or double quotes. */
function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  }
  return value
}

/**
 * Read one frontmatter boolean. Returns undefined for an absent field,
 * true/false for a valid value, and null for a present-but-invalid value,
 * which invalidates the whole file.
 */
function booleanField(fields: Map<string, string>, key: string): boolean | null | undefined {
  const value = fields.get(key)
  if (value === undefined || value === '') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}
