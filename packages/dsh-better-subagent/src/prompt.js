/**
 * Subagent-specific prompt ownership — the ONE runtime source for:
 * - delegation discipline (the subagent-related part only; Apollo's general
 *   engineering principles are not repeated here),
 * - fast/quality model tier rendering from live config,
 * - the PTC fan-out rule for `eng-ptc`,
 * - the child exit guard wording, and
 * - the Codex/Claude CLI catalog line.
 *
 * Registration strategy: on `agent/created`, register sections on that Agent's
 * own `agent.ctx.systemPrompt`. Per-agent scopes keep the text scoped to the
 * preset that created the Agent and dispose automatically with it. Each text is
 * a render function, so saved settings apply on the next request without
 * remounting, and the preset id is read from `agentPresets.composedPreset()`
 * with the session header/projection as fallback.
 */

import { currentConfig, normalizeConfig } from './config.js'
import { enabledIn } from './cli-adapter.js'
import { cliCatalog } from './subagents.js'

export const name = 'better-subagent-prompt'

export const inject = ['systemPrompt', 'agents']

/** Orders: delegation before the guard, both before the CLI catalog. */
export const DELEGATION_ORDER = 60
export const CHILD_GUARD_ORDER = 70
export const CLI_CATALOG_ORDER = 80

/** Presets that opt into the eng-scope subagent behavior. */
export const ENG_PRESETS = Object.freeze(['eng', 'eng-ptc'])

const DELEGATION_HEAD = `## Delegation
- Subagents cannot see this conversation: state the goal, write scope, deliverable, and verification, and give real file paths for prior outputs.
- Opening reconnaissance: when starting non-trivial work in an unfamiliar or large codebase, immediately dispatch fast-tier scouts in parallel (structure, relevant modules, conventions, test entry points), all in one message; the main agent reads only the instruction files that define the task. A scout prompt needs only goal, boundaries, and deliverable.
- Delegate read-only, parallelizable, stateless investigation by default instead of trying it in the main thread first; when a new unknown appears mid-task and 1–2 rounds of digging do not converge, delegate it.
- Implementation chunks with non-overlapping write scopes can run in parallel; keep linear work, tightly coupled changes, and debugging that needs live state in the main thread.`

const FANOUT_PTC = '- For repeated same-shaped work, dispatch all subagents inside one run_code program, then collect them with wait_subagent.'

const DELEGATION_TAIL = `- When you need a subagent's result, wait patiently with wait_subagent. Do not poll or prod it with send_message; send a message only to give it genuinely new information or a correction.
- The main agent owns integration, review, and final verification. Subagent reports are leads, not evidence: check the actual changes yourself.
- When a subagent ends in an error or empty result, read why, fix the cause, and re-dispatch once; take over in the main thread only if it fails again without an external blocker, and say why.`

const CHILD_EXIT_GUARD = `## Child exit guard
- If direct subagents are still running when the turn would end, the system injects a reminder and the turn continues. Wait for them with wait_subagent, then finish; interrupting the turn (Esc) always passes through.`

/** One tier as model-facing argument text; an unset tier inherits the parent route. */
export function renderTier(tier) {
  if (!tier?.provider || !tier?.model) return 'omit provider / model / reasoning_effort to inherit the parent route'
  const parts = [`provider: \`${tier.provider}\``, `model: \`${tier.model}\``]
  if (tier.reasoningEffort) parts.push(`reasoning_effort: \`${tier.reasoningEffort}\``)
  return parts.join(' · ')
}

/**
 * Render the delegation + model-tier section.
 * @param config - normalized Better Subagent config (`tiers`).
 * @param options - `{ ptc }` (true for the eng-ptc preset).
 * @returns the section markdown; never empty (scope gating happens outside).
 */
export function renderDelegation(config, options = {}) {
  const tiers = `## Subagent model tiers
- Fast tier (exploration, reconnaissance, mechanical analysis, batch triage): ${renderTier(config.tiers?.fast)}
- Quality tier (complex implementation, debugging, review, design): ${renderTier(config.tiers?.quality)}
- Start exploration on the fast tier; when coverage falls short or key questions remain, re-dispatch the unresolved part on the quality tier. Escalating means re-dispatching, not modifying an existing subagent.
- subagent_fork takes no model choice: it keeps the parent route to reuse the prefix cache.`
  return [DELEGATION_HEAD, ...(options.ptc ? [FANOUT_PTC] : []), DELEGATION_TAIL, tiers].join('\n')
}

/** Render the child exit guard paragraph (only while the switch is on). */
export function renderChildGuard() {
  return CHILD_EXIT_GUARD
}

/** Render the CLI catalog section text; empty when no backend is enabled. */
export function renderCliCatalog(config) {
  const catalog = cliCatalog(config)
  if (!catalog) return ''
  return [
    'Better Subagent CLI subagents: subagent also accepts provider="codex" or provider="claude"; model and reasoning_effort default to Better Subagent settings (list_subagent_models with that provider shows allowed values).',
    'They always run in the background, start in cwd (default: current directory) with permissions from Better Subagent settings; subagent_fork and agent_preset are unsupported.',
    'Control them by child id with send_message, wait_subagent, list_agents and interrupt_agent.',
    catalog,
  ].join('\n')
}

/**
 * Resolve the Agent's preset id: the composed preset (host authority) first,
 * then the session projection/header (works on compositions without the
 * preset registry).
 * @param ctx - plugin context.
 * @param agent - live Agent.
 * @returns preset id, or undefined.
 */
export function presetOf(ctx, agent) {
  let preset = agent?.session?.header?.agentPreset
  try {
    const projections = agent?.ctx?.get?.('sessionProjections')
    if (projections) preset = projections.stateOf(agent.session, 'agentPreset') ?? preset
  } catch { /* Optional registry: keep the header value. */ }
  try {
    const registry = ctx.get?.('agentPresets') ?? ctx.agentPresets
    const composed = registry?.composedPreset?.(agent.ctx)
    if (typeof composed === 'string' && composed !== '') preset = composed
  } catch { /* Optional registry: keep the projection/header value. */ }
  return preset
}

/** Whether the preset participates in the subagent scope. */
export function scopeEnabled(config, agent, preset) {
  if (normalizeConfig(config).subagents.global) return true
  if (!normalizeConfig(config).subagents.eng) return false
  return ENG_PRESETS.includes(preset)
}

/**
 * Register the per-agent prompt sections.
 * @param ctx - context with systemPrompt + agents.
 * @param config - row config (volatile refs allowed).
 * @returns disposer removing the creation listener.
 */
export function installPromptSections(ctx, config) {
  const registered = new WeakSet()

  const register = (agent) => {
    if (agent === undefined || agent === null || registered.has(agent)) return
    registered.add(agent)
    const systemPrompt = agent.ctx?.systemPrompt
    if (systemPrompt === undefined || typeof systemPrompt.section !== 'function') return
    const currentPreset = () => presetOf(ctx, agent)
    systemPrompt.section({
      name: 'better-subagent:delegation',
      order: DELEGATION_ORDER,
      interpolate: false,
      text: () => {
        const live = currentConfig(ctx, config)
        const preset = currentPreset()
        if (!scopeEnabled(live, agent, preset)) return ''
        return renderDelegation(live, { ptc: typeof preset === 'string' && preset.endsWith('ptc') })
      },
    })
    systemPrompt.section({
      name: 'better-subagent:child-guard',
      order: CHILD_GUARD_ORDER,
      interpolate: false,
      text: () => currentConfig(ctx, config).childExitGuard ? renderChildGuard() : '',
    })
    systemPrompt.section({
      name: 'better-subagent:cli-subagents',
      order: CLI_CATALOG_ORDER,
      interpolate: false,
      text: () => {
        const live = currentConfig(ctx, config)
        // Keep the historical routing scope (header/projection based) so the
        // model-facing catalog matches what the routing bridge accepts.
        if (!enabledIn(live, agent)) return ''
        return renderCliCatalog(live)
      },
    })
  }

  const off = ctx.on('agent/created', ({ agent }) => {
    try {
      register(agent)
    } catch (error) {
      ctx.logger?.warn?.(`better-subagent prompt sections were not registered: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  // Hot-loaded compositions may already have live Agents; cover them too.
  try {
    for (const agent of ctx.agents?.list?.() ?? []) {
      try { register(agent) } catch { /* one agent must not block the others */ }
    }
  } catch { /* list() is optional in fakes/older hosts */ }
  return off
}

export function mountPrompt(ctx, config) {
  ctx.inject(inject, (runtime) => {
    const dispose = installPromptSections(runtime, config)
    if (typeof runtime.effect === 'function') runtime.effect(() => dispose, 'better-subagent: prompt sections')
  })
}
