/** Register ask_user_question with the shared PTC deadline exemption service. */
import type { Context } from '@deepseek-ai/cordis'

export function mountPtcExemption(ctx: Context) {
  if (typeof ctx.inject !== 'function') return
  ctx.inject(['betterPtc'], (runtime) => {
    if (runtime?.betterPtc === undefined) return
    const dispose = runtime.betterPtc.register('ask_user_question')
    if (typeof runtime.effect === 'function') {
      runtime.effect(() => dispose, 'better-ask-user: PTC deadline exemption')
    }
  })
}
