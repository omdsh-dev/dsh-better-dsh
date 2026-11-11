/**
 * dsh-better-subagent — settings wiring (src/settings.js).
 *
 * Two things that must wait until their services are available:
 *
 * 1. **Read-only API**: `ctx.inject(['webServer'])` registers the
 *    `/better-subagent/api/*` routes (plus the `/apollo/api/*` read aliases)
 *    through `registerCapabilitiesRoute`; the handler itself lives in
 *    `src/panel.js`. Compositions without a webServer skip this and the rest of
 *    the plugin still loads.
 *
 * 2. **Row config page policy**: `ctx.inject(['settings'])` registers
 *    `configure({ auto: false }, ctx.fiber)` for this plugin instance — the
 *    browser half (`plugins.row.config`) is the only editing surface, so DSH
 *    must not also generate a schema page. The policy is disposed with the
 *    row's effect.
 *
 * There is intentionally no legacy-file import: migrating Apollo's old
 * `exitGuard`/settings into this plugin belongs to the Apollo integration
 * (S4), which owns the migration decision and the old files.
 */

import { registerCapabilitiesRoute } from './panel.js'

/**
 * Mount the settings-side pieces.
 *
 * Every action waits for its service: headless compositions without
 * webServer/settings return quietly while the rest of the plugin keeps working.
 * @param ctx - plugin context.
 * @param config - row config (volatile refs allowed).
 * @param options - test seams: `route` is forwarded to
 *   {@link registerCapabilitiesRoute}.
 */
export function mountSettings(ctx, config, options = {}) {
  ctx.inject(['webServer'], (webCtx) => {
    registerCapabilitiesRoute(webCtx, () => config, options.route)
  })

  ctx.inject(['settings'], (settingsCtx) => {
    try {
      const dispose = settingsCtx.settings.configure({ auto: false }, ctx.fiber)
      settingsCtx.effect(() => dispose, 'better-subagent-settings: row config page policy')
    } catch (error) {
      settingsCtx.logger?.warn?.(`better-subagent-settings: settings page policy was not registered: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
