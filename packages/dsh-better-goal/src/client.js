/**
 * dsh-better-goal — zero-build browser half.
 *
 * One module-loader closure (`id: "dsh-better-goal"`) contributes:
 *   1. the independent GoalBar in `conversation.input.dock`, reading the
 *      native `goal` session projection and mutating through the shipped
 *      `remote.goals` RPC;
 *   2. the row configuration page in `plugins.row.config`, rendered from the
 *      native volatile Config and written through the native settings form.
 *
 * Independence: this file requires only React. It never imports Apollo and
 * owns no remote namespace of its own. `remote.goals` supplies both the
 * read-only activation lookup and the CAS-checked edit/pause/resume/clear
 * verbs; no slash-command lifecycle is involved, so UI actions leave no
 * command/run or implementation details in the chat. The CAS ref is read from
 * the live session projection at click time (not from the rendered snapshot),
 * so a stale render cannot become the authority.
 *
 * Styling follows the shared UI contract (Apollo docs/UI-KIT.md): flat 1px
 * lines, one 960px settings column, 32px controls. Everything is scoped under
 * `dbg-` classes; no shadcn, no build.
 */

window.__ModuleLoader__.load({
  id: 'dsh-better-goal',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const {
      createElement: h,
      useCallback,
      useEffect,
      useDeferredValue,
      useId,
      useRef,
      useState,
    } = React

    /** Locale namespace owned by this closure. */
    const NS = 'better-goal'
    /** Must stay in sync with src/config.js. */
    const ROW_KEY = 'dsh-better-goal#dsh-better-goal'
    /**
     * Apollo's bundle patch re-declares the same top-level row. The Plugins page
     * keys a row's configuration by its declaring bundle and row id, so an
     * Apollo-only assembly looks the page up as `<apollo package>#dsh-better-goal`.
     * The unscoped name is kept for historical assemblies; the published package
     * is scoped. Registering the same page under every exact key keeps the
     * independent plugin's config namespace and store unchanged in any assembly.
     */
    const BETTER_DSH_ROW_KEY = 'dsh-better-dsh#dsh-better-goal'
    const APOLLO_ROW_KEY = 'dsh-apollo#dsh-better-goal'
    /** Apollo's published scoped package name declares the same row. */
    const SCOPED_APOLLO_ROW_KEY = '@menghuan1918/dsh-apollo#dsh-better-goal'
    /** Every assembly's `plugins.row.config` key, in dispatch order. */
    const ROW_CONFIG_KEYS = Object.freeze([ROW_KEY, BETTER_DSH_ROW_KEY, APOLLO_ROW_KEY, SCOPED_APOLLO_ROW_KEY])
    const ROUND_LIMIT_MODES = Object.freeze(['agent', 'unlimited', 'fixed'])
    /** Continuation-mode cards, in radiogroup order. */
    const IMPLEMENTATION_MODES = Object.freeze(['enhanced', 'native'])
    const DEFAULT_ROUND_LIMIT = 256
    const UNLIMITED_ROUNDS = Number.MAX_SAFE_INTEGER
    // Mirrors src/config.js: the idle-spin warning defaults to 120s; 0 turns it off.
    const DEFAULT_SPIN_HINT_SECONDS = 120
    const MAX_SPIN_HINT_SECONDS = 3600
    const DEFAULT_JOB_WAIT_SECONDS = 2400
    const MAX_JOB_WAIT_SECONDS = 86400
    const STYLE_GOAL = 'dsh-better-goal/goal.css'
    const STYLE_SETTINGS = 'dsh-better-goal/settings.css'

    // ── Copy ────────────────────────────────────────────────────────────────

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      summary: '目标与自动续跑',
      waitingForm: '正在加载设置…',
      noFormHint: '请使用受信任的连接打开设置。',
      loading: '正在读取配置…',
      unavailable: '设置不可用',
      readonly: '只读',
      save: '保存',
      saving: '保存中…',
      saved: '已保存',
      conflict: '配置已被更新，已重新读取。请检查后重试。',
      saveFailed: '保存失败：',
      reset: '放弃改动',
      modeLabel: '轮数策略',
      roundDefinition: '一轮指目标的一次自动续跑。',
      modeAgent: '由 Agent 决定',
      modeAgentFlow: '目标 → 由 Agent 决定 → 上限',
      modeAgentStop: '达到 Agent 设定的上限、目标完成或受阻时停止。',
      modeUnlimited: '无上限',
      modeUnlimitedFlow: '目标 → 第 1 轮 → 第 2 轮 → …',
      modeUnlimitedStop: '仅在目标完成或受阻时停止。',
      modeFixed: '固定轮数',
      modeFixedFlow: '目标 → 第 1 轮 → … → 第 N 轮',
      modeFixedStop: '达到第 N 轮后停止。',
      modeStop: '停止条件',
      roundSpan: '第 1 轮 → … → 第 {rounds} 轮',
      roundLimitLabel: '轮数上限',
      roundLimitHint: '达到上限后停止续跑。',
      roundLimitUnlimited: '当前值等于兼容哨兵，界面显示为无上限。',
      spinHintLabel: '空转提示阈值（秒）',
      spinHintHint: '上一轮 goal 回合短于该值时，下一轮提示会写清 goal 无延迟投递、需要在回合内阻塞等待。0 表示关闭。',
      jobWaitLabel: '等待后台任务（秒）',
      jobWaitHint: '回合结束到开始下一轮 goal 之间，最多等本会话的后台任务这么久；超时则照常开轮，并在提示词里列出仍在运行的任务。任务不会被取消。0 表示不等待。',
      questionTimeoutLabel: '目标提问超时（秒）',
      questionTimeoutHint: '-1 表示永不超时；否则为 1 到 2147483 的整数。热设置只影响新发起的等待，不改变当前等待。',
      questionTimeoutNever: '当前设置：永不超时。',
      invalidMode: '请选择一种轮数上限策略。',
      invalidRoundLimit: '固定轮数必须是 1 到 9007199254740991 之间的正整数。',
      invalidSpinHint: '空转阈值必须是 0（关闭），或 1 到 3600 之间的整数。',
      invalidJobWait: '等待时长必须是 0（不等待），或 1 到 86400 之间的整数。',
      invalidQuestionTimeout: '提问超时必须是 -1，或 1 到 2147483 之间的整数。',
      readonlyNote: '只读：当前无法写入宿主配置。',
      unavailableNote: '不可写：当前连接下该配置不可用。',
      settingsTitle: '目标与续跑',
      settingsIntro: '管理目标自动续跑的方式、轮数上限与受阻判定。',
      'phase.active': '进行中',
      'phase.active.disarmed': '已暂停',
      'phase.paused': '已暂停',
      'phase.blocked': '受阻',
      'objective.aria': '目标内容',
      'edit.placeholder': '输入新的目标内容',
      'action.save': '保存目标',
      'action.cancel': '取消编辑',
      'action.pause': '暂停目标',
      'action.resume': '恢复目标',
      'action.edit': '编辑目标',
      'action.clear': '清除目标',
      'cap.unlimited': '无上限',
      'meta.rounds': '第 {rounds} / {max} 轮',
      nativeSection: 'DSH 续跑策略',
      nativeDefaultLabel: '默认轮数上限',
      nativeDefaultHint: '新目标未指定上限时使用此值。',
      nativeBlockedLabel: '报告受阻门槛',
      nativeBlockedHint: '达到该轮数后 Agent 可报告受阻。',
      invalidImplementation: '请选择续跑模式。',
      invalidNative: '请输入 1 到 9007199254740991 之间的整数。',
      help: '了解设置',
      implementation: '续跑模式',
      implementationHint: '切换模式需保存后重启当前 profile。',
      implEnhancedTag: '本插件驱动',
      implNativeTag: '宿主原生',
      implEnhancedFlow: '目标 → 第 1 轮 → 第 2 轮 → … → 上限/完成/受阻',
      implNativeFlow: '目标 → DSH 原生驱动 → 宿主轮数策略',
      implEnhancedBullet1: '每轮自动推进',
      implEnhancedBullet2: '达到上限/完成/受阻时停止',
      implEnhancedBullet3: '支持 Agent/无上限/固定轮数',
      implNativeBullet1: '使用原生 goal 服务与工具',
      implNativeBullet2: '本页只设置原生默认轮数与受阻门槛',
      implNativeBullet3: '切换后需重载',
      replaceNative: '替换原生 Goal',
      replaceHint: '关闭后由宿主原生 Goal 管理目标与续跑。保存后重启当前 profile。',
      reloadRequired: '重启 profile 后生效',
      runtimeBetter: '自定义续跑',
      runtimeNative: 'DSH 默认',
      runtimeLoading: '正在检查运行状态…',
      runtimeUnavailable: '无法读取运行状态。',
      refreshRuntime: '刷新运行状态',
      nativeDependency: '原生模式使用宿主的轮数策略。',
      runtimeActive: '当前运行：{implementation}',
      roundsSection: '自动续跑',
      legacySection: '兼容配置',
      legacyHint: '旧版提问超时仅为迁移保留。提问等待请在提问插件中设置。',
      legacyTimeout: '原提问等待：{seconds} 秒',
      never: '永不超时',
      'action.details': '展开目标',
      'action.history': '目标历史',
      'action.hideHistory': '收起历史',
      'phase.complete': '已完成',
      'phase.cleared': '已清除',
      'phase.archived': '已替换',
      'history.title': '目标历史',
      'history.search': '搜索目标',
      'history.all': '全部状态',
      'history.empty': '没有匹配的目标',
      'history.rounds': '{rounds} / {max} 轮',
      'history.count': '{count} 个目标',
      'history.updated': '更新于 {time}',
      'history.error': '目标历史读取失败',
      'history.clearFilters': '清除筛选',
      'history.none': '尚无目标记录',
      'action.confirmClear': '再次点击清除目标',
      editShortcut: '⌘ / Ctrl + Enter 保存 · Esc 取消',
      advanced: '高级',
      modified: '已修改 {count} 项',
      diagnostics: '运行状态 · 只读',
      retry: '重试',
      pendingChanges: '{count} 项未保存',
    }

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      summary: 'Goals and continuation',
      waitingForm: 'Loading settings…',
      noFormHint: 'Use a trusted connection to open these settings.',
      loading: 'Loading configuration…',
      unavailable: 'Settings unavailable',
      readonly: 'Read-only',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved',
      conflict: 'Settings changed elsewhere and were reloaded. Review and try again.',
      saveFailed: 'Save failed: ',
      reset: 'Discard',
      modeLabel: 'Round policy',
      roundDefinition: 'A round is one automatic continuation of the goal.',
      modeAgent: 'Agent-decided',
      modeAgentFlow: 'Goal → Agent decides → cap',
      modeAgentStop: 'Stops at the agent-set cap, on completion, or when blocked.',
      modeUnlimited: 'Unlimited',
      modeUnlimitedFlow: 'Goal → Round 1 → Round 2 → …',
      modeUnlimitedStop: 'Stops only on completion or when blocked.',
      modeFixed: 'Fixed rounds',
      modeFixedFlow: 'Goal → Round 1 → … → Round N',
      modeFixedStop: 'Stops after round N.',
      modeStop: 'Stop condition',
      roundSpan: 'Round 1 → … → Round {rounds}',
      roundLimitLabel: 'Round limit',
      roundLimitHint: 'Automatic continuation stops at the limit.',
      roundLimitUnlimited: 'This value is the compatibility sentinel; the UI renders it as unlimited.',
      spinHintLabel: 'Idle-spin hint threshold (seconds)',
      spinHintHint: 'When the previous goal turn was shorter than this, the next round says goal rounds arrive with no delay and that waits must block inside the turn. 0 turns it off.',
      jobWaitLabel: 'Wait for background jobs (seconds)',
      jobWaitHint: 'Between a finished turn and the next goal round, wait this long at most for this session’s background jobs. When it expires the round starts anyway and the prompt lists the jobs still running. Nothing is cancelled. 0 never waits.',
      questionTimeoutLabel: 'Goal-question timeout (seconds)',
      questionTimeoutHint: '-1 never times out; otherwise an integer from 1 to 2147483. Hot changes affect only newly started waits, never the current one.',
      questionTimeoutNever: 'Current setting: never times out.',
      invalidMode: 'Choose a round-cap policy.',
      invalidRoundLimit: 'The fixed cap must be a positive integer from 1 to 9007199254740991.',
      invalidSpinHint: 'The idle-spin threshold must be 0 (off) or an integer from 1 to 3600.',
      invalidJobWait: 'The wait must be 0 (never wait) or an integer from 1 to 86400.',
      invalidQuestionTimeout: 'The timeout must be -1 or an integer from 1 to 2147483.',
      readonlyNote: 'Read-only: host configuration cannot be written.',
      unavailableNote: 'Not writable: this configuration is unavailable on the current connection.',
      settingsTitle: 'Goals and continuation',
      settingsIntro: 'Manage how goals continue automatically, including rounds and blocked reporting.',
      'phase.active': 'Running',
      'phase.active.disarmed': 'Paused',
      'phase.paused': 'Paused',
      'phase.blocked': 'Blocked',
      'objective.aria': 'Goal objective',
      'edit.placeholder': 'Enter a new goal objective',
      'action.save': 'Save goal',
      'action.cancel': 'Cancel edit',
      'action.pause': 'Pause goal',
      'action.resume': 'Resume goal',
      'action.edit': 'Edit goal',
      'action.clear': 'Clear goal',
      'cap.unlimited': 'unlimited',
      'meta.rounds': 'Round {rounds} / {max}',
      nativeSection: 'DSH continuation policy',
      nativeDefaultLabel: 'Default round cap',
      nativeDefaultHint: 'Used for new goals without an explicit cap.',
      nativeBlockedLabel: 'Minimum rounds to report blocked',
      nativeBlockedHint: 'The agent may report blocked after this many rounds.',
      invalidImplementation: 'Choose a continuation mode.',
      invalidNative: 'Enter a whole number from 1 to 9007199254740991.',
      help: 'About these settings',
      implementation: 'Continuation mode',
      implementationHint: 'Save and restart the current profile to switch modes.',
      implEnhancedTag: 'Plugin-driven',
      implNativeTag: 'Host-native',
      implEnhancedFlow: 'Goal → Round 1 → Round 2 → … → limit/complete/blocked',
      implNativeFlow: 'Goal → DSH native driver → host round policy',
      implEnhancedBullet1: 'Advances automatically each round',
      implEnhancedBullet2: 'Stops at the cap, on completion, or when blocked',
      implEnhancedBullet3: 'Supports agent-set, unlimited, and fixed rounds',
      implNativeBullet1: 'Uses the native goal service and tools',
      implNativeBullet2: 'This page sets only the native default cap and blocked threshold',
      implNativeBullet3: 'Reload required after switching',
      replaceNative: 'Replace native Goal',
      replaceHint: 'When off, the host’s native Goal manages goals and continuation. Save, then restart the profile.',
      reloadRequired: 'Restart the profile to apply',
      runtimeBetter: 'Configurable continuation',
      runtimeNative: 'DSH default',
      runtimeLoading: 'Checking runtime…',
      runtimeUnavailable: 'Runtime status unavailable.',
      refreshRuntime: 'Refresh runtime status',
      nativeDependency: 'Native mode uses the host’s round policy.',
      runtimeActive: 'Running: {implementation}',
      roundsSection: 'Continuation',
      legacySection: 'Compatibility',
      legacyHint: 'The old question timeout is retained for migration. Configure question waits in the question plugin.',
      legacyTimeout: 'Previous question wait: {seconds} s',
      never: 'Never',
      'action.details': 'Expand goal',
      'action.history': 'Goal history',
      'action.hideHistory': 'Hide history',
      'phase.complete': 'Complete',
      'phase.cleared': 'Cleared',
      'phase.archived': 'Replaced',
      'history.title': 'Goal history',
      'history.search': 'Search goals',
      'history.all': 'All states',
      'history.empty': 'No matching goals',
      'history.rounds': '{rounds} / {max} rounds',
      'history.count': '{count} goals',
      'history.updated': 'Updated {time}',
      'history.error': 'Goal history could not be read',
      'history.clearFilters': 'Clear filters',
      'history.none': 'No goal history yet',
      'action.confirmClear': 'Click again to clear goal',
      editShortcut: '⌘ / Ctrl + Enter to save · Esc to cancel',
      advanced: 'Advanced',
      modified: '{count} changed',
      diagnostics: 'Runtime · Read-only',
      retry: 'Retry',
      pendingChanges: '{count} unsaved',
    }

    /** Interpolate `{name}` placeholders for the local fallback. */
    function interpolate(text, params) {
      if (params === undefined || params === null) return text
      return text.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match))
    }

    /** Local Chinese fallback used before/without the locale service. */
    let fallbackT = (key, params) => interpolate(zh[key] ?? key, params)

    /** Translate through a framework seat when supplied, else the fallback. */
    function tr(t, key, params) {
      return (typeof t === 'function' ? t : fallbackT)(key, params)
    }

    // Scoped roles inherit the host theme; all controls share the same compact geometry.
    const GOAL_CSS = `.dbg-dock{--cfg-accent:var(--dsw-alias-state-business-primary,#3388bb);--cfg-solid:var(--dsw-alias-button-primary-fill,#20709e);--cfg-accent-text:color-mix(in srgb,var(--cfg-accent) 70%,var(--cfg-ink));--cfg-accent-soft:color-mix(in srgb,var(--cfg-accent) 10%,transparent);--cfg-ink:var(--dsw-alias-label-primary);--cfg-muted:var(--dsw-alias-label-secondary);--cfg-faint:color-mix(in srgb,var(--dsw-alias-label-tertiary) 80%,var(--dsw-alias-label-primary));--cfg-line:var(--dsw-alias-border-l1);--cfg-line-2:var(--dsw-alias-border-l2);--cfg-line-strong:var(--dsw-alias-border-l3);--cfg-base:var(--dsw-alias-bg-layer-1);--cfg-raised:var(--dsw-alias-bg-layer-2);--cfg-overlay:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));--cfg-hover:var(--dsw-alias-interactive-bg-hover);--cfg-danger:color-mix(in srgb,var(--dsw-alias-state-error-primary) 60%,var(--cfg-ink));--cfg-warn:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 60%,var(--dsw-alias-label-primary));--cfg-success:color-mix(in srgb,var(--dsw-alias-state-success-primary) 60%,var(--dsw-alias-label-primary));--cfg-on-solid:var(--dsw-alias-label-primary-foreground,#fff);box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,12px) - 4 * var(--dsh-composer-dock-inset,2px));max-width:var(--dsh-composer-card-max-width,820px);margin:0 auto;color:var(--cfg-ink);font-size:13px;line-height:20px;font-variant-numeric:tabular-nums;container-type:inline-size;container-name:better-goal-dock}
.dbg-bar{box-sizing:border-box;min-height:40px;border:1px solid var(--cfg-line-2);border-radius:8px;background:var(--cfg-raised);display:flex;align-items:center;gap:8px;padding:4px 6px 4px 12px;position:relative}
.dbg-bar[data-expanded=true]{border-radius:8px 8px 0 0}
.dbg-goalGlyph{color:var(--cfg-faint);flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px}
.dbg-goalGlyph[data-state=active]{color:var(--cfg-accent)}
.dbg-goalGlyph[data-state=paused]{color:var(--cfg-warn)}
.dbg-goalGlyph[data-state=blocked]{color:var(--cfg-danger)}
.dbg-statusDot{display:block;width:6px;height:6px;border-radius:50%;background:currentColor}
.dbg-label{flex:none;font-size:11px;line-height:16px;font-weight:500;color:var(--cfg-muted);white-space:nowrap}
.dbg-goalMain{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.dbg-goalStatus{display:flex;align-items:center;gap:8px;flex:none;min-width:0}
.dbg-objective{min-width:0;flex:1;display:flex;align-items:center;gap:6px;min-height:32px;text-align:left;color:inherit;font:inherit;background:transparent;border:0;border-radius:6px;padding:2px;cursor:pointer}
.dbg-objective:hover{background:var(--cfg-hover)}
.dbg-objectiveText{min-width:0;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;line-height:20px;font-weight:500;color:var(--cfg-ink)}
.dbg-chevron{flex:none;display:inline-flex;color:var(--cfg-faint);transition:transform 100ms ease}
[aria-expanded=true]>.dbg-chevron,.dbg-historyList details[open]>summary>.dbg-chevron{transform:rotate(180deg)}
.dbg-meta{color:var(--cfg-faint);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dbg-roundChip,.dbg-countChip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--cfg-line-2);border-radius:10px;color:var(--cfg-muted);font-size:11px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dbg-error{color:var(--cfg-danger);font-size:12px;line-height:18px;overflow-wrap:anywhere;margin:0}
.dbg-editBar{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:10px;border:1px solid var(--cfg-line-2);border-radius:8px;background:var(--cfg-raised);overflow:visible}
.dbg-editLabel{display:block;color:var(--cfg-muted);font-size:12px;line-height:18px}
.dbg-editInput{box-sizing:border-box;resize:vertical;width:100%;min-height:84px;max-height:220px;padding:8px 10px;border:1px solid var(--cfg-line-2);border-radius:8px;background:var(--cfg-raised);color:inherit;font:inherit;line-height:20px}
.dbg-editFooter{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px;margin-top:2px}
.dbg-editHint{margin-right:auto;color:var(--cfg-faint);font-size:12px;line-height:18px}
.dbg-actions{flex:none;display:flex;align-items:center;gap:2px}
.dbg-iconBtn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--cfg-muted);cursor:pointer}
.dbg-iconBtn:hover:not(:disabled){background:var(--cfg-hover);color:var(--cfg-ink)}
.dbg-iconBtn[data-danger=true]:hover:not(:disabled),.dbg-iconBtn[data-armed=true]{color:var(--cfg-danger)}
.dbg-iconBtn:disabled{opacity:.4;cursor:not-allowed}
.dbg-progressTrack{position:absolute;bottom:1px;left:1px;right:1px;height:2px;border-radius:0 0 6px 6px;background:var(--cfg-line);pointer-events:none;overflow:hidden}
.dbg-progress{display:block;height:100%;background:var(--cfg-accent)}
.dbg-details{box-sizing:border-box;border:1px solid var(--cfg-line-2);border-top:0;border-radius:0 0 8px 8px;background:var(--cfg-raised);margin-top:0;padding:10px 12px}
.dbg-fullObjective{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;font-size:13px;line-height:20px}
.dbg-history{box-sizing:border-box;border:1px solid var(--cfg-line-2);border-radius:10px;background:var(--cfg-raised);margin-top:6px;padding:12px}
.dbg-historyHead{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;line-height:20px;font-weight:500}
.dbg-historyHead>span:first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbg-historyHead .dbg-countChip{margin-left:auto}
.dbg-historyTools{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dbg-historyTools>.dbg-choice{width:140px;flex:none}
.dbg-search{appearance:none;box-sizing:border-box;min-width:0;height:32px;padding:0 10px;border:1px solid var(--cfg-line-2);border-radius:8px;color:inherit;background:var(--cfg-raised);font:inherit;flex:1;width:100%}
.dbg-search::-webkit-search-cancel-button{appearance:none}
.dbg-historyList{list-style:none;padding:0;margin:0;max-height:320px;overflow:auto;scrollbar-width:thin;scrollbar-gutter:stable;display:flex;flex-direction:column;gap:2px}
.dbg-historyList>li{content-visibility:auto;contain-intrinsic-size:auto 56px}
.dbg-historyList summary{cursor:pointer;display:flex;align-items:center;gap:8px;min-height:36px;padding:5px 6px;list-style:none;border-radius:6px}
.dbg-historyList summary::-webkit-details-marker{display:none}.dbg-historyList summary::marker{content:''}
.dbg-historyList summary:hover{background:var(--cfg-hover)}
.dbg-historyIdentity{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dbg-historyName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;font-weight:500}
.dbg-historyFacts{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.dbg-historyState{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--cfg-line-2);border-radius:10px;color:var(--cfg-muted);background:var(--cfg-base);font-size:11px;line-height:18px}
.dbg-historyState[data-phase=active]{color:var(--cfg-accent-text);border-color:color-mix(in srgb,var(--cfg-accent) 30%,transparent);background:var(--cfg-accent-soft)}
.dbg-historyState[data-phase=blocked]{color:var(--cfg-danger);border-color:color-mix(in srgb,var(--cfg-danger) 30%,transparent)}
.dbg-historyMeta{color:var(--cfg-faint);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.dbg-historyBody{padding:4px 6px 8px;margin:0}
.dbg-historyBody time{display:block;margin-top:8px;white-space:normal;overflow-wrap:anywhere}
.dbg-historyEmpty{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;padding:12px 0;color:var(--cfg-faint);font-size:12px;line-height:18px}
.dbg-choice{position:relative;min-width:0}
.dbg-choiceTrigger{appearance:none;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:0;height:32px;padding:0 10px;border:1px solid var(--cfg-line-2);border-radius:8px;background:var(--cfg-raised);color:var(--cfg-ink);font:inherit;text-align:left;cursor:pointer}
.dbg-choiceTrigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbg-choiceTrigger:after{content:'';flex:none;width:6px;height:6px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform 100ms ease}
.dbg-choiceTrigger[aria-expanded=true]:after{transform:translateY(2px) rotate(225deg)}
.dbg-choiceTrigger:hover:not(:disabled){border-color:var(--cfg-line-strong)}
.dbg-choiceTrigger[aria-expanded=true]{border-color:var(--cfg-accent);background:var(--cfg-accent-soft)}
.dbg-choiceList{position:absolute;inset:calc(100% + 4px) 0 auto;z-index:40;box-sizing:border-box;min-width:100%;max-height:224px;overflow:auto;margin:0;padding:4px;list-style:none;border:1px solid var(--cfg-line-strong);border-radius:10px;background:var(--cfg-overlay);color:var(--cfg-ink);scrollbar-width:thin;box-shadow:0 12px 32px -12px rgb(0 0 0/.35)}
.dbg-choice[data-side=above] .dbg-choiceList{inset:auto 0 calc(100% + 4px)}
.dbg-choiceOption{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;padding:0 8px;border-radius:6px;cursor:pointer;white-space:nowrap}
.dbg-choiceOption[data-active=true]{background:var(--cfg-hover)}
.dbg-choiceOption[aria-selected=true]{color:var(--cfg-accent-text);font-weight:500;background:var(--cfg-accent-soft)}
.dbg-choiceOption svg{flex:none}
.dbg-dock :is(button,input,textarea,summary):focus-visible,.dbg-cfg :is(input,button,summary):focus-visible{outline:2px solid var(--cfg-accent);outline-offset:2px}
.dbg-dock :disabled,.dbg-cfg :disabled{opacity:.4;cursor:not-allowed}
.dbg-dock button,.dbg-cfg button{appearance:none}
.dbg-dock button:active:not(:disabled),.dbg-cfg button:active:not(:disabled){background:var(--cfg-hover)}
.dbg-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid transparent;border-radius:8px;font:inherit;font-size:13px;line-height:20px;font-weight:500;color:var(--cfg-ink);background:transparent;cursor:pointer}
.dbg-button:hover:not(:disabled){background:var(--cfg-hover)}
.dbg-button[data-variant=primary]{background:var(--cfg-solid);color:var(--cfg-on-solid);min-width:80px}
.dbg-button[data-variant=primary]:hover:not(:disabled){background:color-mix(in srgb,var(--cfg-solid) 88%,var(--cfg-on-solid))}
.dbg-button[data-variant=outline]{border-color:var(--cfg-line-2)}
.dbg-spinner{box-sizing:border-box;display:inline-block;flex:none;width:12px;height:12px;border:1px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dbg-spin .7s linear infinite}@keyframes dbg-spin{to{transform:rotate(360deg)}}
@media(max-width:640px){.dbg-dock :is(.dbg-iconBtn,.dbg-button,.dbg-objective,.dbg-search,.dbg-choiceTrigger,.dbg-choiceOption,.dbg-historyList summary){min-height:44px}.dbg-iconBtn{width:44px}.dbg-historyTools{flex-direction:column;align-items:stretch}.dbg-historyTools>.dbg-choice{width:100%}.dbg-historyName{white-space:normal;overflow-wrap:anywhere}.dbg-bar{gap:6px}}
@media(pointer:coarse){.dbg-dock :is(.dbg-iconBtn,.dbg-button,.dbg-objective,.dbg-search,.dbg-choiceTrigger,.dbg-choiceOption,.dbg-historyList summary){min-height:44px}.dbg-iconBtn{width:44px}}
@container better-goal-dock (max-width:540px){.dbg-bar{flex-wrap:wrap}.dbg-goalMain{flex-basis:100%}.dbg-actions{margin-left:auto}.dbg-dock :is(.dbg-iconBtn,.dbg-button,.dbg-objective,.dbg-search,.dbg-choiceTrigger,.dbg-choiceOption,.dbg-historyList summary){min-height:44px}.dbg-iconBtn{width:44px}.dbg-historyTools{flex-direction:column;align-items:stretch}.dbg-historyTools>.dbg-choice{width:100%}.dbg-historyName{white-space:normal;overflow-wrap:anywhere}}
@container better-goal-dock (max-width:360px){.dbg-goalMain{align-items:stretch;flex-direction:column;gap:2px}.dbg-goalStatus{flex-wrap:wrap}}
[data-ds-dark-theme] .dbg-dock{--cfg-accent:var(--dsw-alias-state-business-primary,#4eb0e8);--cfg-solid:var(--dsw-alias-button-primary-fill,#4eb0e8);--cfg-on-solid:var(--dsw-alias-label-primary-foreground,#0e1014);--cfg-accent-soft:color-mix(in srgb,var(--cfg-accent) 14%,transparent)}
@media(prefers-reduced-motion:reduce){.dbg-dock *{animation:none!important;transition:none!important}}`

    const SETTINGS_CSS = `.dbg-cfg{--cfg-accent:var(--dsw-alias-state-business-primary,#3388bb);--cfg-solid:var(--dsw-alias-button-primary-fill,#20709e);--cfg-accent-text:color-mix(in srgb,var(--cfg-accent) 70%,var(--cfg-ink));--cfg-accent-soft:color-mix(in srgb,var(--cfg-accent) 10%,transparent);--cfg-ink:var(--dsw-alias-label-primary);--cfg-muted:var(--dsw-alias-label-secondary);--cfg-faint:color-mix(in srgb,var(--dsw-alias-label-tertiary) 80%,var(--dsw-alias-label-primary));--cfg-line:var(--dsw-alias-border-l1);--cfg-line-2:var(--dsw-alias-border-l2);--cfg-line-strong:var(--dsw-alias-border-l3);--cfg-base:var(--dsw-alias-bg-layer-1);--cfg-raised:var(--dsw-alias-bg-layer-2);--cfg-overlay:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-2));--cfg-hover:var(--dsw-alias-interactive-bg-hover);--cfg-danger:color-mix(in srgb,var(--dsw-alias-state-error-primary) 60%,var(--cfg-ink));--cfg-warn:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 60%,var(--cfg-ink));--cfg-success:color-mix(in srgb,var(--dsw-alias-state-success-primary) 60%,var(--cfg-ink));--cfg-on-solid:var(--dsw-alias-label-primary-foreground,#fff);display:flex;flex-direction:column;gap:20px;max-width:960px;min-width:0;margin:0 auto;width:100%;flex:1;min-height:0;container-type:inline-size;container-name:better-goal-settings;font-size:13px;line-height:20px;color:var(--cfg-ink);font-variant-numeric:tabular-nums}
.dbg-cfg *{box-sizing:border-box}
.dbg-pageHead{display:flex;flex-direction:column;gap:4px;min-width:0}
.dbg-title{margin:0;font-size:20px;line-height:28px;font-weight:500;letter-spacing:-.01em}
.dbg-pagePurpose{margin:0;color:var(--cfg-muted);font-size:13px;line-height:20px}
.dbg-note{margin:0;padding:6px 10px;border:1px solid var(--cfg-line-2);border-radius:6px;background:var(--cfg-raised);color:var(--cfg-muted);font-size:12px;line-height:18px}
.dbg-note[data-tone=error],.dbg-status[data-tone=error],.dbg-fieldError{color:var(--cfg-danger)}
.dbg-note[data-tone=warn]{color:var(--cfg-warn)}
.dbg-section{display:flex;flex-direction:column;gap:10px;min-width:0;border:0;padding:0;margin:0}
.dbg-section>legend{display:block;width:100%;margin:0;padding:0 0 8px;border-bottom:1px solid var(--cfg-line);color:var(--cfg-faint);font-size:12px;line-height:18px;font-weight:500;letter-spacing:.02em}
.dbg-hint{margin:0;color:var(--cfg-faint);font-size:12px;line-height:18px}
.dbg-modeCards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.dbg-optionCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.dbg-modeCard{position:relative;display:flex;flex-direction:column;gap:10px;min-width:0;padding:14px;border:1px solid var(--cfg-line-2);border-radius:10px;background:var(--cfg-raised);cursor:pointer;transition:background-color 140ms ease,border-color 140ms ease}
.dbg-modeCard:hover{background:var(--cfg-hover)}
.dbg-modeCard[data-disabled=true]{opacity:.4;cursor:not-allowed}
.dbg-modeCard[data-checked=true]{border-color:var(--cfg-accent);background:var(--cfg-accent-soft)}
.dbg-modeCard:has(.dbg-segmentInput:focus-visible){outline:2px solid var(--cfg-accent);outline-offset:2px}
.dbg-modeCardHead{display:flex;align-items:center;gap:8px;min-width:0}
.dbg-modeCardGlyph{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:1px solid var(--cfg-line-2);border-radius:8px;background:var(--cfg-base);color:var(--cfg-muted)}
.dbg-modeCard[data-checked=true] .dbg-modeCardGlyph{border-color:color-mix(in srgb,var(--cfg-accent) 30%,transparent);color:var(--cfg-accent-text)}
.dbg-modeCardTitle{min-width:0;font-size:13px;line-height:20px;font-weight:500;color:var(--cfg-ink)}
.dbg-modeCardCheck{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:20px;margin-left:auto;color:var(--cfg-accent)}
.dbg-modeCardFlow{display:block;padding:7px 9px;border:1px solid var(--cfg-line);border-radius:6px;background:var(--cfg-base);color:var(--cfg-muted);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dbg-modeCardBullets{display:flex;flex-direction:column;gap:4px;margin:0;padding:0;color:var(--cfg-muted);font-size:12px;line-height:18px}
.dbg-modeCardBullet{display:block;padding-left:12px;position:relative}
.dbg-modeCardBullet:before{content:'·';position:absolute;left:2px;color:var(--cfg-faint)}
.dbg-modeCardStop{display:block;color:var(--cfg-muted);font-size:12px;line-height:18px}
.dbg-modeCardStopLabel{color:var(--cfg-faint)}
.dbg-segmentInput{appearance:none;position:absolute;width:1px;height:1px;opacity:0;margin:0}
.dbg-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid var(--cfg-line-2);border-radius:10px;color:var(--cfg-muted);font-size:11px;line-height:18px;white-space:nowrap}
.dbg-chip[data-tone=accent]{color:var(--cfg-accent-text);border-color:color-mix(in srgb,var(--cfg-accent) 30%,transparent);background:var(--cfg-accent-soft)}
.dbg-roundSpan{display:inline-flex;align-items:center;align-self:flex-start;min-height:28px;padding:0 10px;border:1px solid var(--cfg-line-2);border-radius:6px;background:var(--cfg-base);color:var(--cfg-muted);font-size:12px;line-height:18px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:anywhere}
.dbg-field{display:grid;grid-template-columns:minmax(120px,180px) minmax(0,1fr);gap:8px 20px;padding:4px 0;align-items:start}
.dbg-fieldHeading{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;padding-top:4px}
.dbg-fieldLabel{font-size:13px;line-height:20px;font-weight:500;color:var(--cfg-ink)}
.dbg-fieldBody{display:flex;flex-direction:column;gap:6px;min-width:0}
.dbg-fieldError{margin:0;font-size:12px;line-height:18px}
.dbg-input{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:32px;padding:0 10px;font:inherit;font-size:13px;line-height:20px;color:var(--cfg-ink);background:var(--cfg-raised);border:1px solid var(--cfg-line-2);border-radius:8px;font-variant-numeric:tabular-nums}
.dbg-input::-webkit-inner-spin-button,.dbg-input::-webkit-outer-spin-button{appearance:none;margin:0}
.dbg-input[type=number]{-moz-appearance:textfield}
.dbg-input:hover:not(:disabled){border-color:var(--cfg-line-strong)}
.dbg-input[aria-invalid=true]{border-color:var(--cfg-danger)}
.dbg-input:focus-visible{outline:2px solid var(--cfg-accent);outline-offset:2px}
.dbg-iconBtn{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--cfg-muted);cursor:pointer}
.dbg-iconBtn:hover:not(:disabled){background:var(--cfg-hover);color:var(--cfg-ink)}
.dbg-iconBtn:disabled{opacity:.4;cursor:not-allowed}
.dbg-help{margin:0;font-size:12px;line-height:18px}
.dbg-help>summary{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border-radius:6px;color:var(--cfg-faint);cursor:pointer;list-style:none}
.dbg-help>summary::-webkit-details-marker{display:none}.dbg-help>summary::marker{content:''}
.dbg-help>summary:hover,.dbg-help[open]>summary{background:var(--cfg-hover);color:var(--cfg-ink)}
.dbg-helpText>summary{width:auto;height:auto;min-height:32px;padding:4px 8px;border-radius:6px;color:var(--cfg-muted);font-size:12px;line-height:18px}
.dbg-helpBody{display:flex;flex-direction:column;gap:6px;margin-top:6px;max-width:64ch}
.dbg-helpBody p{margin:0;color:var(--cfg-muted);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dbg-runtime{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:36px;padding:8px 10px;border:1px solid var(--cfg-line-2);border-radius:8px;background:var(--cfg-base);color:var(--cfg-muted);font-size:12px;line-height:18px}
.dbg-runtimeDot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--cfg-muted)}
.dbg-runtimeDot[data-tone=active]{background:var(--cfg-accent)}
.dbg-runtimeDot[data-tone=error]{background:var(--cfg-danger)}
.dbg-runtimeLabel{margin:0;color:var(--cfg-ink);font-size:13px;line-height:20px}
.dbg-runtimeRefresh{margin-left:auto}
.dbg-footer{position:sticky;bottom:0;z-index:2;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0;border-top:1px solid var(--cfg-line-2);background:var(--cfg-base);margin-top:auto}
.dbg-status{flex:1;min-width:140px;margin:0;color:var(--cfg-faint);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dbg-status[data-tone=ok]{color:var(--cfg-success)}
.dbg-status[data-tone=warn]{color:var(--cfg-warn)}
.dbg-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border:1px solid transparent;border-radius:8px;font:inherit;font-size:13px;line-height:20px;font-weight:500;color:var(--cfg-ink);background:transparent;cursor:pointer}
.dbg-button:hover:not(:disabled){background:var(--cfg-hover)}
.dbg-button[data-variant=primary]{background:var(--cfg-solid);color:var(--cfg-on-solid);min-width:80px}
.dbg-button[data-variant=primary]:hover:not(:disabled){background:color-mix(in srgb,var(--cfg-solid) 88%,var(--cfg-on-solid))}
.dbg-button[data-variant=outline]{border-color:var(--cfg-line-2)}
.dbg-spinner{box-sizing:border-box;display:inline-block;flex:none;width:12px;height:12px;border:1px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dbg-spin .7s linear infinite}@keyframes dbg-spin{to{transform:rotate(360deg)}}
@container better-goal-settings (max-width:640px){.dbg-modeCards,.dbg-optionCards{grid-template-columns:1fr}.dbg-field{grid-template-columns:minmax(0,1fr);gap:6px}.dbg-fieldHeading{padding-top:0}.dbg-footer .dbg-status{flex-basis:100%}.dbg-cfg :is(.dbg-input,.dbg-button,.dbg-iconBtn,.dbg-help>summary,.dbg-helpText>summary){min-height:44px}.dbg-cfg .dbg-iconBtn{width:44px}}
@media(max-width:640px){.dbg-modeCards,.dbg-optionCards{grid-template-columns:1fr}.dbg-field{grid-template-columns:minmax(0,1fr);gap:6px}.dbg-fieldHeading{padding-top:0}.dbg-footer .dbg-status{flex-basis:100%}.dbg-cfg :is(.dbg-input,.dbg-button,.dbg-iconBtn,.dbg-help>summary,.dbg-helpText>summary){min-height:44px}.dbg-cfg .dbg-iconBtn{width:44px}}
@media(pointer:coarse){.dbg-cfg :is(.dbg-input,.dbg-button,.dbg-iconBtn,.dbg-help>summary,.dbg-helpText>summary){min-height:44px}.dbg-cfg .dbg-iconBtn{width:44px}}
[data-ds-dark-theme] .dbg-cfg{--cfg-accent:var(--dsw-alias-state-business-primary,#4eb0e8);--cfg-solid:var(--dsw-alias-button-primary-fill,#4eb0e8);--cfg-on-solid:var(--dsw-alias-label-primary-foreground,#0e1014);--cfg-accent-soft:color-mix(in srgb,var(--cfg-accent) 14%,transparent)}
@media(prefers-reduced-motion:reduce){.dbg-cfg *{animation:none!important;transition:none!important}}
`


    // ── Icons (inline SVG keeps this closure dependency-free) ──────────────

    function iconSvg(children) {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
      }, children)
    }

    function IconGoal() {
      return iconSvg([
        h('circle', { key: 'outer', cx: 8, cy: 8, r: 5.5, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('circle', { key: 'inner', cx: 8, cy: 8, r: 1.6, fill: 'currentColor' }),
      ])
    }

    function IconNative() {
      return iconSvg([
        h('rect', { key: 'frame', x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { key: 'cross', d: 'M5.5 8h5M8 5.5v5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      ])
    }

    function IconRefresh() {
      return iconSvg(h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2.5V6h-3.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function IconPause() {
      return iconSvg([
        h('rect', { key: 'left', x: 4.5, y: 3.5, width: 2.2, height: 9, rx: 1, fill: 'currentColor' }),
        h('rect', { key: 'right', x: 9.3, y: 3.5, width: 2.2, height: 9, rx: 1, fill: 'currentColor' }),
      ])
    }

    function IconPlay() {
      return iconSvg(h('path', { d: 'M5.4 3.7 12.2 8l-6.8 4.3Z', fill: 'currentColor' }))
    }

    function IconEdit() {
      return iconSvg(h('path', {
        d: 'M10.4 2.6 13.4 5.6 6.1 12.9 2.8 13.6 3.5 10.3Z',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function IconTrash() {
      return iconSvg([
        h('path', { key: 'lid', d: 'M3 4.5h10M6.4 4.5V3h3.2v1.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { key: 'body', d: 'M4.4 4.5 5 12.5h6l.6-8M6.8 7v3.2M9.2 7v3.2', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      ])
    }

    function IconCheck() {
      return iconSvg(h('path', { d: 'm3.5 8.4 3.1 3.1 5.9-6.9', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function IconInfo() {
      return iconSvg([
        h('circle', { key: 'circle', cx: 8, cy: 8, r: 5.5, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { key: 'stem', d: 'M8 7v4M8 4.8v.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
      ])
    }

    function IconHistory() {
      return iconSvg([
        h('path', { key: 'arc', d: 'M2 7a6 6 0 1 1 1.4 5M2 3v4h4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { key: 'clock', d: 'M8 4.5V8l2.5 1.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      ])
    }

    function IconChevron() {
      return iconSvg(h('path', { d: 'm4.5 6 3.5 3.5L11.5 6', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    function IconClose() {
      return iconSvg(h('path', { d: 'm4.5 4.5 7 7m0-7-7 7', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))
    }

    // ── Shared small helpers ───────────────────────────────────────────────

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }

    /** Mirrors src/config.js: exactly 0 (off) or an integer in [1, MAX_SPIN_HINT_SECONDS]. */
    function isSpinHintSeconds(value) {
      return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SPIN_HINT_SECONDS
    }

    /** Mirrors src/config.js: exactly 0 (never wait) or an integer in [1, MAX_JOB_WAIT_SECONDS]. */
    function isJobWaitSeconds(value) {
      return Number.isSafeInteger(value) && value >= 0 && value <= MAX_JOB_WAIT_SECONDS
    }

    function isPositiveSafeInteger(value) {
      return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1
    }

    function isUnlimitedCap(value) {
      return value === UNLIMITED_ROUNDS
    }

    function failure(code, message) {
      return { ok: false, error: { code, message } }
    }

    function errorText(result) {
      const error = result?.error
      if (typeof error?.message === 'string' && error.message !== '') {
        return typeof error?.code === 'string' && error.code !== ''
          ? `${error.message} (${error.code})`
          : error.message
      }
      return 'goal action failed'
    }

    // ── Goal Remote mutations (CAS ref read at verb call time) ─────────────

    /** Read the session's CURRENT projected CAS ref at verb call time. */
    function currentGoalRef(ctx, sessionId) {
      try {
        const projection = ctx.sessions?.binding(sessionId)?.session?.projections?.faceOf('goal')?.getSnapshot()
        if (!isRecord(projection) || !isRecord(projection.goal)) return undefined
        const { id, revision } = projection.goal
        if (typeof id !== 'string' || id === '' || !Number.isSafeInteger(revision) || revision < 1) return undefined
        return { id, revision }
      } catch {
        return undefined
      }
    }

    /** The one failure the strip reports without a wire call. */
    const noCurrentGoal = {
      ok: false,
      error: {
        code: 'no-current-goal',
        message: 'no current goal to mutate',
      },
    }

    /**
     * Injected mutation verbs for one docked session. The CAS ref is the
     * session's live projection read at call time; the host Remote enforces it.
     * These are the shipped native goal RPCs — no slash-command lifecycle, so
     * a UI action leaves no command/run or implementation JSON in the chat.
     */
    function createGoalActions(ctx, sessionId) {
      const refOf = () => currentGoalRef(ctx, sessionId)
      return {
        onEdit: async (objective) => {
          const ref = refOf()
          if (ref === undefined) return noCurrentGoal
          return ctx.remote.goals.edit(sessionId, ref, { objective })
        },
        onPause: async () => {
          const ref = refOf()
          if (ref === undefined) return noCurrentGoal
          return ctx.remote.goals.pause(sessionId, ref)
        },
        onResume: async () => {
          const ref = refOf()
          if (ref === undefined) return noCurrentGoal
          return ctx.remote.goals.resume(sessionId, ref)
        },
        onClear: async () => {
          const ref = refOf()
          if (ref === undefined) return noCurrentGoal
          return ctx.remote.goals.clear(sessionId, ref)
        },
      }
    }

    // ── Process-local activation (read-only remote.goals.get) ──────────────

    /** Snapshot equality for the activation source. */
    function sameActivation(left, right) {
      return left.id === right.id && left.revision === right.revision && left.activation === right.activation
    }

    /**
     * Registrant-private activation observable.
     *
     * Activation is process-local and deliberately absent from the durable
     * `goal` projection. This source mirrors the shipped ui-goal client: one
     * read-only `remote.goals.get` initializes it, and the native
     * `goal/activation-changed` event plus `connection/reset` keep it current.
     * Mutations use the separate CAS-checked goal Remote verbs.
     *
     * The source subscribes only while a framework hook observes it; stopping
     * all observers releases the Remote/projection/session listeners.
     */
    function createGoalActivationSource(deps) {
      let snapshot = {}
      let subscriptions = 0
      let disposers = []
      let running = deps.session.getSnapshot().running
      let eventEpoch = 0
      let projectionEpoch = 0
      let readEpoch = 0
      const listeners = new Set()

      const publish = (next) => {
        if (sameActivation(snapshot, next)) return
        snapshot = next
        for (const listener of listeners) listener()
      }

      /** Current active CAS ref from the durable projection, if any. */
      const activeRef = () => {
        const projection = deps.projection.getSnapshot()
        if (!isRecord(projection) || !isRecord(projection.goal) || projection.goal.phase !== 'active') return undefined
        return { id: projection.goal.id, revision: projection.goal.revision }
      }

      /** One live activation read, fenced against newer events/projections. */
      const startRead = (ref) => {
        if (ref === undefined) return
        const read = ++readEpoch
        const startedAtEvent = eventEpoch
        const startedAtProjection = projectionEpoch
        Promise.resolve()
          .then(() => deps.getGoal())
          .then((result) => {
            if (read !== readEpoch || startedAtEvent !== eventEpoch || startedAtProjection !== projectionEpoch) return
            if (!result || result.ok !== true) return
            const goal = result.value
            if (goal === undefined) {
              // The durable projection is the authoritative clear edge; an
              // active projection with no live goal is transient.
              if (activeRef() === undefined) publish({})
              return
            }
            publish({ id: goal.id, revision: goal.revision, activation: goal.activation })
          }, (error) => {
            console.warn('[dsh-better-goal] goal activation read failed:', error)
          })
      }

      const refreshProjection = () => {
        projectionEpoch++
        const ref = activeRef()
        if (ref === undefined) {
          if (snapshot.id !== undefined) publish({})
          return
        }
        if (snapshot.id !== ref.id || snapshot.revision !== ref.revision) {
          publish({ id: ref.id, revision: ref.revision })
        }
        startRead(ref)
      }

      const onActivation = (goal) => {
        eventEpoch++
        readEpoch++
        publish(goal === undefined
          ? {}
          : { id: goal.id, revision: goal.revision, activation: goal.activation })
      }

      const onRunning = () => {
        const next = deps.session.getSnapshot().running
        if (next === running) return
        running = next
        startRead(activeRef())
      }

      const onReset = () => {
        eventEpoch++
        projectionEpoch++
        startRead(activeRef())
      }

      const start = () => {
        disposers = [
          deps.projection.subscribe(refreshProjection),
          deps.session.subscribe(onRunning),
          deps.subscribeActivation(onActivation),
          deps.subscribeReset(onReset),
        ]
        running = deps.session.getSnapshot().running
        refreshProjection()
      }

      const stop = () => {
        for (const dispose of disposers) dispose()
        disposers = []
        readEpoch++
      }

      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          if (subscriptions === 0) start()
          subscriptions++
          return () => {
            listeners.delete(listener)
            subscriptions--
            if (subscriptions === 0) stop()
          }
        },
      }
    }

    /**
     * Injected face of one dock entry: mutation verbs plus the private
     * activation observable. Both use the shipped `remote.goals` RPC; the
     * activation read is read-only and every write carries a fresh CAS ref.
     */
    function createGoalDockFace(ctx, sessionId) {
      const binding = ctx.sessions.binding(sessionId)
      if (binding === undefined) throw new Error(`dsh-better-goal: session "${sessionId}" is unavailable`)
      const actions = createGoalActions(ctx, sessionId)
      const goalActivation = createGoalActivationSource({
        projection: binding.session.projections.faceOf('goal'),
        session: binding.session,
        getGoal: async () => {
          if (ctx.sessions.binding(sessionId) !== binding) {
            throw new Error(`dsh-better-goal: session "${sessionId}" is unavailable`)
          }
          return ctx.sessions.using(sessionId, { source: 'betterGoalActivation' }, async (reference) => {
            const state = reference.binding.session.getSnapshot()
            if (state.openState !== 'open') {
              throw state.openError ?? new Error(`session "${sessionId}" is not open`)
            }
            return ctx.remote.goals.get(sessionId)
          })
        },
        subscribeActivation: (listener) => ctx.remote.$on('goal/activation-changed', (event) => {
          if (event.sessionId === sessionId) listener(event.goal)
        }),
        subscribeReset: (listener) => ctx.on('connection/reset', listener),
      })
      return { hooks: { goalActivation }, ...actions }
    }

    /** Select-only combobox: focus stays on the trigger while its option moves. */
    function Choice({ id, label, value, options, disabled, onChange }) {
      const generatedId = useId()
      const controlId = id ?? generatedId
      const [open, setOpen] = useState(false)
      const [active, setActive] = useState(0)
      const [side, setSide] = useState('below')
      const [maxHeight, setMaxHeight] = useState(224)
      const rootRef = useRef(null)
      const typeahead = useRef({ text: '', at: 0 })
      const selected = Math.max(0, options.findIndex((option) => option.value === value))
      const show = (index = selected) => {
        const rect = rootRef.current?.getBoundingClientRect()
        if (rect) {
          const below = rootRef.current.ownerDocument.defaultView.innerHeight - rect.bottom
          const above = rect.top > below && below < 240
          setSide(above ? 'above' : 'below')
          setMaxHeight(Math.max(28, Math.min(224, (above ? rect.top : below) - 12)))
        }
        setActive(index)
        setOpen(true)
      }
      const choose = (index) => {
        onChange(options[index].value)
        setOpen(false)
      }
      useEffect(() => {
        const doc = rootRef.current?.ownerDocument
        if (!open || !doc) return
        const outside = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
        const close = () => setOpen(false)
        doc.addEventListener('pointerdown', outside, true)
        doc.addEventListener('visibilitychange', close)
        doc.defaultView.addEventListener('blur', close)
        doc.defaultView.addEventListener('resize', close)
        return () => {
          doc.removeEventListener('pointerdown', outside, true)
          doc.removeEventListener('visibilitychange', close)
          doc.defaultView.removeEventListener('blur', close)
          doc.defaultView.removeEventListener('resize', close)
        }
      }, [open])
      useEffect(() => {
        if (open) rootRef.current?.querySelector('[data-active=true]')?.scrollIntoView({ block: 'nearest' })
      }, [open, active])
      return h('div', { className: 'dbg-choice', ref: rootRef, 'data-side': side, onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) } },
        h('button', {
          type: 'button', id: controlId, className: 'dbg-choiceTrigger', role: 'combobox', value,
          'aria-label': label, 'aria-haspopup': 'listbox', 'aria-expanded': open,
          'aria-controls': open ? controlId + '-list' : undefined,
          'aria-activedescendant': open ? controlId + '-option-' + active : undefined,
          disabled,
          onClick: () => open ? setOpen(false) : show(),
          onKeyDown: (event) => {
            if (event.nativeEvent?.isComposing || event.defaultPrevented) return
            if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const step = event.key === 'ArrowDown' ? 1 : -1
              if (!open) show()
              else setActive((index) => (index + step + options.length) % options.length)
            } else if (event.key === 'Home' || event.key === 'End') {
              event.preventDefault()
              const index = event.key === 'Home' ? 0 : options.length - 1
              if (!open) show(index)
              else setActive(index)
            } else if ((event.key === 'Enter' || event.key === ' ') && open) {
              event.preventDefault()
              choose(active)
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
              const now = Date.now()
              const previous = now - typeahead.current.at < 600 ? typeahead.current.text : ''
              const text = (previous + event.key).toLocaleLowerCase()
              typeahead.current = { text, at: now }
              const index = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(text))
              if (index >= 0) {
                event.preventDefault()
                if (!open) show(index)
                else setActive(index)
              }
            }
          },
        }, h('span', null, options[selected].label)),
        open ? h('ul', { id: controlId + '-list', className: 'dbg-choiceList', role: 'listbox', style: { maxHeight }, 'aria-label': label }, options.map((option, index) =>
          h('li', { key: option.value, id: controlId + '-option-' + index, className: 'dbg-choiceOption', role: 'option',
            'aria-selected': option.value === value, 'data-active': index === active,
            onPointerMove: () => setActive(index), onPointerDown: (event) => event.preventDefault(), onClick: () => choose(index),
          }, option.label, option.value === value ? h(IconCheck) : null))) : null)
    }

    // ── GoalBar ────────────────────────────────────────────────────────────

    /** One icon button with a native tooltip (title) and an aria label. */
    function IconButton({ label, disabled, onClick, onBlur, onKeyDown, expanded, danger, armed, buttonRef, children }) {
      return h('button', {
        type: 'button',
        className: 'dbg-iconBtn',
        title: label,
        'aria-label': label,
        'aria-expanded': expanded,
        'data-danger': danger || undefined,
        'data-armed': armed || undefined,
        ref: buttonRef,
        disabled: disabled === true,
        onClick, onBlur, onKeyDown,
      }, children)
    }

    /**
     * Durable goal strip. `goal === undefined` means the projection capability
     * is absent/loading; `null` means no current goal; complete goals hide.
     * Creation stays on `/goal`; this strip only edits/stops a current goal.
     */
    function GoalBar({
      goal,
      roundsStarted,
      activation,
      onHistory,
      historyOpen,
      onEdit,
      onPause,
      onResume,
      onClear,
      t,
    }) {
      const [expanded, setExpanded] = useState(false)
      const [editing, setEditing] = useState(false)
      const [draft, setDraft] = useState('')
      const [pending, setPending] = useState(false)
      const [actionError, setActionError] = useState(null)
      const [clearedGoalId, setClearedGoalId] = useState(null)
      const [clearArmed, setClearArmed] = useState(false)
      const editButtonRef = useRef(null)
      const restoreEditFocus = useRef(false)
      const pendingRef = useRef(false)
      const goalId = goal?.id
      const revision = goal?.revision

      useEffect(() => {
        setEditing(false)
        setExpanded(false)
        setClearedGoalId(null)
      }, [goalId])

      useEffect(() => {
        setActionError(null)
        setClearArmed(false)
      }, [goalId, revision])

      useEffect(() => {
        if (!editing && restoreEditFocus.current) {
          if (editButtonRef.current?.isConnected) editButtonRef.current.focus()
          restoreEditFocus.current = false
        }
      }, [editing])

      const runAction = useCallback(async (action) => {
        if (pendingRef.current) return undefined
        pendingRef.current = true
        setPending(true)
        setActionError(null)
        let result
        try {
          result = await action()
        } catch (error) {
          result = failure('action-failed', String(error?.message ?? error))
        }
        pendingRef.current = false
        setPending(false)
        if (!result || result.ok !== true) setActionError(errorText(result))
        return result
      }, [])

      const handleEdit = useCallback(async () => {
        const objective = draft.trim()
        if (objective === '' || objective === goal?.objective) return
        const result = await runAction(() => onEdit(objective))
        if (result?.ok === true) setEditing(false)
      }, [draft, goal?.objective, onEdit, runAction])

      const handleClear = useCallback(async (clearedId) => {
        const result = await runAction(onClear)
        if (result?.ok === true) setClearedGoalId(clearedId)
      }, [onClear, runAction])

      if (goal === undefined || goal === null || goal.phase === 'complete' || goal.id === clearedGoalId) return null

      if (editing) {
        return h('div', { className: 'dbg-dock', 'data-goal-bar': 'dsh-better-goal' },
          h('style', { 'data-plugin-css': STYLE_GOAL }, GOAL_CSS),
          h('div', { className: 'dbg-bar dbg-editBar', 'aria-busy': pending || undefined },
            h('label', { className: 'dbg-editLabel', htmlFor: 'dsh-better-goal-objective' }, tr(t, 'objective.aria')),
            h('textarea', {
              id: 'dsh-better-goal-objective',
              className: 'dbg-editInput',
              rows: 3,
              value: draft,
              placeholder: tr(t, 'edit.placeholder'),
              'aria-label': tr(t, 'objective.aria'),
              autoFocus: true,
              disabled: pending,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.defaultPrevented || event.repeat || event.nativeEvent?.isComposing) return
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  void handleEdit()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation?.()
                  if (!pending) setEditing(false)
                }
              },
            }),
            actionError !== null ? h('span', { className: 'dbg-error', role: 'alert', title: actionError }, actionError) : null,
            h('div', { className: 'dbg-editFooter' },
              h('button', { type: 'button', className: 'dbg-button', 'data-variant': 'outline', 'aria-label': tr(t, 'action.cancel'), disabled: pending, onClick: () => setEditing(false) }, tr(t, 'action.cancel')),
              h('button', { type: 'button', className: 'dbg-button', 'data-variant': 'primary', 'aria-label': tr(t, 'action.save'), disabled: pending || draft.trim() === '' || draft.trim() === goal.objective, 'aria-busy': pending || undefined, onClick: handleEdit },
                pending ? h('span', { className: 'dbg-spinner', 'aria-hidden': true }) : null, tr(t, 'action.save'))),
          ))
      }

      const phaseLabel = goal.phase === 'active'
        ? (activation === 'disarmed' ? tr(t, 'phase.active.disarmed') : tr(t, 'phase.active'))
        : goal.phase === 'paused'
          ? tr(t, 'phase.paused')
          : tr(t, 'phase.blocked')
      const showResume = goal.phase === 'paused' || goal.phase === 'blocked'
        || (goal.phase === 'active' && activation === 'disarmed')
      // Unknown activation (initial live read pending) shows neither verb; the
      // durable paused/blocked phases are unambiguous and always resumable.
      const showPause = goal.phase === 'active' && activation === 'armed'
      const title = goal.phase === 'blocked' ? goal.blockedReason?.message : goal.objective
      const rounds = Number.isSafeInteger(roundsStarted) && roundsStarted >= 0 ? roundsStarted : undefined
      const capLabel = isUnlimitedCap(goal.maxGoalRounds) ? tr(t, 'cap.unlimited') : String(goal.maxGoalRounds)
      const visualState = goal.phase === 'blocked' ? 'blocked' : goal.phase === 'active' && activation !== 'disarmed' ? 'active' : 'paused'

      return h('div', { className: 'dbg-dock', 'data-goal-bar': 'dsh-better-goal' },
        h('style', { 'data-plugin-css': STYLE_GOAL }, GOAL_CSS),
        h('div', { className: 'dbg-bar', title, 'data-running': showPause, 'data-state': visualState, 'data-expanded': expanded, 'aria-busy': pending || undefined },
          h('div', { className: 'dbg-goalMain' },
            h('div', { className: 'dbg-goalStatus' },
              h('span', { className: 'dbg-goalGlyph', 'data-state': visualState },
                pending ? h('span', { className: 'dbg-spinner', 'aria-hidden': true }) : h('span', { className: 'dbg-statusDot' })),
              h('span', { className: 'dbg-label' }, phaseLabel),
              rounds === undefined ? null : h('span', { className: 'dbg-meta dbg-roundChip' }, tr(t, 'meta.rounds', { rounds, max: capLabel }))),
            h('button', { type: 'button', className: 'dbg-objective', title: goal.objective, 'aria-label': tr(t, 'action.details'), 'aria-expanded': expanded, onClick: () => setExpanded((value) => !value) },
              h('span', { className: 'dbg-objectiveText' }, goal.objective), h('span', { className: 'dbg-chevron' }, h(IconChevron)))),
          h('div', { className: 'dbg-actions' },
            onHistory ? h(IconButton, { label: tr(t, 'action.history'), expanded: historyOpen, onClick: onHistory }, h(IconHistory)) : null,
            showPause
              ? h(IconButton, {
                label: tr(t, 'action.pause'),
                disabled: pending,
                onClick: () => runAction(onPause),
              }, h(IconPause))
              : null,
            showResume
              ? h(IconButton, {
                label: tr(t, 'action.resume'),
                disabled: pending,
                onClick: () => runAction(onResume),
              }, h(IconPlay))
              : null,
            h(IconButton, {
              label: tr(t, 'action.edit'),
              buttonRef: editButtonRef,
              disabled: pending,
              onClick: () => {
                setDraft(goal.objective)
                setActionError(null)
                setClearArmed(false)
                restoreEditFocus.current = true
                setEditing(true)
              },
            }, h(IconEdit)),
            h(IconButton, {
              label: tr(t, clearArmed ? 'action.confirmClear' : 'action.clear'),
              danger: true, armed: clearArmed,
              disabled: pending,
              onBlur: () => setClearArmed(false),
              onKeyDown: (event) => { if (event.key === 'Escape' && clearArmed) { event.preventDefault(); event.stopPropagation(); setClearArmed(false) } },
              onClick: () => {
                if (!clearArmed) setClearArmed(true)
                else { setClearArmed(false); void handleClear(goal.id) }
              },
            }, clearArmed ? h(IconCheck) : h(IconTrash))),
          rounds !== undefined && !isUnlimitedCap(goal.maxGoalRounds)
            ? h('div', { className: 'dbg-progressTrack', role: 'progressbar', 'aria-label': tr(t, 'roundLimitLabel'), 'aria-valuemin': 0, 'aria-valuemax': goal.maxGoalRounds, 'aria-valuenow': Math.min(rounds, goal.maxGoalRounds) },
              h('span', { className: 'dbg-progress', style: { width: `${Math.min(100, rounds / goal.maxGoalRounds * 100)}%` } }))
            : null),
        actionError !== null ? h('p', { className: 'dbg-error', role: 'alert' }, actionError) : null,
        expanded ? h('div', { className: 'dbg-details' },
          h('p', { className: 'dbg-fullObjective' }, goal.objective),
          goal.blockedReason ? h('p', { className: 'dbg-error' }, goal.blockedReason.message) : null) : null)
    }

    /** Session history is a host-owned replay projection, never browser storage. */
    function GoalHistory({ history, currentGoalId, currentPhase, open, onToggle, showTrigger, t }) {
      const [query, setQuery] = useState('')
      const [phase, setPhase] = useState('all')
      const deferredQuery = useDeferredValue(query)
      const entries = history?.entries ?? []
      if (!open && entries.length === 0 && !history?.error) return null
      const stateOf = (entry) => entry.cleared ? 'cleared' : entry.id === currentGoalId ? currentPhase ?? entry.phase : entry.phase !== 'complete' ? 'archived' : entry.phase
      const search = deferredQuery.trim().toLocaleLowerCase()
      const matching = open ? entries.filter((entry) => (phase === 'all' || stateOf(entry) === phase) && entry.objective.toLocaleLowerCase().includes(search)).toReversed() : []
      return h('div', { className: 'dbg-dock' },
        h('style', { 'data-plugin-css': STYLE_GOAL }, GOAL_CSS),
        showTrigger ? h('div', { className: 'dbg-bar' },
          h('span', { className: 'dbg-goalGlyph' }, h(IconHistory)),
          h('button', { type: 'button', className: 'dbg-objective', 'aria-label': tr(t, 'action.history'), 'aria-expanded': open, onClick: onToggle }, tr(t, 'history.title')),
          open ? null : h('span', { className: 'dbg-countChip' }, tr(t, 'history.count', { count: entries.length }))) : null,
        open ? h('section', { className: 'dbg-history', 'aria-label': tr(t, 'history.title') },
          h('div', { className: 'dbg-historyHead' },
            h('span', null, tr(t, 'history.title')),
            h('span', { className: 'dbg-countChip' }, tr(t, 'history.count', { count: entries.length })),
            h(IconButton, { label: tr(t, 'action.hideHistory'), onClick: onToggle }, h(IconClose))),
          history?.error ? h('p', { role: 'alert', className: 'dbg-error' }, tr(t, 'history.error'), ': ', history.error) : null,
          h('div', { className: 'dbg-historyTools' },
            h('input', { type: 'search', className: 'dbg-search', value: query, placeholder: tr(t, 'history.search'), 'aria-label': tr(t, 'history.search'),
              onChange: (event) => setQuery(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Escape' && query !== '') { event.preventDefault(); event.stopPropagation(); setQuery('') } },
            }),
            h(Choice, { value: phase, label: tr(t, 'history.all'), onChange: setPhase, options: [
              { value: 'all', label: tr(t, 'history.all') },
              ...['active', 'paused', 'blocked', 'complete', 'cleared', 'archived'].map((value) => ({ value, label: tr(t, `phase.${value}`) })),
            ] })),
          matching.length === 0 ? h('div', { className: 'dbg-historyEmpty', role: 'status' },
            history?.error && entries.length === 0 ? null : tr(t, entries.length === 0 ? 'history.none' : 'history.empty'),
            query !== '' || phase !== 'all' ? h('button', { type: 'button', className: 'dbg-button', 'data-variant': 'outline', onClick: () => { setQuery(''); setPhase('all') } }, tr(t, 'history.clearFilters')) : null) :
            h('ol', { className: 'dbg-historyList' }, matching.map((entry) => h('li', { key: entry.id },
              h('details', { onKeyDown: closeDetailsOnEscape },
                h('summary', null,
                  h('span', { className: 'dbg-historyIdentity' },
                    h('span', { className: 'dbg-historyName' }, entry.objective),
                    h('span', { className: 'dbg-historyFacts' },
                      h('span', { className: 'dbg-historyState', 'data-phase': stateOf(entry) }, tr(t, `phase.${stateOf(entry)}`)),
                      h('span', { className: 'dbg-historyMeta' }, tr(t, 'history.rounds', { rounds: entry.roundsStarted, max: isUnlimitedCap(entry.maxGoalRounds) ? tr(t, 'cap.unlimited') : entry.maxGoalRounds })))),
                  h('span', { className: 'dbg-chevron' }, h(IconChevron))),
                h('div', { className: 'dbg-historyBody' },
                  h('p', { className: 'dbg-fullObjective' }, entry.objective),
                  entry.blockedReason ? h('p', { className: 'dbg-error' }, entry.blockedReason.message) : null,
                  h('time', { className: 'dbg-historyMeta', dateTime: new Date(entry.updatedAt).toISOString() }, tr(t, 'history.updated', { time: new Date(entry.updatedAt).toLocaleString() })))))))) : null)
    }

    /** Dock adapter: durable projection plus the private activation observable. */
    function GoalDock({
      useProjection,
      useGoalActivation,
      onEdit,
      onPause,
      onResume,
      onClear,
      t,
    }) {
      const [historyOpen, setHistoryOpen] = useState(false)
      const history = typeof useProjection === 'function' ? useProjection('better-goal-history') : undefined
      const projection = typeof useProjection === 'function' ? useProjection('goal') : undefined
      const goal = projection === undefined || projection === null ? projection : projection.goal
      const goalId = goal?.id
      const revision = goal?.revision
      const activation = typeof useGoalActivation === 'function'
        ? useGoalActivation((next) => next.id === goalId && next.revision === revision ? next.activation : undefined)
        : undefined
      const hasHistory = history?.entries?.length > 0 || history?.error
      const hasCurrent = goal && goal.phase !== 'complete'
      const toggleHistory = () => setHistoryOpen((value) => !value)
      return h(React.Fragment, null, h(GoalBar, {
        goal,
        onHistory: hasHistory ? toggleHistory : undefined,
        historyOpen,
        roundsStarted: projection === undefined || projection === null ? undefined : projection.roundsStarted,
        activation,
        onEdit,
        onPause,
        onResume,
        onClear,
        t,
      }), h(GoalHistory, { history, currentGoalId: goal?.id, currentPhase: goal?.phase === 'active' && activation === 'disarmed' ? 'paused' : goal?.phase, open: historyOpen, onToggle: toggleHistory, showTrigger: !hasCurrent, t }))
    }

    // ── Settings form (native row config) ──────────────────────────────────

    /** Normalize host values into the editable form shape, falling back to defaults. */
    function shapeConfig(value) {
      const source = isRecord(value) ? value : {}
      return {
        implementation: source.implementation === 'native' ? 'native' : 'enhanced',
        nativeDefaultMaxGoalRounds: isPositiveSafeInteger(source.nativeDefaultMaxGoalRounds) ? source.nativeDefaultMaxGoalRounds : 256,
        nativeBlockedAfterConsecutiveRounds: isPositiveSafeInteger(source.nativeBlockedAfterConsecutiveRounds) ? source.nativeBlockedAfterConsecutiveRounds : 3,
        roundLimitMode: ROUND_LIMIT_MODES.includes(source.roundLimitMode) ? source.roundLimitMode : 'agent',
        roundLimit: isPositiveSafeInteger(source.roundLimit) ? source.roundLimit : DEFAULT_ROUND_LIMIT,
        // 0 is the documented off switch, so it must survive the fallback.
        spinHintSeconds: isSpinHintSeconds(source.spinHintSeconds) ? source.spinHintSeconds : DEFAULT_SPIN_HINT_SECONDS,
        jobWaitSeconds: isJobWaitSeconds(source.jobWaitSeconds) ? source.jobWaitSeconds : DEFAULT_JOB_WAIT_SECONDS,
      }
    }

    /** Host shape → raw text draft (empty/invalid text stays editable). */
    function toDraft(config) {
      return {
        implementation: config.implementation,
        nativeDefaultMaxGoalRounds: String(config.nativeDefaultMaxGoalRounds),
        nativeBlockedAfterConsecutiveRounds: String(config.nativeBlockedAfterConsecutiveRounds),
        roundLimitMode: config.roundLimitMode,
        roundLimit: String(config.roundLimit),
        spinHintSeconds: String(config.spinHintSeconds),
        jobWaitSeconds: String(config.jobWaitSeconds),
      }
    }

    /** One spin threshold draft: exactly 0 (off) or an integer in [1, MAX_SPIN_HINT_SECONDS]. */
    function parseSpinHintText(text) {
      if (typeof text !== 'string') return undefined
      const trimmed = text.trim()
      if (!/^[0-9]+$/.test(trimmed)) return undefined
      const value = Number(trimmed)
      return Number.isSafeInteger(value) && value <= MAX_SPIN_HINT_SECONDS ? value : undefined
    }

    /** One job-wait draft: exactly 0 (never wait) or an integer in [1, MAX_JOB_WAIT_SECONDS]. */
    function parseJobWaitText(text) {
      if (typeof text !== 'string') return undefined
      const trimmed = text.trim()
      if (!/^[0-9]+$/.test(trimmed)) return undefined
      const value = Number(trimmed)
      return Number.isSafeInteger(value) && value <= MAX_JOB_WAIT_SECONDS ? value : undefined
    }

    function parsePositiveSafeIntegerText(text) {
      if (typeof text !== 'string') return undefined
      const trimmed = text.trim()
      if (!/^[0-9]+$/.test(trimmed)) return undefined
      const value = Number(trimmed)
      return Number.isSafeInteger(value) && value >= 1 && value <= UNLIMITED_ROUNDS ? value : undefined
    }

    /**
     * Validate one text draft and produce the JSON value to write.
     * The hidden round-limit text is ignored outside `fixed` mode: the host
     * value stands, so switching modes never writes a value the user cannot see.
     */
    function parseDraft(draft, host) {
      if (!['native', 'enhanced'].includes(draft.implementation)) return { error: 'invalidImplementation' }
      if (!ROUND_LIMIT_MODES.includes(draft.roundLimitMode)) return { error: 'invalidMode' }
      let roundLimit = host.roundLimit
      if (draft.implementation === 'enhanced' && draft.roundLimitMode === 'fixed') {
        const parsed = parsePositiveSafeIntegerText(draft.roundLimit)
        if (parsed === undefined) return { error: 'invalidRoundLimit' }
        roundLimit = parsed
      }
      let nativeDefaultMaxGoalRounds = host.nativeDefaultMaxGoalRounds
      let nativeBlockedAfterConsecutiveRounds = host.nativeBlockedAfterConsecutiveRounds
      if (draft.implementation === 'native') {
        nativeDefaultMaxGoalRounds = parsePositiveSafeIntegerText(draft.nativeDefaultMaxGoalRounds)
        nativeBlockedAfterConsecutiveRounds = parsePositiveSafeIntegerText(draft.nativeBlockedAfterConsecutiveRounds)
        if (nativeDefaultMaxGoalRounds === undefined) return { error: 'invalidNative', field: 'nativeDefaultMaxGoalRounds' }
        if (nativeBlockedAfterConsecutiveRounds === undefined) return { error: 'invalidNative', field: 'nativeBlockedAfterConsecutiveRounds' }
      }
      const spinHintSeconds = parseSpinHintText(draft.spinHintSeconds)
      if (spinHintSeconds === undefined) return { error: 'invalidSpinHint' }
      const jobWaitSeconds = parseJobWaitText(draft.jobWaitSeconds)
      if (jobWaitSeconds === undefined) return { error: 'invalidJobWait' }
      return {
        value: {
          implementation: draft.implementation,
          nativeDefaultMaxGoalRounds,
          nativeBlockedAfterConsecutiveRounds,
          roundLimitMode: draft.implementation === 'enhanced' ? draft.roundLimitMode : host.roundLimitMode,
          roundLimit,
          spinHintSeconds,
          jobWaitSeconds,
        },
      }
    }

    /** One atomic namespace mutation carrying only changed volatile fields. */
    function diffOps(host, next) {
      const ops = []
      for (const key of ['implementation', 'nativeDefaultMaxGoalRounds', 'nativeBlockedAfterConsecutiveRounds']) {
        if (host[key] !== next[key]) ops.push({ op: 'set', path: [key], value: next[key] })
      }
      if (host.roundLimitMode !== next.roundLimitMode) {
        ops.push({ op: 'set', path: ['roundLimitMode'], value: next.roundLimitMode })
      }
      if (host.roundLimit !== next.roundLimit) {
        ops.push({ op: 'set', path: ['roundLimit'], value: next.roundLimit })
      }
      if (host.spinHintSeconds !== next.spinHintSeconds) {
        ops.push({ op: 'set', path: ['spinHintSeconds'], value: next.spinHintSeconds })
      }
      if (host.jobWaitSeconds !== next.jobWaitSeconds) {
        ops.push({ op: 'set', path: ['jobWaitSeconds'], value: next.jobWaitSeconds })
      }
      return ops
    }

    /**
     * One radiogroup keyboard contract for visual choice cards: arrows move by
     * one (wrapping), Home/End jump to the edges, Space/Enter choose the focused
     * option. The cards keep the native radio inputs as the single source of
     * truth, so assistive technology still sees a real radiogroup.
     */
    function radioCardKeyDown(event, values, current, choose, refs) {
      if (event.defaultPrevented || event.nativeEvent?.isComposing || event.target?.disabled) return
      const key = event.key
      const activate = key === ' ' || key === 'Enter' || key === 'Spacebar'
      const navigate = key === 'ArrowRight' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowUp' || key === 'Home' || key === 'End'
      if (!activate && !navigate) return
      const currentIndex = Math.max(0, values.indexOf(current))
      let nextIndex = currentIndex
      if (activate) {
        const focused = values.indexOf(event.target?.value)
        nextIndex = focused >= 0 ? focused : currentIndex
      } else if (key === 'Home') {
        nextIndex = 0
      } else if (key === 'End') {
        nextIndex = values.length - 1
      } else if (key === 'ArrowRight' || key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % values.length
      } else {
        nextIndex = (currentIndex - 1 + values.length) % values.length
      }
      event.preventDefault()
      choose(values[nextIndex])
      const node = refs.current?.[values[nextIndex]]
      if (typeof node?.focus === 'function') node.focus()
    }

    function closeDetailsOnEscape(event) {
      if (event.key !== 'Escape' || event.nativeEvent?.isComposing || !event.currentTarget.open) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.open = false
      event.currentTarget.querySelector('summary')?.focus()
    }

    function Help({ text, t }) {
      return h('details', { className: 'dbg-help dbg-info', onKeyDown: closeDetailsOnEscape },
        h('summary', { 'aria-label': tr(t, 'help'), title: text }, h(IconInfo)),
        h('p', null, text))
    }

    /** Field with a native label and optional keyboard-accessible help. */
    function Field({ id, label, hint, error, t, children }) {
      return h('div', { className: 'dbg-field' },
        h('div', { className: 'dbg-fieldHeading' },
          h('label', { className: 'dbg-fieldLabel', htmlFor: id }, label),
          hint === undefined ? null : h(Help, { text: hint, t })),
        h('div', { className: 'dbg-fieldBody' }, children,
          error ? h('p', { className: 'dbg-fieldError', id: id + '-error', role: 'alert' }, error) : null))
    }

    /** Row configuration page body: every field is a native volatile setting. */
    function GoalConfigPage({ form, t }) {
      const state = form?.state
      const revision = state?.revision
      const [acknowledged, setAcknowledged] = useState(null)
      const host = state?.status === 'ready'
        ? acknowledged?.revision === revision ? acknowledged.value : shapeConfig(state.value)
        : null
      const baseDraft = host === null ? null : toDraft(host)
      const [draft, setDraft] = useState(null)
      const [busy, setBusy] = useState(false)
      const [notice, setNotice] = useState(null)
      const [runtime, setRuntime] = useState(undefined)
      const [runtimeRequest, setRuntimeRequest] = useState(0)
      const busyRef = useRef(false)
      const implementationInputs = useRef({})
      const roundModeInputs = useRef({})
      useEffect(() => {
        let current = true
        setRuntime(undefined)
        fetch('/better-goal/api/config', { cache: 'no-store' })
          .then((response) => {
            if (!response.ok) throw new Error(String(response.status))
            return response.json()
          })
          .then((value) => { if (current) setRuntime(['enhanced', 'native'].includes(value?.runtime?.implementation) ? value : null) })
          .catch(() => { if (current) setRuntime(null) })
        return () => { current = false }
      }, [revision, runtimeRequest])

      const live = draft !== null && draft.revision === revision ? draft.value : baseDraft
      const parsed = live === null ? null : parseDraft(live, host)
      const invalid = parsed?.error ?? null
      const writable = state?.status === 'ready' && state?.writable === true
      const editableKeys = live?.implementation === 'native'
        ? ['implementation', 'nativeDefaultMaxGoalRounds', 'nativeBlockedAfterConsecutiveRounds']
        // spinHintSeconds drives the enhanced driver only, and renders in every
        // round policy mode, so it always counts toward the dirty guard here.
        : ['implementation', 'roundLimitMode', ...(live?.roundLimitMode === 'fixed' ? ['roundLimit'] : []), 'spinHintSeconds', 'jobWaitSeconds']
      // Invalid text still differs from the saved snapshot and must guard closing.
      const changedCount = host === null ? 0 : editableKeys.filter((key) => parsed?.value ? parsed.value[key] !== host[key] : live[key] !== baseDraft[key]).length
      const dirty = changedCount > 0
      const requiresReload = Boolean(runtime?.requiresReload || (parsed?.value && ['implementation', ...(live.implementation === 'native' ? ['nativeDefaultMaxGoalRounds', 'nativeBlockedAfterConsecutiveRounds'] : [])]
        .some((key) => parsed.value[key] !== (runtime?.activeConfig ?? host)[key])))
      const showReloadChip = !dirty && requiresReload

      const edit = useCallback((mutate) => {
        setNotice(null)
        setDraft((previous) => {
          const base = previous !== null && previous.revision === revision ? previous.value : baseDraft
          return base === null ? previous : { revision, value: mutate(base) }
        })
      }, [baseDraft, revision])

      const chooseImplementation = (value) => edit((current) => ({ ...current, implementation: value }))
      const chooseRoundMode = (value) => edit((current) => ({ ...current, roundLimitMode: value }))
      const onImplementationKeyDown = (event) => radioCardKeyDown(event, IMPLEMENTATION_MODES, live.implementation, chooseImplementation, implementationInputs)
      const onRoundModeKeyDown = (event) => radioCardKeyDown(event, ROUND_LIMIT_MODES, live.roundLimitMode, chooseRoundMode, roundModeInputs)

      const save = async () => {
        if (!form || !writable || busyRef.current || !dirty || invalid !== null || parsed?.value === undefined) return
        const ops = diffOps(host, parsed.value)
        if (ops.length === 0) return
        busyRef.current = true
        setBusy(true)
        setNotice(null)
        try {
          const accepted = await form.mutate(ops, revision)
          if (accepted) {
            // An accepted CAS write is saved before the host mirror advances.
            setAcknowledged({ revision, value: parsed.value })
            setNotice({ tone: 'ok', text: tr(t, 'saved') + (runtime === null && requiresReload ? ' · ' + tr(t, 'reloadRequired') : '') })
          } else {
            setDraft(null)
            setNotice({ tone: 'warn', text: tr(t, 'conflict') })
          }
        } catch (error) {
          setNotice({ tone: 'error', text: tr(t, 'saveFailed') + String(error?.message ?? error) })
        } finally {
          busyRef.current = false
          setBusy(false)
        }
      }

      const rootProps = { className: 'dbg-cfg', 'aria-busy': busy || undefined, 'data-settings-dirty': dirty, 'data-settings-busy': busy }
      if (state === undefined || state.status === 'loading') {
        return h('div', rootProps,
          h('p', { className: 'dbg-note', role: 'status' }, tr(t, state === undefined ? 'waitingForm' : 'loading')))
      }
      if (host === null) {
        return h('div', rootProps,
          h('p', { className: 'dbg-note', role: 'alert' }, tr(t, 'unavailable')),
          h('details', { className: 'dbg-help dbg-helpText', onKeyDown: closeDetailsOnEscape }, h('summary', null, tr(t, 'help')), h('p', null, tr(t, 'noFormHint'))))
      }

      const disabled = !writable || busy
      const nativeField = (key, label, hint) => {
        const id = 'dsh-better-goal-' + key
        const hintId = id + '-hint'
        const errorId = id + '-error'
        const error = invalid === 'invalidNative' && parsed.field === key ? tr(t, invalid) : undefined
        return h('div', { key, className: 'dbg-field' },
          h('div', { className: 'dbg-fieldHeading' },
            h('label', { className: 'dbg-fieldLabel', htmlFor: id }, tr(t, label))),
          h('div', { className: 'dbg-fieldBody' },
            h('input', {
              className: 'dbg-input', id, type: 'number', min: 1, max: UNLIMITED_ROUNDS, step: 1, inputMode: 'numeric', value: live[key], disabled,
              'aria-invalid': Boolean(error) || undefined,
              'aria-describedby': error ? errorId + ' ' + hintId : hintId,
              onChange: (event) => edit((current) => ({ ...current, [key]: event.target.value })),
            }),
            h('p', { className: 'dbg-hint', id: hintId }, tr(t, hint)),
            error ? h('p', { className: 'dbg-fieldError', id: errorId, role: 'alert' }, error) : null))
      }
      const roundLimitValue = parsePositiveSafeIntegerText(live.roundLimit)
      const runtimeTone = runtime === null ? 'error' : runtime === undefined ? undefined : 'active'
      const runtimeLabel = runtime === undefined
        ? tr(t, 'runtimeLoading')
        : runtime === null
          ? tr(t, 'runtimeUnavailable')
          : tr(t, 'runtimeActive', { implementation: tr(t, runtime.runtime?.implementation === 'native' ? 'runtimeNative' : 'runtimeBetter') })
      const implementationCard = (value) => {
        const enhanced = value === 'enhanced'
        const checked = live.implementation === value
        return h('label', {
          key: value,
          className: 'dbg-modeCard',
          'data-checked': checked || undefined,
          'data-disabled': disabled || undefined,
        },
          h('input', {
            className: 'dbg-segmentInput', type: 'radio', name: 'dsh-better-goal-implementation',
            id: 'dsh-better-goal-implementation-' + value, value, checked, disabled,
            ref: (node) => { implementationInputs.current[value] = node },
            onChange: () => chooseImplementation(value),
          }),
          h('span', { className: 'dbg-modeCardHead' },
            h('span', { className: 'dbg-modeCardGlyph', 'aria-hidden': true }, enhanced ? h(IconGoal) : h(IconNative)),
            h('span', { className: 'dbg-modeCardTitle' }, tr(t, enhanced ? 'runtimeBetter' : 'runtimeNative')),
            h('span', { className: 'dbg-chip', 'data-tone': checked ? 'accent' : undefined }, tr(t, enhanced ? 'implEnhancedTag' : 'implNativeTag')),
            h('span', { className: 'dbg-modeCardCheck', 'aria-hidden': true }, checked ? h(IconCheck) : null)),
          h('span', { className: 'dbg-modeCardFlow', 'aria-hidden': true }, tr(t, enhanced ? 'implEnhancedFlow' : 'implNativeFlow')),
          h('span', { className: 'dbg-modeCardBullets' },
            (enhanced
              ? ['implEnhancedBullet1', 'implEnhancedBullet2', 'implEnhancedBullet3']
              : ['implNativeBullet1', 'implNativeBullet2', 'implNativeBullet3']).map((key) =>
              h('span', { className: 'dbg-modeCardBullet', key }, tr(t, key)))))
      }
      const roundModeCard = (value) => {
        const copy = value === 'agent'
          ? { title: 'modeAgent', flow: 'modeAgentFlow', stop: 'modeAgentStop' }
          : value === 'unlimited'
            ? { title: 'modeUnlimited', flow: 'modeUnlimitedFlow', stop: 'modeUnlimitedStop' }
            : { title: 'modeFixed', flow: 'modeFixedFlow', stop: 'modeFixedStop' }
        const checked = live.roundLimitMode === value
        return h('label', {
          key: value,
          className: 'dbg-modeCard',
          'data-checked': checked || undefined,
          'data-disabled': disabled || undefined,
        },
          h('input', {
            className: 'dbg-segmentInput', type: 'radio', name: 'dsh-better-goal-round-limit-mode',
            id: 'dsh-better-goal-round-limit-mode-' + value, value, checked, disabled,
            ref: (node) => { roundModeInputs.current[value] = node },
            onChange: () => chooseRoundMode(value),
          }),
          h('span', { className: 'dbg-modeCardHead' },
            h('span', { className: 'dbg-modeCardTitle' }, tr(t, copy.title)),
            h('span', { className: 'dbg-modeCardCheck', 'aria-hidden': true }, checked ? h(IconCheck) : null)),
          h('span', { className: 'dbg-modeCardFlow', 'aria-hidden': true }, tr(t, copy.flow)),
          h('span', { className: 'dbg-modeCardStop' },
            h('span', { className: 'dbg-modeCardStopLabel' }, tr(t, 'modeStop') + ' · '),
            tr(t, copy.stop)))
      }
      return h('div', rootProps,
        h('header', { className: 'dbg-pageHead' },
          h('h3', { className: 'dbg-title' }, tr(t, 'settingsTitle')),
          h('p', { className: 'dbg-pagePurpose' }, tr(t, 'settingsIntro'))),
        writable ? null : h('p', { className: 'dbg-note', role: 'status' }, tr(t, 'readonly')),
        h('div', { className: 'dbg-runtime', role: 'status', 'data-runtime': runtime === null ? 'unavailable' : runtime === undefined ? 'loading' : 'ready' },
          h('span', { className: 'dbg-runtimeDot', 'data-tone': runtimeTone, 'aria-hidden': true }),
          h('p', { className: 'dbg-runtimeLabel' }, runtimeLabel),
          showReloadChip ? h('span', { className: 'dbg-chip', 'data-tone': 'accent' }, tr(t, 'reloadRequired')) : null,
          h('button', {
            type: 'button', className: 'dbg-iconBtn dbg-runtimeRefresh',
            'aria-label': tr(t, 'refreshRuntime'), title: tr(t, 'refreshRuntime'),
            disabled: runtime === undefined,
            onClick: () => setRuntimeRequest((value) => value + 1),
          }, h(IconRefresh))),
        h('fieldset', { className: 'dbg-section' },
          h('legend', { className: 'dbg-sectionTitle' }, tr(t, 'implementation')),
          h('div', { className: 'dbg-modeCards', role: 'radiogroup', 'aria-label': tr(t, 'implementation'), onKeyDown: onImplementationKeyDown },
            IMPLEMENTATION_MODES.map(implementationCard)),
          h('p', { className: 'dbg-hint' }, tr(t, 'implementationHint'))),
        live.implementation === 'native'
          ? h('fieldset', { className: 'dbg-section' },
            h('legend', { className: 'dbg-sectionTitle' }, tr(t, 'nativeSection')),
            nativeField('nativeDefaultMaxGoalRounds', 'nativeDefaultLabel', 'nativeDefaultHint'),
            nativeField('nativeBlockedAfterConsecutiveRounds', 'nativeBlockedLabel', 'nativeBlockedHint'))
          : h('fieldset', { className: 'dbg-section' },
            h('legend', { className: 'dbg-sectionTitle' }, tr(t, 'modeLabel')),
            h('p', { className: 'dbg-hint' }, tr(t, 'roundDefinition')),
            h('div', { className: 'dbg-optionCards', role: 'radiogroup', 'aria-label': tr(t, 'modeLabel'), onKeyDown: onRoundModeKeyDown },
              ROUND_LIMIT_MODES.map(roundModeCard)),
            h(Field, { t, id: 'dsh-better-goal-spin-hint', label: tr(t, 'spinHintLabel'), hint: tr(t, 'spinHintHint'),
              error: invalid === 'invalidSpinHint' ? tr(t, invalid) : undefined,
            }, h('input', { className: 'dbg-input', id: 'dsh-better-goal-spin-hint', type: 'number', min: 0, max: MAX_SPIN_HINT_SECONDS, step: 1, inputMode: 'numeric', value: live.spinHintSeconds, disabled,
              'aria-invalid': invalid === 'invalidSpinHint' || undefined,
              'aria-describedby': invalid === 'invalidSpinHint' ? 'dsh-better-goal-spin-hint-error' : undefined,
              onChange: (event) => edit((current) => ({ ...current, spinHintSeconds: event.target.value })),
            })),
            h(Field, { t, id: 'dsh-better-goal-job-wait', label: tr(t, 'jobWaitLabel'), hint: tr(t, 'jobWaitHint'),
              error: invalid === 'invalidJobWait' ? tr(t, invalid) : undefined,
            }, h('input', { className: 'dbg-input', id: 'dsh-better-goal-job-wait', type: 'number', min: 0, max: MAX_JOB_WAIT_SECONDS, step: 1, inputMode: 'numeric', value: live.jobWaitSeconds, disabled,
              onChange: (event) => edit((current) => ({ ...current, jobWaitSeconds: event.target.value })),
            })),
            live.roundLimitMode === 'fixed' ? h(Field, { t, id: 'dsh-better-goal-round-limit', label: tr(t, 'roundLimitLabel'),
              error: invalid === 'invalidRoundLimit' ? tr(t, invalid) : undefined,
            }, h('input', { className: 'dbg-input', id: 'dsh-better-goal-round-limit', type: 'number', min: 1, max: UNLIMITED_ROUNDS, step: 1, inputMode: 'numeric', value: live.roundLimit, disabled,
              'aria-invalid': invalid === 'invalidRoundLimit' || undefined,
              'aria-describedby': invalid === 'invalidRoundLimit' ? 'dsh-better-goal-round-limit-error' : undefined,
              onChange: (event) => edit((current) => ({ ...current, roundLimit: event.target.value })),
            }), h('span', { className: 'dbg-roundSpan' }, tr(t, 'roundSpan', { rounds: roundLimitValue === undefined ? '…' : isUnlimitedCap(roundLimitValue) ? '∞' : String(roundLimitValue) }))) : null),
        h('details', { className: 'dbg-help dbg-helpText', onKeyDown: closeDetailsOnEscape },
          h('summary', null, tr(t, 'help')),
          h('div', { className: 'dbg-helpBody' },
            h('p', null, tr(t, 'roundDefinition')),
            h('p', null, tr(t, 'implementationHint')),
            state.value?.questionTimeoutSeconds === undefined ? null : h('p', null,
              (state.value.questionTimeoutSeconds === -1 ? tr(t, 'never') : tr(t, 'legacyTimeout', { seconds: state.value.questionTimeoutSeconds })) + ' · ' + tr(t, 'legacyHint')))),
        notice !== null ? h('p', { className: 'dbg-status', 'data-tone': notice.tone, role: notice.tone === 'error' ? 'alert' : 'status' }, notice.text) : null,
        dirty ? h('div', { className: 'dbg-footer' },
          h('span', { className: 'dbg-status', role: 'status' }, busy ? tr(t, 'saving') : tr(t, 'pendingChanges', { count: changedCount }) + (requiresReload ? ' · ' + tr(t, 'reloadRequired') : '')),
          h('button', { type: 'button', className: 'dbg-button', 'data-variant': 'outline', disabled: busy, onClick: () => { setDraft(null); setNotice(null) } }, tr(t, 'reset')),
          h('button', { type: 'button', className: 'dbg-button', 'data-variant': 'primary', disabled: disabled || invalid !== null, 'aria-busy': busy || undefined, onClick: () => void save() },
            busy ? h('span', { className: 'dbg-spinner', 'aria-hidden': true }) : null, busy ? tr(t, 'saving') : tr(t, 'save'))) : null)
    }


    /** `plugins.row.config` entry: summary in the row list, page body otherwise. */
    function GoalConfigPanel(props) {
      const t = props.t ?? fallbackT
      if (props.view === 'summary') return h('span', null, tr(t, 'summary'))
      return h('div', null,
        h('style', { 'data-plugin-css': STYLE_SETTINGS }, SETTINGS_CSS),
        h(GoalConfigPage, { form: props.form, t }))
    }

    /**
     * The one slot entry component registered under every row-config key.
     * Sharing this identity guarantees both assemblies render the same page
     * over the same host-supplied form instead of diverging copies.
     */
    function GoalConfigEntry(props) {
      return h(GoalConfigPanel, { ...props, t: props.t ?? fallbackT })
    }

    // ── Plugin body ────────────────────────────────────────────────────────

    /** Services this client half consumes. */
    const inject = ['slots', 'sessions', 'remote', 'remote.goals', 'locale']

    /** Register the GoalBar dock and the row configuration page. */
    function apply(ctx) {
      let disposeDictionaries = () => {}
      try {
        disposeDictionaries = ctx.locale.register(NS, { zh, en })
        fallbackT = ctx.locale.bind(NS)
      } catch (error) {
        // Locale is optional for rendering; keep the built-in Chinese dictionary.
        console.warn('[dsh-better-goal] locale registration failed:', error)
      }
      ctx.effect(() => disposeDictionaries, 'dsh-better-goal: dictionaries')

      ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-better-goal',
        order: 10,
        locale: NS,
        inject: (sessionId) => createGoalDockFace(ctx, sessionId),
      }, (props) => h(GoalDock, { ...props, t: props.t ?? fallbackT }))), 'dsh-better-goal: GoalBar')

      ctx.effect(() => ctx.slots.inject('plugins.row.config', () => {
        const disposers = []
        try {
          for (const key of ROW_CONFIG_KEYS) {
            disposers.push(ctx.slots.register({
              name: 'plugins.row.config',
              key,
              locale: NS,
            }, GoalConfigEntry))
          }
        } catch (error) {
          console.warn('[dsh-better-goal] row config page unavailable:', error)
        }
        return () => {
          for (const dispose of disposers) dispose()
        }
      }), 'dsh-better-goal: row config page')
    }

    exports.inject = inject
    exports.apply = apply
    // Exported for the scoped React tests; production uses apply().
    exports.GoalBar = GoalBar
    exports.GoalDock = GoalDock
    exports.GoalHistory = GoalHistory
    exports.GoalConfigPanel = GoalConfigPanel
    exports.GoalConfigPage = GoalConfigPage
    exports.createGoalActions = createGoalActions
    exports.shapeConfig = shapeConfig
    exports.parseDraft = parseDraft
    exports.diffOps = diffOps
    return module.exports
  },
})
