/**
 * dsh-better-subagent — single host-plane row.
 *
 * One plugin instance owns everything subagent-specific:
 * - formal volatile Config (re-exported for the Loader) and the row-config page;
 * - read-only `/better-subagent/api/*` routes (+ `/apollo/api/*` read aliases);
 * - Codex/Claude managed llm adapters and the `subagent` routing bridge over the
 *   native subagent registry (no second spawn/fork registry);
 * - the host-plane `wait_subagent` tool;
 * - the running-direct-child exit guard; and
 * - the per-Agent prompt sections (delegation, tiers, PTC fanout, CLI catalog,
 *   child-guard wording).
 *
 * Nothing external is started unless a backend is explicitly enabled; defaults
 * keep both CLI backends off and the child exit guard off.
 */

import { mountChildExitGuard } from './child-exit-guard.js'
import { mountPrompt } from './prompt.js'
import { mountPtcExemption } from './ptc-exemption.js'
import { mountSettings } from './settings.js'
import { mountSubagents } from './subagents.js'
import { mountWaitSubagent } from './wait-subagent.js'

export { Config } from './config.js'

/** Cordis plugin name (the profile row id is `dsh-better-subagent`). */
export const name = 'dsh-better-subagent'

/**
 * Mount the whole host-plane plugin.
 * @param ctx - plugin context.
 * @param config - row config (volatile references allowed).
 */
export function apply(ctx, config) {
  mountSettings(ctx, config)
  mountSubagents(ctx, config)
  mountWaitSubagent(ctx, config)
  mountPtcExemption(ctx)
  mountChildExitGuard(ctx, config)
  mountPrompt(ctx, config)
}
