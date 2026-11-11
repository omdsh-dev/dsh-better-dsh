/**
 * Register wait_subagent with the shared PTC deadline-exemption service.
 *
 * The service row is inserted by this bundle's patch and by the ask-user
 * bundle; the Loader keeps one dsh-better-ptc row. When the service is absent
 * (older profile or a deployment without PTC) this is a no-op, so the rest of
 * the subagent plugin still loads.
 */
export function mountPtcExemption(ctx) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['betterPtc'], (runtime) => {
    if (runtime?.betterPtc === undefined) return
    const dispose = runtime.betterPtc.register('wait_subagent')
    if (typeof runtime.effect === 'function') {
      runtime.effect(() => dispose, 'better-subagent: PTC deadline exemption')
    }
  })
}
