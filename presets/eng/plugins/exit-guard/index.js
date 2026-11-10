/**
 * `eng-exit-guard` — 工程模式退出守卫（预设本地插件），只管后台任务。
 *
 * pi-atlas task guard 的 DSH 等价物中属于 Apollo 的那一半：回合即将结束时
 * （`agent/turn-stopping`，serial 事件——监听器跑完后 agent-loop 会重查 inbox，
 * `agent.steer()` 加入的 next-step 消息使回合不关闭），若本代理仍有运行中的
 * DSH 后台 job，注入一条提醒强制回合继续，直到 `job_output` 收取、
 * `job_kill` 停止，或用户中断（被中断的回合在 dispatch 前即 throwIfAborted，
 * 天然不触发本守卫——Esc 始终是逃生口）。
 *
 * 运行中**直接子代理**的拦截不在这里：0.5.0 起由 dsh-better-subagent 的
 * `childExitGuard` 拥有（`agent/turn-stopping` 上的独立监听器，独立开关）。
 * 本插件只读 Apollo 的 `exitGuard`（job/通用），不导入、不复制子代理判断。
 *
 * 拦截是有时限的：`exitGuardWaitSeconds`（默认 2400 秒）内反复提醒，超时后放行
 * 本次回合结束——后台任务不被取消，仍在运行，之后可用 `job_output` 收取。
 * `0` 恢复旧的无期限拦截。计时按「一次阻塞事件」计：一旦本代理没有运行中的
 * job，计时即清零，下次重新起算。
 *
 * 有 **armed goal** 时不拦截：goal 回合的等后台任务由 dsh-better-goal 的驱动
 * 在「上一回合结束 → 排下一轮」之间负责（同样的限时语义），两处都拦会叠加成
 * 双倍等待。`ctx.goals` 是宿主声明的服务，与 `ctx.jobs` 同构；goal 行缺失时
 * 读不到，守卫退回限时拦截。
 *
 * 无豁免清单（曾有 exitGuardIgnore 子串清单，因会被用来静默绕过守卫而移除）。
 * 需要跨回合常驻的服务（dev server、watcher）用 pm2/systemd/裸 nohup 等脱离
 * DSH job 注册表的方式管理——守卫只看本地 job 注册表。
 *
 * 每次事件读取当前 profile 的 Apollo Config（默认关闭）。
 * 设置保存后即时生效；旧配置只由宿主执行一次性导入。
 * 查询失败（jobs.list 抛错）按 fail-open 处理：告警并放行本次回合结束。
 *
 * 零 bare import（预设本地插件约束）；消息 source 使用生产者自有 kind
 * `better-apollo-job-exit-guard`——session format v4 拒绝旧的
 * `{kind:'plugin', plugin}` 形状。
 */

import { currentConfig } from '../../../../src/config.js'

export const name = 'eng-exit-guard'

/** 后台任务终态（dsh-jobs-local isTerminal 同款）。 */
const JOB_TERMINAL = new Set(['completed', 'killed', 'failed'])

/** Producer-owned source kind accepted by session format v4. */
export const NOTICE_SOURCE_KIND = 'better-apollo-job-exit-guard'

/** 渲染一条运行项清单行。 */
function lineOf(job) {
  const detail = job.label === undefined ? job.kind : `${job.label}, ${job.kind}`
  return `  - background job ${job.id} (${detail})`
}

/**
 * 构造 steer 提醒消息（模型可见，进入会话日志）。
 * @param jobs - 运行中的后台任务快照。
 * @returns 一条 user 角色的 plugin notice 消息。
 */
export function buildJobGuardMessage(jobs) {
  const text = [
    'This background work is still running, so the turn cannot end yet:',
    ...jobs.map(lineOf),
    '',
    'Collect background command results with job_output, and stop work you no longer need with job_kill. '
      + 'Finish only after all of it is handled.',
  ].join('\n')
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: NOTICE_SOURCE_KIND,
      form: 'notice',
      summary: `运行中的后台任务阻止回合结束（${jobs.length}）`,
    },
    id: crypto.randomUUID(),
  }
}

/**
 * 收集本代理仍在运行的后台任务。
 * @param ctx - 预设插件上下文（jobs 可选，经 ctx.get 读取）。
 * @param agent - 回合即将结束的代理。
 * @returns 运行中的 job 数组；查询失败抛出由调用方按 fail-open 处理。
 */
export function collectRunningJobs(ctx, agent) {
  const jobs = ctx.get('jobs')
  if (jobs === undefined) return []
  // 0.1.7 起 JobRegistry.list 的参数是 SessionId（0.1.6 及以前是 Agent 对象）：
  // 传 Agent 对象不报错但恒不匹配，守卫会静默看不见任何 owned 后台任务。
  return jobs.list(agent.id).filter((job) => !JOB_TERMINAL.has(job.status))
}

/**
 * 本代理当前是否有「已武装」的 goal。
 *
 * armed goal 意味着 dsh-better-goal 的驱动会在回合之间自己按同样的限时语义
 * 等后台任务；这里再拦一次只会把等待叠加成两倍。
 * @param ctx - 预设插件上下文（goals 可选，经 ctx.get 读取）。
 * @param agent - 回合即将结束的代理。
 * @returns 有 armed goal 时为 true；服务缺失或查询抛错时为 false（退回限时拦截）。
 */
export function readArmedGoal(ctx, agent) {
  const goals = ctx.get('goals')
  if (goals === undefined) return false
  const goal = goals.get(agent)
  return goal !== undefined && goal.phase === 'active' && goal.activation === 'armed'
}

/** 每个代理首次被拦截的时刻；无运行中 job 时清除，使下一次阻塞事件重新计时。 */
const guardedSince = new WeakMap()

export function apply(ctx) {
  ctx.on('agent/turn-stopping', async (payload) => {
    const agent = payload?.agent
    if (agent === undefined || payload?.signal?.aborted) return
    try {
      const config = currentConfig(ctx)
      if (!config.exitGuard) return
      if (readArmedGoal(ctx, agent)) {
        // The goal driver owns this wait; blocking here would double it.
        guardedSince.delete(agent)
        return
      }
      const jobs = collectRunningJobs(ctx, agent)
      if (jobs.length === 0) {
        guardedSince.delete(agent)
        return
      }
      if (payload.signal?.aborted) return
      const limitSeconds = config.exitGuardWaitSeconds
      if (limitSeconds > 0) {
        const since = guardedSince.get(agent) ?? Date.now()
        guardedSince.set(agent, since)
        if (Date.now() - since >= limitSeconds * 1000) {
          // The window closed: let the turn end. The jobs keep running and stay
          // collectable with job_output, which is what the model is told.
          guardedSince.delete(agent)
          ctx.logger?.warn?.(`eng-exit-guard: guard released after ${limitSeconds}s with ${jobs.length} job(s) still running`)
          return
        }
      }
      agent.steer(buildJobGuardMessage(jobs))
    } catch (error) {
      // fail-open：查询或注入失败时放行本次回合结束，守卫不应卡死会话。
      ctx.logger?.warn?.(`eng-exit-guard: guard skipped: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}
