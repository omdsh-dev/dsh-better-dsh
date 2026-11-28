import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { GoalConfig } from './config.js'
import type { GoalConfigStatus } from './host.js'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { GoalHistoryState } from './history.js'
import type NativeGoalService from '@deepseek-ai/dsh-goal'
import { ToolRegistryUnavailableError } from '@deepseek-ai/dsh-tools'

type NativeStack = {
  service: typeof NativeGoalService
  driver: typeof import('@deepseek-ai/dsh-goal-round-driver')
  tool: typeof import('@deepseek-ai/dsh-tool-goal')
  command: typeof import('@deepseek-ai/dsh-command-goal')
}
interface AgentControls {
  agent: Agent
  actor: Context
  mode: GoalConfig['roundLimitMode'] | undefined
  commandDispose?: () => void
  promptDispose?: () => void
  restrictDispose?: () => void
  goalDispose?: () => void
}

import { Config, readConfig as snapshotConfig, UNLIMITED_ROUNDS } from './config.js'
import { GoalService, goalProjectionDefinition } from './service.js'
import { createGoalHistoryDefinition } from './history.js'
import { createGoalTool, LEGACY_GOAL_TOOLS } from './tool.js'
import { registerGoalCommand } from './commands.js'
import { apply as mountDriver } from './driver.js'
import { mountSettings } from './settings.js'

export { Config }
export const name = 'dsh-better-goal'
export const inject = ['agents', 'sessions', 'sessionProjections', 'tools', 'systemPrompt']

export async function apply(ctx: Context, config: unknown = {}) {
  const loadedConfig = Object.freeze(snapshotConfig(config))
  const enhanced = loadedConfig.implementation === 'enhanced'
  // Never compete with a host-owned goal domain or continuation driver.
  if (ctx.get('goals') || ctx.get('betterGoalConfig')) {
    throw new Error('dsh-better-goal requires sole ownership of the goal runtime')
  }
  for (const entry of ctx.get('loader')?.entries?.() ?? []) {
    if (['goal', 'goal-round-driver'].includes(entry.id) && !entry.disabled) {
      throw new Error(`dsh-better-goal requires native row "${entry.id}" to remain disabled`)
    }
  }
  let native: NativeStack | undefined
  if (!enhanced) {
    const loader = ctx.get('loader')
    if (typeof loader?.import !== 'function') {
      throw new Error('Native goal selection requires the host Loader import API; no replacement was mounted')
    }
    // Resolve from the host profile, not this package's undeclared dependencies.
    // Import every module before mounting any of them: failures leave no half stack.
    const modules = await Promise.all([
      'dsh-goal', 'dsh-goal-round-driver', 'dsh-tool-goal', 'dsh-command-goal',
    ].map((name) => loader.import(`@deepseek-ai/${name}`)))
    native = { service: modules[0].GoalService, driver: modules[1], tool: modules[2], command: modules[3] }
  }
  // Host and plugin resolve different Zod declaration versions for the same schema API.
  await ctx.sessionProjections.register(createGoalHistoryDefinition(goalProjectionDefinition) as unknown as ProjectionDefinition<'better-goal-history', GoalHistoryState> & { wire: NonNullable<ProjectionDefinition<'better-goal-history', GoalHistoryState>['wire']> })
  const current = () => snapshotConfig(config)
  const readConfig = () => ({
    ...current(),
    implementation: loadedConfig.implementation,
    nativeDefaultMaxGoalRounds: loadedConfig.nativeDefaultMaxGoalRounds,
    nativeBlockedAfterConsecutiveRounds: loadedConfig.nativeBlockedAfterConsecutiveRounds,
  })
  const status = (): GoalConfigStatus => ({
    activeConfig: readConfig(),
    savedConfig: current(),
    loadedConfig,
    requiresReload: (['implementation', 'nativeDefaultMaxGoalRounds', 'nativeBlockedAfterConsecutiveRounds'] as const)
      .some((key) => current()[key] !== loadedConfig[key]),
    runtime: { implementation: loadedConfig.implementation, owner: name },
    capabilities: {
      implementation: true,
      hotReplacement: false,
      roundLimitPolicy: enhanced,
      singleGoalTool: enhanced,
      questionTimeout: false,
    },
  })
  ctx.provide('betterGoalConfig', Object.freeze({ get: readConfig, snapshot: () => loadedConfig, status }))
  ctx.plugin(native?.service ?? GoalService, {
    defaultMaxGoalRounds: enhanced ? UNLIMITED_ROUNDS : loadedConfig.nativeDefaultMaxGoalRounds,
  })
  mountSettings(ctx, status)
  if (native) {
    ctx.inject(['goals'], (runtime) => {
      const controls = new Map<Agent, Fiber[]>()
      function setup(agent: Agent): undefined {
        if (controls.has(agent)) return
        controls.set(agent, [
          agent.ctx.plugin(native!.tool, { blockedAfterConsecutiveRounds: loadedConfig.nativeBlockedAfterConsecutiveRounds }),
          agent.ctx.plugin(native!.command),
        ])
      }
      runtime.on('agent/created', ({ agent }): undefined => setup(agent))
      runtime.on('agent/disposed', async ({ agent }) => {
        const fibers = controls.get(agent) ?? []
        controls.delete(agent)
        await Promise.all(fibers.map((fiber) => fiber.dispose()))
      })
      for (const agent of runtime.agents.list()) setup(agent)
      runtime.effect(() => async () => {
        const fibers = [...controls.values()].flat()
        controls.clear()
        await Promise.all(fibers.map((fiber) => fiber.dispose()))
      }, 'better-goal: native per-agent controls')
      runtime.plugin(native.driver)
    })
  } else {
    mountBetterRuntime(ctx, readConfig)
  }
}

function mountBetterRuntime(ctx: Context, readConfig: () => GoalConfig) {
  ctx.inject(['goals'], (runtime) => {
    const states = new Map<Agent, AgentControls>()
    function refresh(state: AgentControls) {
      const tools = state.actor.get('tools')!
      // Preset generations can change before the first turn. Recheck inherited
      // tools instead of retaining an ask tool from a previous generation.
      // A composition without a selected root offers no visible tools.
      let visibleLegacy: string[] = []
      try {
        visibleLegacy = LEGACY_GOAL_TOOLS.filter((name) => tools.get(name, state.agent) !== undefined)
      } catch (error) {
        if (!(error instanceof ToolRegistryUnavailableError)) throw error
      }
      if (visibleLegacy.length) {
        state.restrictDispose?.()
        state.restrictDispose = tools.restrict({ deny: visibleLegacy })
      }
      const settings = readConfig()
      if (state.mode !== settings.roundLimitMode) {
        state.goalDispose?.()
        state.goalDispose = tools.register(createGoalTool(state.actor, readConfig))
        state.mode = settings.roundLimitMode
      }
    }
    function setup(agent: Agent) {
      if (states.has(agent)) return states.get(agent)
      const actor = agent.ctx
      const state: AgentControls = { agent, actor, mode: undefined }
      state.commandDispose = registerGoalCommand(actor, readConfig)
      state.promptDispose = actor.systemPrompt.section({
        name: 'tool:goal',
        order: actor.systemPrompt.getSectionOrder('TOOL_GOAL'),
        interpolate: false,
        text: 'Use goal for the persistent overall objective and todo_write for steps. Actions: get, set (replace the whole objective; never to reset limits or drop scope), pause (stop automatic continuation, keep the goal), resume (continue without a new human message), complete. Reopening or forking a session does not resume work. Complete only when current evidence proves every requirement. Never force completion: if progress needs the user, such as a missing secret, credential, permission, account or decision, pause and state exactly what is needed instead of mocking, hard-coding, skipping checks or narrowing scope. Keep doing independent work first. A timed-out question is still pending and never grants permission. Host settings govern round limits and question waits.',
      })
      states.set(agent, state)
      refresh(state)
      return state
    }
    function cleanup(state: AgentControls) {
      state.goalDispose?.()
      state.commandDispose?.()
      state.restrictDispose?.()
      state.promptDispose?.()
    }
    runtime.on('agent/created', ({ agent }): undefined => { setup(agent) })
    runtime.on('agent/disposed', ({ agent }) => {
      const state = states.get(agent)
      if (state) cleanup(state)
      states.delete(agent)
    })
    // Next resolves step admission before prompt assembly; presentation waterfalls
    // cannot rewrite provider-owned tool schemas. Refresh on the owning row's commit.
    ctx.on('loader/volatile-update', () => {
      for (const state of states.values()) refresh(state)
    })
    for (const agent of runtime.agents.list()) setup(agent)
    runtime.effect(() => () => {
      for (const state of states.values()) cleanup(state)
      states.clear()
    }, 'better-goal: per-agent controls')
    mountDriver(runtime, readConfig)
  })
}
