/**
 * Child exit guard — host-plane plugin that intercepts turn end while the
 * Agent still has RUNNING direct children.
 *
 * Scope is deliberately narrow:
 * - gated by the volatile `childExitGuard` row setting (default false);
 * - only direct children whose live Agent status is `running` are intercepted;
 *   background bash jobs and Apollo's general guard remain Apollo's business;
 * - the only action is a concise `agent.steer()` notice. Query/inject failures
 *   fail open (warn and let the turn end) so a broken query cannot wedge a
 *   session; the user interrupt signal always passes through.
 *
 * The notice wording is the single runtime source for this plugin's child-guard
 * prompt contract as well (see `src/prompt.js`).
 */

import { currentConfig } from './config.js'

export const name = 'better-subagent-child-exit-guard'

export const inject = ['subagents', 'agents']

/** Render one running-child line. */
function lineOf(child) {
  // 0.1.1-rc.2 entries are meta:{mode,label}; 0.1.2+ promote them to top level.
  const label = child.label ?? child.meta?.label
  return `  - subagent ${child.id}${label === undefined || label === '' ? '' : ` (${label})`}`
}

/**
 * Construct the steer notice (model-visible, enters the session log).
 * @param children - running direct-child listChildren entries.
 * @returns one user-role plugin notice message.
 */
export function buildChildGuardMessage(children) {
  const text = [
    'Direct subagent work is still running, so the turn cannot end yet:',
    ...children.map(lineOf),
    '',
    'Wait for running subagents with wait_subagent (use send_message only to give one new information or a correction). '
      + 'Finish only after every running child is handled, or wait for the user to interrupt.',
  ].join('\n')
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    // Producer-owned source kind: native session format v4 refuses the retired
    // `{kind:'plugin', plugin}` wrapper shape for newly appended messages.
    source: {
      kind: name,
      form: 'notice',
      summary: `运行中的子代理阻止回合结束（${children.length}）`,
    },
    id: crypto.randomUUID(),
  }
}

/**
 * Collect this Agent's running direct children.
 * @param ctx - runtime context (subagents/agents injected).
 * @param agent - the Agent whose turn is stopping.
 * @returns running direct-child entries; query failures propagate to the caller.
 */
export async function collectRunningChildren(ctx, agent) {
  const running = []
  for (const entry of await ctx.subagents.listChildren(agent.id)) {
    if (ctx.agents.get(entry.id)?.status === 'running') running.push(entry)
  }
  return running
}

/** Install the turn-stopping listener on a context that already has the services. */
export function installChildExitGuard(ctx, config) {
  return ctx.on('agent/turn-stopping', async (payload) => {
    const agent = payload?.agent
    if (agent === undefined || payload?.signal?.aborted) return
    try {
      if (!currentConfig(ctx, config).childExitGuard) return
      const children = await collectRunningChildren(ctx, agent)
      if (children.length === 0) return
      if (payload.signal?.aborted) return
      agent.steer(buildChildGuardMessage(children))
    } catch (error) {
      // Fail open: a broken query or injection must release this turn.
      ctx.logger?.warn?.(`better-subagent child exit guard skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

export function mountChildExitGuard(ctx, config) {
  ctx.inject(inject, (runtime) => {
    const dispose = installChildExitGuard(runtime, config)
    if (typeof runtime.effect === 'function') runtime.effect(() => dispose, 'better-subagent: child exit guard')
  })
}
