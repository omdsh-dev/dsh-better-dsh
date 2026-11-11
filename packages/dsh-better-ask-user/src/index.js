/** dsh-better-ask-user host row: ask_user_question shadow, settings, PTC exemption. */
import { Config, readConfig as snapshotConfig } from './config.js'
import { createBetterAskTool } from './ask-tool.js'
import { mountPtcExemption } from './ptc.js'
import { mountLegacyMigration, mountSettings } from './settings.js'

export { Config }
export const name = 'dsh-better-ask-user'
export const inject = ['agents', 'tools', 'userQuestions']

export function apply(ctx, config = {}) {
  const readConfig = () => snapshotConfig(config)
  mountSettings(ctx)
  mountLegacyMigration(ctx)
  mountPtcExemption(ctx)

  const states = new Map()

  function register(state) {
    const tools = state.actor.get('tools')
    const base = tools.get('ask_user_question', state.agent)
    if (base === undefined) return
    state.askDispose = tools.register(createBetterAskTool(ctx, base, readConfig))
  }

  function setup(agent) {
    if (states.has(agent)) return states.get(agent)
    const state = { agent, actor: agent.ctx, askDispose: undefined }
    states.set(agent, state)
    register(state)
    return state
  }

  function cleanup(state) {
    state.askDispose?.()
    state.askDispose = undefined
  }

  ctx.on('agent/created', ({ agent }) => { setup(agent) })
  ctx.on('agent/disposed', ({ agent }) => {
    const state = states.get(agent)
    if (state !== undefined) cleanup(state)
    states.delete(agent)
  })
  for (const agent of ctx.agents.list()) setup(agent)
  ctx.effect(() => () => {
    for (const state of states.values()) cleanup(state)
    states.clear()
  }, 'better-ask-user: per-agent controls')
}
