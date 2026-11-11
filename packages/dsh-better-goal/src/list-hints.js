import { symbols } from '@deepseek-ai/cordis'

/** Keep goal detail on the bound session, out of the global list hints. */
export function mountGoalListHints(ctx) {
  ctx.inject(['sessionController'], (inner) => {
    inner.effect(() => {
      // Cordis traces method reads; use the instance for stable ownership checks.
      const service = inner.sessionController
      const controller = service[symbols.original] ?? service
      const descriptor = Object.getOwnPropertyDescriptor(controller, 'list')
      const original = controller.list
      let active = true
      async function list(...args) {
        const result = await Reflect.apply(original, this, args)
        if (!active) return result
        return {
          ...result,
          items: result.items.map((item) => {
            const projections = item.projections
            if (!projections?.values || (!Object.hasOwn(projections.values, 'goal') && !Object.hasOwn(projections.values, 'better-goal-history'))) return item
            const values = { ...projections.values }
            delete values.goal
            delete values['better-goal-history']
            return { ...item, projections: { ...projections, values } }
          }),
        }
      }
      controller.list = list
      return () => {
        // Another wrapper may still hold this one after either plugin unloads.
        active = false
        if (controller.list !== list) return
        if (descriptor) Object.defineProperty(controller, 'list', descriptor)
        else delete controller.list
      }
    }, 'better-goal: session list hints')
  })
}
