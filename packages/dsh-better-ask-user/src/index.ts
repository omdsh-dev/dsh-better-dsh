/** dsh-better-ask-user host row: ask_user_question shadow, settings, PTC exemption. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolRegistryUnavailableError } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolsService } from '@deepseek-ai/dsh-tools'
import { Config, readConfig as snapshotConfig } from './config.js'
import { createBetterAskTool } from './ask-tool.js'
import { officialAskBase } from './official-ask.js'
import { mountPtcExemption } from './ptc.js'
import { mountLegacyMigration, mountSettings } from './settings.js'

export { Config }
export const name = 'dsh-better-ask-user'
export const inject = ['agents', 'tools', 'userQuestions']

interface AgentState {
  agent: Agent
  actor: Context
  askDispose: (() => void) | undefined
}

export function apply(ctx: Context, config: unknown = {}) {
  const readConfig = () => snapshotConfig(config)
  mountSettings(ctx)
  mountLegacyMigration(ctx)
  mountPtcExemption(ctx)

  const states = new Map<Agent, AgentState>()

  /**
   * Read the official definition the composition offers.
   *
   * A native root resolves the scope's registrations, so the ask row is the
   * base. A PTC root only answers its program entry: the ask row is bound in
   * programs but invisible to `get()`, so the vendored contract stands in.
   * Registering the shadow in the Agent scope then shadows that binding.
   */
  function resolveBase(tools: ToolsService, agent: Agent): ToolDefinition | undefined {
    const read = (name: string): ToolDefinition | undefined => {
      try {
        return tools.get(name, agent)
      } catch (error) {
        // No selected root (or one still loading) offers nothing to shadow.
        if (error instanceof ToolRegistryUnavailableError) return undefined
        throw error
      }
    }
    const base = read('ask_user_question')
    if (base !== undefined) return base
    return read('run_code') === undefined ? undefined : officialAskBase()
  }

  function register(state: AgentState) {
    const tools = state.actor.get('tools')!
    const base = resolveBase(tools, state.agent)
    if (base === undefined) return
    state.askDispose = tools.register(createBetterAskTool(ctx, base, readConfig))
  }

  function setup(agent: Agent) {
    if (states.has(agent)) return states.get(agent)
    const state: AgentState = { agent, actor: agent.ctx, askDispose: undefined }
    states.set(agent, state)
    register(state)
    return state
  }

  function cleanup(state: AgentState) {
    state.askDispose?.()
    state.askDispose = undefined
  }

  ctx.on('agent/created', ({ agent }): undefined => { setup(agent) })
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
