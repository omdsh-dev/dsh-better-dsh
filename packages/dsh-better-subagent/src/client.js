/**
 * dsh-better-subagent (npm: @oh-my-dsh/dsh-better-subagent) — 浏览器半边：
 * 官方 Plugins 页的行配置表单。
 *
 * 宿主行导出正式 volatile Config，dsh-settings 把它投影成行配置表单；本文件注册
 * `plugins.row.config`（主键 `@oh-my-dsh/dsh-better-subagent#dsh-better-subagent`，
 * 与 src/config.js 的 ROW_CONFIG_KEYS 同步；Better DSH / Apollo 兼容键并排注册同一页面），
 * 自画紧凑表单并只在保存时一次提交全部改动。零构建：
 * closure factory，只 require('react')，不 import 任何 DSH client 包；样式随组件
 * 树内一个 <style> 渲染（不写 DOM）。注册 id 必须等于 npm 包名（client closure id）。
 */

window.__ModuleLoader__.load({
	id: '@oh-my-dsh/dsh-better-subagent',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const { createElement: h, cloneElement, isValidElement, useEffect, useId, useRef, useState } = require('react');

		const NS = 'better-subagent';
		// Primary key first, then the Better DSH / Apollo compatibility keys. All
		// six render the same page over the one row config; no second store.
		const ROW_KEYS = [
			'@oh-my-dsh/dsh-better-subagent#dsh-better-subagent',
			'dsh-better-dsh#dsh-better-subagent',
			'@menghuan1918/dsh-better-subagent#dsh-better-subagent',
			'@menghuan1918/dsh-apollo#dsh-better-subagent',
			'dsh-apollo#dsh-better-subagent',
			'dsh-better-subagent#dsh-better-subagent',
		];
		const CAPABILITIES_URL = '/better-subagent/api/capabilities';
		const MODELS_URL = '/better-subagent/api/models';
		const ROUTES_URL = '/better-subagent/api/routes';
		/** 子代理模型分档（与 src/config.js 的 tiers 同步）。 */
		const TIERS = ['fast', 'quality'];
		const TIER_TITLE_KEYS = { fast: 'tierFast', quality: 'tierQuality' };
		const TIER_HINT_KEYS = { fast: 'tierFastHint', quality: 'tierQualityHint' };

		/** Codex CLI 权限档（与 src/config.js 的 CODEX_PERMISSION_MODES 同步）。 */
		const CODEX = {
			cli: 'codex',
			executable: 'codex',
			permission: 'read-only',
			permissions: ['read-only', 'workspace-write', 'danger-full-access'],
			profile: true,
		};
		/** Claude Code CLI 权限档（与 src/config.js 的 CLAUDE_PERMISSION_MODES 同步）。 */
		const CLAUDE = {
			cli: 'claude',
			executable: 'claude',
			permission: 'plan',
			permissions: ['plan', 'manual', 'dontAsk', 'acceptEdits', 'auto', 'bypassPermissions'],
			profile: false,
		};
		const BACKENDS = [CODEX, CLAUDE];

		const zh = {
			modelRecommendations: "主代理按任务参考这两档模型；「沿用」使用主会话模型。",
			routingTitle: "模型路由",
			mainAgent: "主代理",
			mainAgentNote: "当前会话使用的模型",
			routingNote: "这两档只是工程预设的推荐，不做强制限制；实际调用仍需使用允许使用的模型。",
			backendsTitle: "本机代理",
			expertSettings: "专家设置",
			expertDefault: "默认启动命令",
			expertCurrent: "{executable} · 配置 {profile}",
			trustedHostsAdvanced: "反向代理信任主机",
			readonlyShort: "只读",
			chooseModel: "选择模型",
			changeModel: "更改模型",
			backendsIntro: "通过本机安装的 Codex 或 Claude 运行子代理，使用各自的默认模型与权限。",
			effortHint: "思考强度决定模型的推理投入，留空使用模型默认值。",
			advanced: "高级",
			configureBackend: '配置 {backend}',
			modelsEmptyTitle: '配置第一个模型',
			effortsFirst: "先填写可选思考强度",
			trustedCount: '{count} 个主机',
			behaviorTitle: '行为',
			defaults: "默认",
			customized: "已修改 {count} 项",
			readonlyDiagnostics: "诊断",
			draftPreview: "草稿预览",
			changeCount: "{count} 项改动",
			resetConfirm: "再次点击放弃",
			backendOff: "启用后可选择默认模型与操作权限。",
			routingPreview: "选择子代理使用的模型",
			tierFastTask: "快速档 · 探索与批量检查",
			tierQualityTask: "质量档 · 实现、调试与审查",
			profileChoose: "使用 Codex 配置 {profile}",
			permissionReadOnly: "只读检查，不写入文件。",
			permissionWrite: "可修改工作区文件，外部访问仍受限。",
			permissionFull: "可修改文件并访问外部资源，跳过权限确认。",
			permissionPlan: "先生成计划，执行需另行授权。",
			permissionManual: "每次敏感操作均请求确认。",
			permissionDontAsk: "无法自动批准的操作直接拒绝。",
			permissionAcceptEdits: "自动允许文件修改，其它操作仍需确认。",
			permissionAuto: "由 Claude 自动评估操作权限。",
			permissionBypass: "跳过所有权限确认。",
			trustedDefault: "仅本机（localhost）",
			modelCatalog: "模型目录",
			diagnosticsLink: "查看连接诊断",
			tabGeneral: "概览",
			tabCli: "本机代理",
			tabTiers: "模型选择",
			tabConnection: "连接",
			details: "说明",
			configured: "已启用",
			inactive: "已停用",
			scopeInactive: "范围已关闭",
			unsaved: "未保存",
			upToDate: "已同步",
			trustedHostsLabel: "允许访问的主机",
			trustedHostsHint: "每行填写主机名或主机名:端口，不含协议和路径；留空仅允许本机访问模型与检测信息，不授予设置写入权限。",
			invalidTrustedHosts: "受信主机格式有误，请填写主机名或 host:port。",
			connectionMode: "配置连接",
			connectionWritable: "可写",
			connectionReadonly: "只读",
			capabilitiesLabel: "CLI 探测",
			routesLabel: "允许使用的模型",
			refresh: "刷新探测",
			ready: "可用",
			failed: "读取失败",
			modelCount: "{count} 个模型",
			saveBeforeDiscover: "先保存启动命令或 Codex 配置，再检测或查找模型。",
			permissionElevated: "此权限档允许绕过 CLI 的权限确认。",
			invalidTierEffort: "{backend}所选思考强度不适用于当前模型，请重新选择。",
			route: "模型",
			effort: "思考强度",
			globalOverrides: "所有预设已包含工程预设。",
			summary: "子代理模型、本机 Codex / Claude 与运行设置",
			title: '子代理',
			intro: "保存后即时生效。",
			loading: "正在加载设置…",
			waitingForm: "正在加载设置…",
			noFormHint: "暂时无法加载设置，请刷新页面或检查连接。",
			unavailable: "当前连接无法访问设置，请在运行 DSH 的电脑上通过 localhost 打开，或联系管理员。",
			readonly: "当前连接仅供查看，无法保存设置。",
			childExitGuardLabel: "等待子代理完成",
			childExitGuardHint: "子代理仍在运行时继续等待；按 Esc 仍可中断。",
			delegationPromptLabel: "委派提示词",
			delegationPromptHint: "把委派纪律与模型分档写进系统提示词，对所有预设生效；与 CLI 接入范围无关。",
			tiersTitle: "子代理模型选择",
			tiersIntro: "为工程预设推荐子代理模型；实际调用仍需符合允许使用的模型范围。",
			tierFast: '快速档',
			tierQuality: '质量档',
			tierFastHint: "探索、检索与批量检查时优先推荐。",
			tierQualityHint: "实现、调试、评审与设计时优先推荐。",
			tierInherit: "沿用主会话模型",
			tierEffortDefault: '模型默认',
			tierRouteLabel: "{tier}模型",
			tierEffortLabel: "{tier}思考强度",
			tierOffList: "(不可用) {route}",
			tiersInactive: "请先在「插件 → 子代理 → 模型选择」启用并添加可用模型；当前仍可沿用主会话模型。",
			routesLoading: "正在读取可用模型…",
			routesError: "暂时无法读取可用模型，请刷新重试。",
			invalidTierRoute: "{backend}所选模型不可用，请改选或沿用主会话模型。",
			scopeTitle: "本机代理可用范围",
			scopeEng: "仅工程预设",
			scopeEngIncluded: "工程预设（已包含）",
			scopeEngHint: "在 eng 和 eng-ptc 会话中提供已启用的 Codex / Claude。",
			scopeGlobal: "所有预设",
			scopeGlobalHint: "在所有会话中提供已启用的 Codex / Claude，包含工程预设。",
			scopeNone: "未选择可用范围，所有会话都无法使用这些本机代理。",
			codexTitle: "Codex 本机代理",
			claudeTitle: "Claude 本机代理",
			backendEnable: '启用',
			executableLabel: "启动命令",
			executableHint: "填写命令名或完整路径，例如 codex 或 /usr/local/bin/codex。",
			profileLabel: "Codex 配置",
			profileHint: "选择已有的 Codex 配置，留空使用默认配置。",
			profileNone: '（不指定）',
			permissionLabel: "文件与操作权限",
			permissionHint: "本机代理使用此处权限，不沿用主会话权限。",
			defaultModelLabel: '默认模型',
			defaultModelNone: '（未指定）',
			modelsLabel: "模型与思考强度",
			modelsHint: "思考强度控制模型的推理投入；每行填写模型 ID、可选值和默认值。",
			modelsEmpty: '还没有配置模型；启用后端前至少加一个模型。',
			discover: '自动发现模型',
			discovering: '正在发现…',
			discoverHint: '从本机 CLI 或 Anthropic 端点读取模型，只追加列表里还没有的条目。',
			discoverDone: '已发现 {count} 个模型，新增 {added} 个。',
			discoverFailed: '自动发现失败：{reason}',
			discoverUnknown: '未知原因',
			discoverReasonMissing: '没找到可执行文件',
			discoverReasonFailed: 'CLI 命令执行失败',
			discoverReasonNoCredentials: '没找到 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY',
			discoverReasonUnauthorized: '模型端点拒绝了凭据（HTTP {status}）',
			discoverReasonHttp: '模型端点返回 HTTP {status}',
			discoverReasonNetwork: '无法连接模型端点',
			discoverReasonParse: '返回内容不是可解析的模型清单',
			discoverReasonEmpty: '模型清单为空',
			discoverReasonTooLarge: '返回内容过大',
			modelIdPlaceholder: '模型 id',
			modelEffortsPlaceholder: 'low, medium, high',
			modelDefaultEffort: "默认思考强度",
			modelEffortNone: '（无默认）',
			modelAdd: '添加模型',
			modelRemove: '移除',
			probing: '正在探测本机可执行文件…',
			detected: '已检测到 {path}（{version}）',
			detectedNoVersion: '已检测到 {path}（版本未知）',
			missing: 'PATH 上没找到 {executable}，可直接填绝对路径。',
			capabilitiesError: '读取本机探测信息失败（不影响保存）。',
			save: '保存',
			saving: '保存中…',
			reset: '放弃改动',
			saved: '已保存，即时生效。',
			conflict: "未能保存，已重新读取当前设置；请检查后重试。",
			saveFailed: '保存失败：',
			invalidEmptyId: '{backend}里有模型缺少 id，请补齐后再保存。',
			invalidDuplicateId: '{backend}的模型 id 不能重复。',
			invalidNoModels: '{backend}已启用，但还没有配置任何模型。',
			invalidDefaultModel: '{backend}已启用，请把默认模型设为模型列表里的一个。',
			invalidDefaultEffort: '{backend}的默认模型需要 effort 列表，并指定一个属于它的默认 effort。',
			readonlyNote: '只读：当前无法写入宿主配置。',
			unavailableNote: '不可写：当前连接下该配置不可用。',
		};

		const en = {
			modelRecommendations: "The main agent uses these tiers as recommendations. Inherit uses the main conversation’s provider and model.",
			routingTitle: "Model routing",
			mainAgent: "Main agent",
			mainAgentNote: "The model used by this conversation",
			routingNote: "These tiers are recommendations for engineering presets, not enforcement; every call must still use a permitted model.",
			backendsTitle: "Local agents",
			expertSettings: "Expert settings",
			expertDefault: "Default command",
			expertCurrent: "{executable} · profile {profile}",
			trustedHostsAdvanced: "Reverse-proxy trusted hosts",
			readonlyShort: "Read-only",
			chooseModel: "Choose model",
			changeModel: "Change model",
			backendsIntro: "Run subagents through Codex or Claude installed on this computer, with their own default model and permissions.",
			effortHint: "Thinking effort controls how much reasoning the model uses. Leave blank for the model default.",
			advanced: "Advanced",
			configureBackend: 'Configure {backend}',
			modelsEmptyTitle: 'Set up your first model',
			effortsFirst: "Add effort options first",
			trustedCount: '{count} hosts',
			behaviorTitle: 'Behavior',
			defaults: "Default",
			customized: "{count} customized",
			readonlyDiagnostics: "Diagnostics",
			draftPreview: "Draft preview",
			changeCount: "{count} changes",
			resetConfirm: "Click again to discard",
			backendOff: "Enable to choose its default model and operation permissions.",
			routingPreview: "Choose models for subagents",
			tierFastTask: "Fast tier · Explore and check",
			tierQualityTask: "Quality tier · Build, debug and review",
			profileChoose: "Use Codex configuration {profile}",
			permissionReadOnly: "Inspect files without writing.",
			permissionWrite: "Edit workspace files with restricted external access.",
			permissionFull: "Edit files and access external resources without approval prompts.",
			permissionPlan: "Plan first; execution requires separate approval.",
			permissionManual: "Request approval for each sensitive operation.",
			permissionDontAsk: "Reject operations that cannot be approved automatically.",
			permissionAcceptEdits: "Allow file edits; other operations still require approval.",
			permissionAuto: "Let Claude assess operation permissions.",
			permissionBypass: "Skip all permission prompts.",
			trustedDefault: "This computer only (localhost)",
			modelCatalog: "Model catalog",
			diagnosticsLink: "View connection diagnostics",
			tabGeneral: "Overview",
			tabCli: "Local agents",
			tabTiers: "Model selection",
			tabConnection: "Connection",
			details: "Details",
			configured: "Enabled",
			inactive: "Disabled",
			scopeInactive: "Scope off",
			unsaved: "Unsaved changes",
			upToDate: "Up to date",
			trustedHostsLabel: "Allowed hosts",
			trustedHostsHint: "Enter a hostname or host:port per line, without a scheme or path. Blank allows only this computer to read model and detection information; this does not grant settings write access.",
			invalidTrustedHosts: "Enter a hostname or host:port for each trusted host.",
			connectionMode: "Settings connection",
			connectionWritable: "Writable",
			connectionReadonly: "Read-only",
			capabilitiesLabel: "CLI detection",
			routesLabel: "Permitted models",
			refresh: "Refresh detection",
			ready: "Available",
			failed: "Request failed",
			modelCount: "{count} models",
			saveBeforeDiscover: "Save the launch command or Codex configuration before detecting agents or finding models.",
			permissionElevated: "This permission mode can bypass CLI approval prompts.",
			invalidTierEffort: "The {backend} thinking effort is unavailable for this model. Select another.",
			route: "Model",
			effort: "Thinking effort",
			globalOverrides: "All presets already includes engineering presets.",
			summary: "Subagent models, local Codex / Claude and run settings",
			title: 'Subagents',
			intro: "Changes apply after saving.",
			loading: "Loading settings…",
			waitingForm: "Loading settings…",
			noFormHint: "Settings are not loading. Refresh the page or check your connection.",
			unavailable: "Settings are unavailable on this connection. Open DSH through localhost on the computer running it, or contact your administrator.",
			readonly: "This connection is view-only. Settings cannot be saved.",
			childExitGuardLabel: "Wait for subagents to finish",
			childExitGuardHint: "Keep waiting while subagents run. You can still interrupt with Esc.",
			delegationPromptLabel: "Delegation prompt",
			delegationPromptHint: "Adds the delegation rules and model tiers to the system prompt for every preset; independent of the CLI scope.",
			tiersTitle: "Subagent model selection",
			tiersIntro: "Recommend subagent models in engineering presets; calls must still use a permitted model.",
			tierFast: 'Fast tier',
			tierQuality: 'Quality tier',
			tierFastHint: "Recommended for exploration, search and batch checks.",
			tierQualityHint: "Recommended for implementation, debugging, review and design.",
			tierInherit: "Use main conversation model",
			tierEffortDefault: 'Model default',
			tierRouteLabel: "{tier} model",
			tierEffortLabel: "{tier} thinking effort",
			tierOffList: "(unavailable) {route}",
			tiersInactive: "Enable and add models in Plugins → Subagent → Model selection first. You can still use the main conversation model.",
			routesLoading: "Loading available models…",
			routesError: "Available models could not be loaded. Refresh to try again.",
			invalidTierRoute: "The {backend} model is unavailable. Choose another or use the main conversation model.",
			scopeTitle: "Where local agents are available",
			scopeEng: "Engineering presets only",
			scopeEngIncluded: "Engineering presets (included)",
			scopeEngHint: "Offer enabled Codex / Claude agents in eng and eng-ptc conversations.",
			scopeGlobal: "All presets",
			scopeGlobalHint: "Offer enabled Codex / Claude agents in every conversation, including engineering presets.",
			scopeNone: "No scope is selected. These local agents are unavailable in all conversations.",
			codexTitle: "Local Codex agent",
			claudeTitle: "Local Claude agent",
			backendEnable: 'Enabled',
			executableLabel: "Launch command",
			executableHint: "Enter a command name or full path, such as codex or /usr/local/bin/codex.",
			profileLabel: "Codex configuration",
			profileHint: "Choose an existing Codex configuration, or leave blank to use its default.",
			profileNone: '(none)',
			permissionLabel: "File and operation permissions",
			permissionHint: "Local agents use these permissions, independently of the main conversation.",
			defaultModelLabel: 'Default model',
			defaultModelNone: '(unset)',
			modelsLabel: "Models and thinking effort",
			modelsHint: "Thinking effort controls how much reasoning a model uses. Enter its ID, effort options and default on each row.",
			modelsEmpty: 'No model yet; add at least one before enabling the backend.',
			discover: 'Discover models',
			discovering: 'Discovering…',
			discoverHint: 'Reads models from the local CLI or the Anthropic endpoint; appends only entries not already listed.',
			discoverDone: 'Found {count} models, added {added}.',
			discoverFailed: 'Discovery failed: {reason}',
			discoverUnknown: 'unknown reason',
			discoverReasonMissing: 'executable not found',
			discoverReasonFailed: 'the CLI command failed',
			discoverReasonNoCredentials: 'no ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY',
			discoverReasonUnauthorized: 'the model endpoint rejected the credential (HTTP {status})',
			discoverReasonHttp: 'the model endpoint answered HTTP {status}',
			discoverReasonNetwork: 'the model endpoint could not be reached',
			discoverReasonParse: 'the reply is not a parseable model list',
			discoverReasonEmpty: 'the model list is empty',
			discoverReasonTooLarge: 'the reply is too large',
			modelIdPlaceholder: 'model id',
			modelEffortsPlaceholder: 'low, medium, high',
			modelDefaultEffort: "Default thinking effort",
			modelEffortNone: '(none)',
			modelAdd: 'Add model',
			modelRemove: 'Remove',
			probing: 'Probing local executables…',
			detected: 'Found {path} ({version})',
			detectedNoVersion: 'Found {path} (version unknown)',
			missing: '{executable} was not found on PATH; type an absolute path if needed.',
			capabilitiesError: 'Could not read local probe data (saving still works).',
			save: 'Save',
			saving: 'Saving…',
			reset: 'Discard',
			saved: 'Saved and applied.',
			conflict: "Could not save. Current settings were reloaded; review them and try again.",
			saveFailed: 'Save failed: ',
			invalidEmptyId: 'Every model in {backend} needs an id before saving.',
			invalidDuplicateId: 'Model ids in {backend} must be unique.',
			invalidNoModels: '{backend} is enabled but has no model configured.',
			invalidDefaultModel: '{backend} is enabled: set the default model to one of its model ids.',
			invalidDefaultEffort: '{backend}’s default model needs an effort list and a default effort from that list.',
			readonlyNote: 'Read-only: host configuration cannot be written.',
			unavailableNote: 'Not writable: this configuration is unavailable on the current connection.',
		};

		/** 宿主发现接口的 error.code → 文案键（未知 code 回退通用原因）。 */
		const DISCOVERY_REASON_KEYS = {
			missing: 'discoverReasonMissing',
			failed: 'discoverReasonFailed',
			'no-credentials': 'discoverReasonNoCredentials',
			unauthorized: 'discoverReasonUnauthorized',
			http: 'discoverReasonHttp',
			network: 'discoverReasonNetwork',
			parse: 'discoverReasonParse',
			empty: 'discoverReasonEmpty',
			'too-large': 'discoverReasonTooLarge',
		};

		// ── 文案（locale 服务缺失时保持中文默认）───────────────────────────────

		function interpolate(text, params) {
			if (params === undefined || params === null) return text;
			return text.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
		}

		let t = (key, params) => interpolate(zh[key] ?? key, params);

		// ── 样式（组件树内的 <style>；复用 DSH 设计令牌，与官方设置页同观感）──────────

		const STYLE_ID = '@oh-my-dsh/dsh-better-subagent/settings.css';
		const CSS = `.bs-root{--cfg-accent:var(--dsw-alias-state-business-primary,#4176e6);--cfg-accent-solid:var(--dsw-alias-button-primary-fill,#0f1115);--cfg-accent-fg:var(--dsw-alias-label-primary-foreground,#fff);--cfg-accent-text:color-mix(in srgb,var(--cfg-accent) 72%,var(--cfg-ink));--cfg-accent-hover:color-mix(in srgb,var(--cfg-accent-solid) 88%,var(--cfg-bg));--cfg-accent-soft:color-mix(in srgb,var(--cfg-accent) 10%,transparent);--cfg-bg:var(--dsw-alias-bg-layer-1);--cfg-raised:var(--dsw-alias-bg-layer-2);--cfg-overlay:var(--dsw-alias-bg-layer-3);--cfg-sunken:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,var(--dsw-alias-bg-layer-1));--cfg-ink:var(--dsw-alias-label-primary);--cfg-muted:var(--dsw-alias-label-secondary);--cfg-dim:color-mix(in srgb,var(--dsw-alias-label-tertiary) 80%,var(--cfg-ink));--cfg-line:var(--dsw-alias-border-l2);--cfg-line-strong:var(--dsw-alias-border-l3);--cfg-hover:var(--dsw-alias-interactive-bg-hover);--cfg-danger:var(--dsw-alias-state-error-primary);--cfg-warn:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 60%,var(--cfg-ink));--cfg-success:color-mix(in srgb,var(--dsw-alias-state-success-primary) 60%,var(--cfg-ink));--cfg-mono:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);color:var(--cfg-ink);font:inherit;font-size:13px;line-height:20px;font-variant-numeric:tabular-nums;min-width:0;width:100%;--bs-action-size:32px;container:bs-settings / inline-size}
.bs-root *{box-sizing:border-box}
.bs-root [hidden]{display:none!important}
.bs-cfg{display:flex;flex-direction:column;gap:20px;max-width:960px;width:100%;margin:0 auto;min-width:0}
.bs-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-height:32px}
.bs-headerMain{display:flex;flex-direction:column;gap:2px;min-width:0}
.bs-headerIntro{color:var(--cfg-dim);font-size:12px;line-height:18px}
.bs-headerMeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.bs-title{margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--cfg-dim)}
.bs-header .bs-title{font-size:20px;line-height:28px;letter-spacing:-.01em;color:var(--cfg-ink)}
.bs-sectionTitle{margin:0;font-size:12px;line-height:18px;font-weight:500;color:var(--cfg-dim)}
.bs-cardTitle{margin:0;font-size:13px;line-height:20px;font-weight:500;color:var(--cfg-ink)}
.bs-hint,.bs-status{margin:0;color:var(--cfg-dim);font-size:12px;line-height:18px}
.bs-hintWarn{color:var(--cfg-warn)}
.bs-note{margin:0;padding:8px 10px;border:1px solid var(--cfg-line);border-radius:8px;background:var(--cfg-sunken);color:var(--cfg-muted);font-size:12px;line-height:18px}
.bs-note[data-tone=error],.bs-hint[data-tone=error],.bs-status[data-tone=error]{color:var(--cfg-danger)}
.bs-note[data-tone=warn]{border-color:var(--cfg-warn);color:var(--cfg-warn)}
.bs-hint[data-tone=ok],.bs-status[data-tone=ok]{color:var(--cfg-success)}
.bs-tabs{display:flex;gap:20px;padding:0;border-bottom:1px solid var(--cfg-line);overflow-x:auto;scrollbar-width:thin}
.bs-tab{appearance:none;position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:32px;padding:0 0 8px;border:0;border-radius:0;background:transparent;color:var(--cfg-muted);font:inherit;font-weight:500;cursor:pointer;white-space:nowrap}
.bs-tab:hover{color:var(--cfg-ink)}
.bs-tab[aria-selected=true]{color:var(--cfg-ink)}
.bs-tab[aria-selected=true]::after{content:"";position:absolute;inset-inline:0;bottom:0;height:1px;background:var(--cfg-accent)}
.bs-subtabs{align-self:flex-start;gap:16px;padding:0;border:0;border-bottom:1px solid var(--cfg-line);border-radius:0;background:transparent}
.bs-subtabs .bs-tab{height:32px;padding:0 0 7px;border:0;border-radius:0;font-weight:400}
.bs-subtabs .bs-tab:hover{background:transparent;color:var(--cfg-ink)}
.bs-subtabs .bs-tab[aria-selected=true]{background:transparent;border:0;color:var(--cfg-ink);font-weight:500}
.bs-tabpanel{display:flex;flex-direction:column;gap:20px;min-width:0}
.bs-section{display:flex;flex-direction:column;gap:6px;min-width:0}
.bs-sectionHead,.bs-cardHead{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:28px}
.bs-toolbar{display:flex;align-items:center;gap:8px;min-width:0}
.bs-card{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border:1px solid var(--cfg-line);border-radius:8px;background:var(--cfg-raised)}
.bs-cardBody{display:flex;flex-direction:column;gap:8px;min-width:0}
.bs-cardHead .bs-switchRow{padding:0;gap:10px}
.bs-cardHead .bs-switchLabel{color:var(--cfg-muted);font-weight:400}
.bs-field{display:grid;grid-template-columns:140px minmax(0,1fr);gap:6px 16px;padding:4px 0;align-items:start}
.bs-fieldLabel{display:flex;align-items:center;gap:5px;padding-top:5px;font-weight:500}
.bs-fieldBody{display:flex;flex-direction:column;gap:4px;min-width:0;width:100%}
.bs-fieldWide{grid-template-columns:minmax(0,1fr);padding-top:4px}
.bs-fieldWide>.bs-fieldLabel{padding:0}
.bs-fieldGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 20px;align-items:start;min-width:0}
.bs-fieldGrid .bs-field{grid-template-columns:minmax(0,1fr);gap:4px;padding:2px 0}
.bs-fieldGrid .bs-fieldLabel{padding:0}
.bs-input,.bs-select,.bs-textarea{appearance:none;width:100%;min-width:0;height:32px;padding:5px 10px;border:1px solid var(--cfg-line);border-radius:6px;background:var(--cfg-bg);color:var(--cfg-ink);font:inherit;line-height:20px}
.bs-textarea{height:auto;min-height:72px;max-height:240px;padding:8px 10px;resize:vertical}
.bs-input:hover:not(:disabled),.bs-select:hover:not(:disabled),.bs-textarea:hover:not(:disabled){border-color:var(--cfg-line-strong)}
.bs-input::placeholder,.bs-textarea::placeholder{color:var(--cfg-dim)}
.bs-root [aria-invalid=true]{border-color:var(--cfg-danger)}
.bs-root :is(input,textarea,button,summary,a,[role=combobox]):focus-visible{outline:2px solid var(--cfg-accent);outline-offset:1px}
.bs-root :is(input,textarea,button):disabled{opacity:.4;cursor:not-allowed}
.bs-mono,.bs-model .bs-input,.bs-textarea{font-family:var(--cfg-mono);font-variant-numeric:tabular-nums}
.bs-mono{overflow-wrap:anywhere}
.bs-selectWrap{position:relative;min-width:0}
.bs-select{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}
.bs-selectValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bs-select svg{flex:none;color:var(--cfg-dim)}
.bs-selectMenu{position:absolute;inset-inline:0;top:calc(100% + 4px);z-index:20;min-width:0;max-height:240px;overflow:auto;padding:4px;border:1px solid var(--cfg-line-strong);border-radius:10px;background:var(--cfg-overlay)}
.bs-selectMenu[data-side=top]{top:auto;bottom:calc(100% + 4px)}
.bs-option{display:flex;align-items:center;gap:8px;min-height:30px;padding:4px 8px;border-radius:6px;color:var(--cfg-ink);cursor:pointer;overflow-wrap:anywhere}
.bs-option[data-active=true]{background:var(--cfg-hover)}
.bs-option[aria-selected=true]{color:var(--cfg-accent-text);background:var(--cfg-accent-soft)}
.bs-optionCheck{width:12px;flex:none}
.bs-optionLabel{min-width:0}
.bs-switchRow{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 0}
.bs-switchMain{flex:1;min-width:0}
.bs-switchLabel{font-weight:500}
.bs-switch{appearance:none;display:flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;border:0;border-radius:6px;background:transparent;cursor:pointer}
.bs-switchTrack{display:block;width:32px;height:18px;padding:2px;border:1px solid var(--cfg-line-strong);border-radius:9px;background:var(--cfg-sunken)}
.bs-switch:hover:not(:disabled) .bs-switchTrack{border-color:var(--cfg-muted)}
.bs-switch[aria-checked=true] .bs-switchTrack{background:var(--cfg-accent-solid);border-color:var(--cfg-accent-solid)}
.bs-switchThumb{display:block;width:12px;height:12px;border-radius:50%;background:var(--cfg-muted);transition:transform 150ms ease}
.bs-switch[aria-checked=true] .bs-switchThumb{transform:translateX(14px);background:var(--cfg-accent-fg)}
.bs-srOnly{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
.bs-advanced{display:flex;flex-direction:column;min-width:0}
.bs-advanced>summary{appearance:none;display:flex;align-items:center;gap:8px;min-height:32px;padding:4px 6px;margin-inline:-6px;list-style:none;border-radius:6px;cursor:pointer;font-weight:500;color:var(--cfg-muted)}
.bs-advanced>summary:hover{background:var(--cfg-hover);color:var(--cfg-ink)}
.bs-advanced>summary::-webkit-details-marker{display:none}
.bs-advanced>summary::before{content:"";flex:none;width:6px;height:6px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(-45deg);margin:0 3px}
.bs-advanced[open]>summary::before{transform:rotate(45deg)}
.bs-advanced[open]>summary{margin-bottom:4px}
.bs-advancedSummary{margin-inline-start:auto;color:var(--cfg-dim);font-weight:400;font-size:.92em;overflow-wrap:anywhere}
.bs-profileChoices{display:flex;gap:4px;flex-wrap:wrap}
.bs-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.bs-button,.bs-iconButton{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:5px 12px;border:1px solid transparent;border-radius:6px;font:inherit;line-height:20px;font-weight:500;color:var(--cfg-ink);background:transparent;cursor:pointer}
.bs-button[data-variant=outline]{border-color:var(--cfg-line-strong)}
.bs-button:hover:not(:disabled),.bs-iconButton:hover:not(:disabled){background:var(--cfg-hover)}
.bs-button:active:not(:disabled){background:var(--cfg-overlay)}
.bs-button[data-variant=primary]{height:32px;min-width:80px;background:var(--cfg-accent-solid);color:var(--cfg-accent-fg)}
.bs-button[data-variant=primary]:hover:not(:disabled){background:var(--cfg-accent-hover)}
.bs-iconButton{width:32px;flex:none;padding:5px;color:var(--cfg-muted)}
.bs-iconButton[data-danger]:hover:not(:disabled){color:var(--cfg-danger)}
.bs-modelsBlock{display:flex;flex-direction:column;gap:6px;min-width:0}
.bs-models{display:flex;flex-direction:column;gap:2px;min-width:0}
.bs-model,.bs-modelHead{display:grid;grid-template-columns:minmax(100px,1.2fr) minmax(100px,1.2fr) minmax(100px,.8fr) var(--bs-action-size);gap:8px;align-items:start}
.bs-model{padding:4px 6px;margin-inline:-6px;border-radius:6px}
.bs-model:hover{background:var(--cfg-hover)}
.bs-modelHead{padding:0 6px 2px;color:var(--cfg-dim);font-size:.92em}
.bs-modelCell{display:flex;flex-direction:column;gap:4px;min-width:0}
.bs-cellLabel{display:none;color:var(--cfg-muted)}
.bs-badge{display:inline-flex;align-items:center;gap:6px;padding:1px 6px;border:1px solid var(--cfg-line);border-radius:6px;line-height:18px;font-weight:400;color:var(--cfg-muted);white-space:nowrap;font-size:.92em}
.bs-badge[data-active=true]{border-color:var(--cfg-accent);color:var(--cfg-accent-text)}
.bs-dot{width:6px;height:6px;flex:none;border-radius:50%;background:var(--cfg-dim)}
.bs-dot[data-active=true]{background:var(--cfg-accent)}
.bs-overview{display:flex;flex-direction:column;gap:2px}
.bs-overviewGlyph{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:1px solid var(--cfg-line);border-radius:6px;background:var(--cfg-raised);color:var(--cfg-muted)}
.bs-overviewMeta{font-size:12px;line-height:18px;color:var(--cfg-dim);overflow-wrap:anywhere}
.bs-overviewRow{appearance:none;display:flex;align-items:center;gap:12px;width:100%;padding:8px 6px;margin-inline:-6px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer;text-align:left}
.bs-overviewRow:hover,.bs-overviewRow:active{background:var(--cfg-hover)}
.bs-overviewName{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.bs-overviewName>span:first-child{font-weight:500}
.bs-overviewRow>svg{color:var(--cfg-dim);flex:none}
.bs-routingDiagram{display:flex;flex-direction:column;gap:2px;padding:2px 0 0;min-width:0}
.bs-routingSource{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border:1px solid var(--cfg-line);border-radius:8px;background:var(--cfg-sunken);min-width:0}
.bs-routingSourceLabel{display:inline-flex;align-items:center;gap:6px;font-weight:500}
.bs-routingSourceLabel::before{content:"";width:6px;height:6px;flex:none;border-radius:50%;background:var(--cfg-accent)}
.bs-routing{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1.1fr) auto;gap:8px 12px;align-items:center;padding:8px 8px 8px 12px;border:0;border-radius:8px;min-width:0}
.bs-routing:hover{background:var(--cfg-hover)}
.bs-routingBranchGlyph{color:var(--cfg-dim);font-family:var(--cfg-mono)}
.bs-routingLabel{font-weight:500}
.bs-routingModel{font-size:12px;line-height:18px;color:var(--cfg-muted);overflow-wrap:anywhere}
.bs-routingNote{margin:2px 0 0}
.bs-tierGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;min-width:0}
.bs-tierCard{min-width:0}
.bs-tierHead{display:flex;flex-direction:column;gap:2px;min-width:0}
.bs-empty{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border:1px solid var(--cfg-line);border-radius:6px;background:var(--cfg-sunken)}
.bs-connectionRow{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;padding:2px 0}
.bs-connectionRow .bs-hint{text-align:end}
.bs-metricGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.bs-metric{display:flex;flex-direction:column;gap:2px;min-width:0;padding:8px 10px;border:1px solid var(--cfg-line);border-radius:6px;background:var(--cfg-sunken)}
.bs-metricLabel{font-size:12px;line-height:18px;color:var(--cfg-dim)}
.bs-metricValue{font-size:13px;line-height:20px;font-weight:500;overflow-wrap:anywhere}
.bs-footer{position:sticky;bottom:0;z-index:10;display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 0;border-top:1px solid var(--cfg-line);background:var(--cfg-bg)}
.bs-footer .bs-status{flex:1;min-width:140px;font-size:12px;line-height:18px;color:var(--cfg-dim)}
.bs-errorLink{color:var(--cfg-danger);text-align:left;white-space:normal;height:auto;min-height:28px}
.bs-feedback{min-height:20px}
.bs-spinner{width:12px;height:12px;flex:none;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:bs-spin .7s linear infinite}
@keyframes bs-spin{to{transform:rotate(360deg)}}
.bs-pulse{animation:bs-pulse 2s ease infinite}
@keyframes bs-pulse{50%{opacity:.55}}
@container bs-settings (max-width:760px){.bs-fieldGrid,.bs-tierGrid{grid-template-columns:minmax(0,1fr)}.bs-metricGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container bs-settings (max-width:640px){.bs-header .bs-title{font-size:18px}.bs-sectionHead,.bs-cardHead,.bs-toolbar{flex-wrap:wrap}.bs-field{grid-template-columns:minmax(0,1fr);gap:4px}.bs-fieldLabel{padding:0}.bs-modelHead{display:none}.bs-model{grid-template-columns:minmax(0,1fr) var(--bs-action-size);gap:8px}.bs-modelCell{grid-column:1}.bs-cellLabel{display:block;font-size:12px;line-height:18px}.bs-model .bs-iconButton{grid-column:2;grid-row:1}.bs-footer .bs-status{flex-basis:100%}.bs-connectionRow{align-items:flex-start;flex-direction:column;gap:4px;padding:6px 0}.bs-connectionRow .bs-hint{text-align:start}.bs-routing{grid-template-columns:minmax(0,1fr);gap:4px;padding:8px}.bs-routingBranchGlyph{display:none}.bs-overviewRow{flex-wrap:wrap}.bs-overviewRow>.bs-badge{white-space:normal}.bs-advancedSummary{white-space:normal}}
@media(pointer:coarse),(max-width:640px){.bs-root{--bs-action-size:44px}.bs-input,.bs-select,.bs-button,.bs-iconButton,.bs-switch,.bs-tab,.bs-subtabs .bs-tab{height:44px;min-height:44px}.bs-textarea{min-height:88px}.bs-switch,.bs-iconButton{width:44px}.bs-option,.bs-advanced>summary{min-height:44px}}
@media(prefers-reduced-motion:reduce){.bs-root *{animation:none!important;transition:none!important}}`;


		// ── 取值/形状（与 src/config.js 的默认形状一致；浏览器半边不能 import 宿主模块）──

		function isRecord(value) {
			return typeof value === 'object' && value !== null && !Array.isArray(value);
		}

		function stringOr(value, fallback) {
			return typeof value === 'string' ? value : fallback;
		}

		function modelList(value) {
			if (!Array.isArray(value)) return [];
			return value.filter(isRecord).map((entry) => {
				const efforts = Array.isArray(entry.efforts) ? entry.efforts.filter((item) => typeof item === 'string') : [];
				const defaultEffort = stringOr(entry.defaultEffort, '');
				return {
					id: stringOr(entry.id, ''),
					efforts,
					// 与 src/config.js 同规则：默认 effort 必须属于该模型的 effort 列表。
					defaultEffort: efforts.indexOf(defaultEffort) >= 0 ? defaultEffort : '',
				};
			});
		}

		function backendShape(value, spec) {
			const source = isRecord(value) ? value : {};
			const backend = {
				enabled: source.enabled === true,
				executable: typeof source.executable === 'string' && source.executable.trim() !== ''
					? source.executable.trim()
					: spec.executable,
			};
			if (spec.profile) backend.profile = stringOr(source.profile, '');
			backend.permissionMode = spec.permissions.indexOf(source.permissionMode) >= 0
				? source.permissionMode
				: spec.permission;
			backend.defaultModel = stringOr(source.defaultModel, '');
			backend.models = modelList(source.models);
			return backend;
		}

		/** 一个分档：provider 或 model 为空即整档清空（与 src/config.js 同规则）。 */
		function tierShape(value) {
			const source = isRecord(value) ? value : {};
			const provider = stringOr(source.provider, '').trim();
			const model = stringOr(source.model, '').trim();
			if (provider === '' || model === '') return { provider: '', model: '', reasoningEffort: '' };
			return { provider, model, reasoningEffort: stringOr(source.reasoningEffort, '').trim() };
		}

		/** 把宿主快照值（或 undefined）规整成表单可安全读写的形状。 */
		function shape(value) {
			const source = isRecord(value) ? value : {};
			const subagents = isRecord(source.subagents) ? source.subagents : {};
			const tiers = isRecord(source.tiers) ? source.tiers : {};
			const result = {
				childExitGuard: source.childExitGuard === true,
				delegationPrompt: !isRecord(source.delegation) || source.delegation.prompt !== false,
				trustedHosts: Array.isArray(source.trustedHosts) ? [...new Set(source.trustedHosts.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))] : [],
				tiers: {},
				subagents: {
					eng: subagents.eng !== false,
					global: subagents.global === true,
				},
			};
			for (const tier of TIERS) result.tiers[tier] = tierShape(tiers[tier]);
			for (const spec of BACKENDS) result.subagents[spec.cli] = backendShape(subagents[spec.cli], spec);
			return result;
		}

		/** 逗号分隔的 effort 文本 → 去重后的字符串数组。 */
		function parseEfforts(text) {
			const result = [];
			for (const part of String(text ?? '').split(',')) {
				const trimmed = part.trim();
				if (trimmed === '' || result.indexOf(trimmed) >= 0) continue;
				result.push(trimmed);
			}
			return result;
		}

		/** 只在用户按下保存时才写入：把差异摊成一组 set 操作（数组整段替换）。 */
		function diffOps(host, current) {
			const ops = [];
			if (JSON.stringify(host.trustedHosts) !== JSON.stringify(current.trustedHosts)) {
				ops.push({ op: 'set', path: ['trustedHosts'], value: current.trustedHosts });
			}
			if (host.childExitGuard !== current.childExitGuard) {
				ops.push({ op: 'set', path: ['childExitGuard'], value: current.childExitGuard });
			}
			if (host.delegationPrompt !== current.delegationPrompt) {
				ops.push({ op: 'set', path: ['delegation', 'prompt'], value: current.delegationPrompt });
			}
			for (const tier of TIERS) {
				if (JSON.stringify(host.tiers[tier]) === JSON.stringify(current.tiers[tier])) continue;
				ops.push({ op: 'set', path: ['tiers', tier], value: tierShape(current.tiers[tier]) });
			}
			for (const key of ['eng', 'global']) {
				if (host.subagents[key] !== current.subagents[key]) {
					ops.push({ op: 'set', path: ['subagents', key], value: current.subagents[key] });
				}
			}
			for (const spec of BACKENDS) {
				const before = host.subagents[spec.cli];
				const after = current.subagents[spec.cli];
				for (const field of Object.keys(after)) {
					if (JSON.stringify(before[field]) === JSON.stringify(after[field])) continue;
					ops.push({ op: 'set', path: ['subagents', spec.cli, field], value: after[field] });
				}
			}
			return ops;
		}

		/**
		 * 前端校验（宿主 schema 管不到跨字段关联，这里补齐）：
		 * 模型 id 非空且唯一；**启用的**后端必须有默认模型，且该模型的 effort
		 * 列表与默认 effort 齐备——CLI 路由按这三元组选档，缺一项运行时就报错。
		 * 分档：白名单读取成功时，已选路由必须在白名单内（否则子代理派发会被策略拒绝）。
		 * @param current - 表单当前值。
		 * @param allowed - `routesOf()` 的结果；白名单未读到时为 null（不校验分档）。
		 * @returns `{ key, titleKey }`（key 用 `{backend}` 参数渲染后端/分档名），或 null。
		 */
		function validate(current, allowed) {
			for (const host of current.trustedHosts) {
				try {
					const url = new URL('http://' + host);
					if (!url.hostname || url.username || url.password || /[\s/?#@\\]/.test(host) || host.includes('://')) return { key: 'invalidTrustedHosts' };
				} catch {
					return { key: 'invalidTrustedHosts' };
				}
			}
			if (allowed !== null && allowed !== undefined) {
				for (const tier of TIERS) {
					const value = current.tiers[tier];
					if (value.provider === '' || value.model === '') continue;
					const route = findRoute(allowed.routes, value);
					if (route === undefined) {
						return { key: 'invalidTierRoute', titleKey: TIER_TITLE_KEYS[tier] };
					}
					if (value.reasoningEffort !== '' && route.efforts.length > 0 && !route.efforts.includes(value.reasoningEffort)) {
						return { key: 'invalidTierEffort', titleKey: TIER_TITLE_KEYS[tier] };
					}
				}
			}
			for (const spec of BACKENDS) {
				const backend = current.subagents[spec.cli];
				const titleKey = spec.cli === 'codex' ? 'codexTitle' : 'claudeTitle';
				const fail = (key) => ({ key, titleKey });
				if (!backend.enabled) continue;
				const ids = backend.models.map((model) => model.id.trim());
				if (ids.indexOf('') >= 0) return fail('invalidEmptyId');
				if (new Set(ids).size !== ids.length) return fail('invalidDuplicateId');
				if (backend.models.length === 0) return fail('invalidNoModels');
				const selected = backend.models.find((model) => model.id.trim() === backend.defaultModel.trim());
				if (selected === undefined) return fail('invalidDefaultModel');
				if (selected.efforts.length === 0) return fail('invalidDefaultEffort');
				if (selected.defaultEffort === '' || selected.efforts.indexOf(selected.defaultEffort) < 0) {
					return fail('invalidDefaultEffort');
				}
			}
			return null;
		}

		// ── 能力探针（host 半边的只读接口）─────────────────────────────────────

		/** 拉取一个 `/better-subagent/api/*` 只读接口；失败只降级显示，不阻塞表单。 */
		function useEndpoint(url, revision) {
			const [state, setState] = useState({ status: 'loading' });
			const [refreshKey, setRefreshKey] = useState(0);
			useEffect(() => {
				let active = true;
				const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
				const done = (next) => {
					if (active) setState(next);
				};
				void (async () => {
					try {
						const res = await fetch(url, controller === undefined ? undefined : { signal: controller.signal });
						const body = await res.json().catch(() => undefined);
						if (!res.ok || body?.ok !== true) throw new Error('HTTP ' + String(res.status));
						done({ status: 'ready', value: body.value });
					} catch (error) {
						done({ status: 'error', message: String(error?.message ?? error) });
					}
				})();
				return () => {
					active = false;
					controller?.abort();
				};
			}, [url, refreshKey, revision]);
			return { ...state, reload: () => { setState({ status: 'loading' }); setRefreshKey((value) => value + 1); } };
		}

		/**
		 * `/better-subagent/api/routes` 的结果 → `{ enabled, routes }`；未读到（加载中/失败）时 null。
		 * 每条路由 `{ provider, model, efforts, defaultEffort }`。
		 */
		function routesOf(state) {
			if (state.status !== 'ready') return null;
			const value = isRecord(state.value) ? state.value : {};
			const routes = [];
			for (const entry of Array.isArray(value.routes) ? value.routes : []) {
				if (!isRecord(entry)) continue;
				const provider = stringOr(entry.provider, '').trim();
				const model = stringOr(entry.model, '').trim();
				if (provider === '' || model === '') continue;
				routes.push({
					provider,
					model,
					efforts: Array.isArray(entry.efforts) ? entry.efforts.filter((item) => typeof item === 'string' && item !== '') : [],
					defaultEffort: stringOr(entry.defaultEffort, ''),
				});
			}
			return { enabled: value.enabled === true, routes };
		}

		function findRoute(routes, tier) {
			return routes.find((route) => route.provider === tier.provider && route.model === tier.model);
		}

		/** 路由下拉的值：`provider/model`（按第一个 `/` 切回；provider id 不含 `/`）。 */
		function routeKey(route) {
			return route.provider === '' || route.model === '' ? '' : route.provider + '/' + route.model;
		}

		function parseRouteKey(key) {
			const text = String(key ?? '');
			const at = text.indexOf('/');
			if (at <= 0 || at === text.length - 1) return { provider: '', model: '' };
			return { provider: text.slice(0, at), model: text.slice(at + 1) };
		}

		/** 一行探针结论：已检测到 <路径>（版本）/ 未找到。 */
		function detectionOf(capabilities, spec, backend, translate) {
			if (capabilities.status === 'loading') return translate('probing');
			if (capabilities.status !== 'ready') return translate('capabilitiesError');
			const info = isRecord(capabilities.value?.executables) ? capabilities.value.executables[spec.cli] : undefined;
			if (typeof info?.path === 'string' && info.path !== '') {
				return typeof info.version === 'string' && info.version !== ''
					? translate('detected', { path: info.path, version: info.version })
					: translate('detectedNoVersion', { path: info.path });
			}
			return translate('missing', { executable: backend.executable });
		}

		// ── 基础控件 ───────────────────────────────────────────────────────────


		function Chevron() {
			return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'm9 5 7 7-7 7' }));
		}

		function Advanced({ summary, children, detailsRef, label }) {
			return h('details', { className: 'bs-advanced', ref: detailsRef, onKeyDown: (event) => {
				if (event.key !== 'Escape' || event.defaultPrevented || !event.currentTarget.open) return;
				event.preventDefault(); event.stopPropagation();
				event.currentTarget.open = false;
				event.currentTarget.querySelector('summary')?.focus();
			} },
				h('summary', null, label ?? t('advanced'), h('span', { className: 'bs-advancedSummary' }, summary)), children);
		}

		/** Focus stays on the trigger; the active option is announced by the combobox. */
		function Select({ children: options, value, onChange, disabled, id, className, ...props }) {
			const uid = useId();
			const listId = 'bs-options-' + uid.replace(/[^a-zA-Z0-9_-]/g, '');
			const root = useRef(null);
			const trigger = useRef(null);
			const items = useRef([]);
			const search = useRef({ text: '', at: 0 });
			const [open, setOpen] = useState(false);
			const [active, setActive] = useState(0);
			const [side, setSide] = useState('bottom');
			const selected = Math.max(0, options.findIndex((option) => option.value === value));
			useEffect(() => {
				if (!open) return;
				const owner = root.current?.ownerDocument;
				const outside = (event) => { if (!root.current?.contains(event.target)) setOpen(false); };
				owner?.addEventListener('pointerdown', outside);
				return () => owner?.removeEventListener('pointerdown', outside);
			}, [open]);
			useEffect(() => { if (open) items.current[active]?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);
			const show = (index) => {
				if (disabled || options.length === 0) return;
				const rect = trigger.current?.getBoundingClientRect();
				const height = root.current?.ownerDocument?.defaultView?.innerHeight;
				setSide(rect && height - rect.bottom < Math.min(240, options.length * 28 + 10) && rect.top > height - rect.bottom ? 'top' : 'bottom');
				setActive(index);
				setOpen(true);
			};
			const choose = (index) => {
				if (disabled || !options[index]) return;
				onChange({ target: { value: options[index].value } });
				setOpen(false);
			};
			return h('div', { className: 'bs-selectWrap', ref: root },
				h('button', { ...props, id, type: 'button', className, value, disabled, ref: trigger, role: 'combobox',
					'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': listId,
					'aria-activedescendant': open ? listId + '-' + active : undefined,
					onClick: () => open ? setOpen(false) : show(selected),
					onBlur: () => setOpen(false),
					onKeyDown: (event) => {
						if (disabled || event.defaultPrevented) return;
						if (event.key === 'Escape' && open) {
							event.preventDefault(); event.stopPropagation(); setOpen(false); return;
						}
						if (event.key === 'Tab') { setOpen(false); return; }
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault(); open ? choose(active) : show(selected); return;
						}
						let next;
						if (event.key === 'ArrowDown') next = open ? Math.min(active + 1, options.length - 1) : selected;
						else if (event.key === 'ArrowUp') next = open ? Math.max(active - 1, 0) : selected;
						else if (event.key === 'Home') next = 0;
						else if (event.key === 'End') next = options.length - 1;
						else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
							const now = Date.now();
							const text = (now - search.current.at < 700 ? search.current.text : '') + event.key.toLowerCase();
							search.current = { text, at: now };
							const start = open ? active : selected;
							for (let step = 1; step <= options.length; step++) {
								const index = (start + step) % options.length;
								if (String(options[index].label).toLowerCase().startsWith(text)) { next = index; break; }
							}
						} else return;
						if (next === undefined) return;
						event.preventDefault(); open ? setActive(next) : show(next);
					},
				}, h('span', { className: 'bs-selectValue' }, options[selected]?.label ?? value),
					h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'aria-hidden': true }, h('path', { d: 'm4 6 4 4 4-4' }))),
				h('div', { id: listId, className: 'bs-selectMenu', role: 'listbox', hidden: !open, 'data-side': side, 'aria-label': props['aria-label'], 'aria-labelledby': id },
					options.map((option, index) => h('div', { key: option.value, id: listId + '-' + index, role: 'option', className: 'bs-option',
						'data-value': option.value, 'aria-selected': option.value === value, 'data-active': index === active,
						ref: (node) => { items.current[index] = node; },
						onPointerDown: (event) => event.preventDefault(), onPointerMove: () => setActive(index), onClick: () => choose(index),
					}, h('span', { className: 'bs-optionCheck', 'aria-hidden': true }, option.value === value ? '✓' : ''), h('span', { className: 'bs-optionLabel' }, option.label)))));
		}

		/** Controls stay mounted across tabs to preserve in-progress text. */
		function Tabs({ id, label, items, value, onChange, compact, tabRefs }) {
			const refs = useRef({});
			return h('div', { className: compact ? 'bs-tabs bs-subtabs' : 'bs-tabs', role: 'tablist', 'aria-label': label },
				items.map((item, index) => h('button', {
					key: item.id, type: 'button', className: 'bs-tab', role: 'tab',
					id: id + '-tab-' + item.id, 'aria-controls': id + '-panel-' + item.id,
					'aria-selected': value === item.id, tabIndex: value === item.id ? 0 : -1,
					ref: (node) => { refs.current[item.id] = node; if (tabRefs) tabRefs.current[item.id] = node; },
					onClick: () => onChange(item.id),
					onKeyDown: (event) => {
						let next;
						if (event.key === 'ArrowRight') next = (index + 1) % items.length;
						else if (event.key === 'ArrowLeft') next = (index + items.length - 1) % items.length;
						else if (event.key === 'Home') next = 0;
						else if (event.key === 'End') next = items.length - 1;
						else return;
						event.preventDefault();
						onChange(items[next].id);
						refs.current[items[next].id]?.focus();
					},
				}, item.active === undefined ? null : h('span', { className: 'bs-dot', 'data-active': item.active, 'aria-hidden': true }), item.label)));
		}

		function Field({ id, label, hint, showHint = true, wide, children }) {
			const hintId = 'bs-hint-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
			const control = hint === undefined || children === null || typeof children !== 'object'
				? children
				: Array.isArray(children)
					? children.map((child, at) => (at === 0 && isValidElement(child) ? cloneElement(child, { key: child.key ?? 'control', 'aria-describedby': hintId }) : child))
					: cloneElement(children, { 'aria-describedby': hintId });
			return h('div', { className: wide ? 'bs-field bs-fieldWide' : 'bs-field' },
				h('div', { className: 'bs-fieldLabel' },
					h(id === undefined ? 'span' : 'label', { htmlFor: id }, label)),
				h('div', { className: 'bs-fieldBody' }, control,
					hint === undefined ? null : h('p', { id: hintId, className: showHint ? 'bs-hint' : 'bs-srOnly' }, hint)));
		}

		function SwitchRow({ id, label, hint, checked, disabled, onChange }) {
			const labelId = id + '-label';
			const hintId = hint === undefined ? undefined : id + '-hint';
			return h('div', { className: 'bs-switchRow' },
				h('div', { className: 'bs-switchMain' },
					h('label', { className: 'bs-switchLabel', id: labelId, htmlFor: id }, label),
					hint === undefined ? null : h('p', { className: 'bs-hint', id: hintId }, hint)),
				h('button', {
					type: 'button', id, role: 'switch', className: 'bs-switch',
					'aria-checked': checked === true, 'aria-labelledby': labelId, 'aria-describedby': hintId,
					disabled: disabled === true, onClick: () => onChange(checked !== true),
				}, h('span', { className: 'bs-switchTrack', 'aria-hidden': true }, h('span', { className: 'bs-switchThumb' }))));
		}

		/** Keep delimiters while typing; normalize only the values sent to the host. */
		function HostList({ hosts, disabled, t: translate, onChange, 'aria-describedby': describedBy }) {
			const key = hosts.join('\u0000');
			const [buffer, setBuffer] = useState({ key, text: hosts.join('\n') });
			if (buffer.key !== key) setBuffer({ key, text: hosts.join('\n') });
			return h('textarea', {
				className: 'bs-textarea', id: 'bs-trusted-hosts', rows: 4,
				value: buffer.key === key ? buffer.text : hosts.join('\n'), disabled,
				spellCheck: false, autoCapitalize: 'none', autoComplete: 'off',
				placeholder: 'proxy.example.com:8443', 'aria-label': translate('trustedHostsLabel'), 'aria-describedby': describedBy,
				onChange: (event) => {
					const text = event.target.value;
					const values = [...new Set(text.split(/[\n,]+/).map((part) => part.trim()).filter(Boolean))];
					setBuffer({ key: values.join('\u0000'), text });
					onChange(values);
				},
			});
		}

		/** 下拉选项：保留当前值（外部写入的值不在候选里时也不能被静默改掉）。 */
		function optionNodes(values, current, noneLabel) {
			const nodes = [];
			if (noneLabel !== undefined) nodes.push({ value: '', label: noneLabel });
			const seen = new Set();
			for (const value of values) {
				if (typeof value !== 'string' || value === '' || seen.has(value)) continue;
				seen.add(value);
				nodes.push({ value, label: value });
			}
			if (typeof current === 'string' && current !== '' && !seen.has(current)) {
				nodes.push({ value: current, label: current });
			}
			return nodes;
		}

		/**
		 * 一个模型的编辑行：effort 用本地文本缓冲（直接回填解析结果会吃掉未输完的逗号）。
		 * 缓冲同时记住“它对应的已解析 effort 列表”。用户输入时缓冲与解析结果一起更新，
		 * 因此不会触发下面的同步；只有外部变化（删除上一行导致同 index 换成另一个模型、
		 * 宿主 revision 刷新、自动发现改写列表）才会让 key 不匹配并重置文本。
		 */
		function ModelRow({ model, index, disabled, requiredDefault, t: translate, onPatch, onRemove }) {
			const effortsKey = model.efforts.join('\u0000');
			const [buffer, setBuffer] = useState({ key: effortsKey, text: model.efforts.join(', ') });
			if (buffer.key !== effortsKey) setBuffer({ key: effortsKey, text: model.efforts.join(', ') });
			const effortsText = buffer.key === effortsKey ? buffer.text : model.efforts.join(', ');
			return h('div', { className: 'bs-model' },
				h('label', { className: 'bs-modelCell' },
					h('span', { className: 'bs-cellLabel' }, translate('modelIdPlaceholder')),
					h('input', {
						className: 'bs-input', type: 'text', value: model.id, disabled, 'data-model-id': true,
						placeholder: translate('modelIdPlaceholder'), spellCheck: false,
						'aria-label': translate('modelIdPlaceholder') + ' ' + String(index + 1),
						'aria-invalid': model.id.trim() === '',
						onChange: (event) => onPatch({ id: event.target.value }),
					})),
				h('label', { className: 'bs-modelCell' },
					h('span', { className: 'bs-cellLabel' }, translate('effort')),
					h('input', {
						className: 'bs-input', type: 'text', value: effortsText, disabled,
						placeholder: translate('modelEffortsPlaceholder'), spellCheck: false,
						'aria-label': translate('modelEffortsPlaceholder') + ' ' + String(index + 1),
						onChange: (event) => {
							const text = event.target.value;
							const efforts = parseEfforts(text);
							setBuffer({ key: efforts.join('\u0000'), text });
							onPatch({ efforts, defaultEffort: efforts.includes(model.defaultEffort) ? model.defaultEffort : '' });
						},
					})),
				h('label', { className: 'bs-modelCell' },
					h('span', { className: 'bs-cellLabel' }, translate('modelDefaultEffort')),
					h(Select, {
						className: 'bs-select', value: model.defaultEffort,
						disabled: disabled || model.efforts.length === 0,
						'aria-label': translate('modelDefaultEffort') + ' ' + String(index + 1),
						'aria-invalid': requiredDefault && !model.efforts.includes(model.defaultEffort),
						onChange: (event) => {
							const next = event.target.value;
							if (next !== '' && !model.efforts.includes(next)) return;
							onPatch({ defaultEffort: next });
						},
					}, optionNodes(model.efforts, model.defaultEffort, translate(model.efforts.length === 0 ? 'effortsFirst' : 'modelEffortNone')))),
				h('button', {
					type: 'button', className: 'bs-iconButton', 'data-danger': true,
					title: translate('modelRemove'), 'aria-label': translate('modelRemove'), disabled, onClick: onRemove,
				}, h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, 'aria-hidden': true },
					h('path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7' }))));
		}

		/**
		 * 一个分档：一张可见的模型卡（用途 + 模型下拉 + 思考强度），主选项不藏进折叠区。
		 * 已保存但不在白名单里的路由仍作为选项保留（白名单读到时标注出来），不被静默改掉。
		 */
		function TierRow({ tier, value, allowed, disabled, t: translate, onPatch }) {
			const title = translate(TIER_TITLE_KEYS[tier]);
			const routes = allowed === null ? [] : allowed.routes;
			const current = routeKey(value);
			const selected = findRoute(routes, value);
			const routeOptions = [{ value: '', label: translate('tierInherit') }];
			for (const route of routes) {
				routeOptions.push({ value: routeKey(route), label: route.provider + ' / ' + route.model });
			}
			if (current !== '' && selected === undefined) {
				const label = value.provider + ' / ' + value.model;
				routeOptions.push({ value: current, label: allowed === null ? label : translate('tierOffList', { route: label }) });
			}
			const effortLabel = translate('tierEffortLabel', { tier: title });
			const effort = selected !== undefined && selected.efforts.length > 0
				? h(Select, {
					className: 'bs-select',
					id: 'bs-tier-' + tier + '-effort',
					'aria-label': effortLabel,
					'aria-invalid': value.reasoningEffort !== '' && !selected.efforts.includes(value.reasoningEffort),
					value: value.reasoningEffort,
					disabled: disabled || current === '',
					onChange: (event) => onPatch({ reasoningEffort: event.target.value }),
				}, optionNodes(selected.efforts, value.reasoningEffort, translate('tierEffortDefault')))
					: h('input', {
						className: 'bs-input',
						type: 'text',
						id: 'bs-tier-' + tier + '-effort',
						'aria-label': effortLabel,
						value: value.reasoningEffort,
						placeholder: translate('tierEffortDefault'),
						spellCheck: false,
						autoComplete: 'off',
						disabled: disabled || current === '',
						onChange: (event) => onPatch({ reasoningEffort: event.target.value.trim() }),
					});
			return h('section', { className: 'bs-card bs-tierCard', 'aria-label': title },
				h('div', { className: 'bs-cardHead' },
					h('div', { className: 'bs-tierHead' },
						h('h3', { className: 'bs-cardTitle' }, title),
						h('p', { className: 'bs-hint' }, translate(TIER_HINT_KEYS[tier]))),
					h('span', { className: 'bs-badge', 'data-active': current !== '' },
						current === '' ? translate('tierInherit') : (selected?.model ?? value.model))),
				h(Field, { id: 'bs-tier-' + tier + '-route', label: translate('route') },
					h(Select, {
						className: 'bs-select',
						id: 'bs-tier-' + tier + '-route',
						'aria-label': translate('tierRouteLabel', { tier: title }),
						value: current,
						disabled,
						// 换路由即清空 effort（旧值未必属于新模型）。
						onChange: (event) => onPatch({ ...parseRouteKey(event.target.value), reasoningEffort: '' }),
					}, routeOptions)),
				current === '' ? null : h(Field, { id: 'bs-tier-' + tier + '-effort', label: translate('effort'), hint: translate('effortHint') }, effort));
		}

		/**
		 * 本机代理卡：启用、默认模型、权限后果与模型列表都在明面；
		 * 折叠区只放真正需要专家的启动命令与 Codex 配置。
		 */
		function BackendCard({ spec, backend, disabled, capabilities, discovery, discoveryMatches, scopeActive, t: translate, onPatch, onModelPatch, onModelAdd, onModelRemove, onDiscover, onDiagnostics, generation }) {
			const title = spec.cli === 'codex' ? 'Codex' : 'Claude';
			const status = discovery[spec.cli];
			const profileNames = capabilities.status === 'ready' && Array.isArray(capabilities.value?.codexProfiles)
				? capabilities.value.codexProfiles.filter((name) => typeof name === 'string') : [];
			const modelIds = backend.models.map((model) => model.id.trim()).filter(Boolean);
			const permissionKeys = { 'read-only': 'permissionReadOnly', 'workspace-write': 'permissionWrite', 'danger-full-access': 'permissionFull',
				plan: 'permissionPlan', manual: 'permissionManual', dontAsk: 'permissionDontAsk', acceptEdits: 'permissionAcceptEdits', auto: 'permissionAuto', bypassPermissions: 'permissionBypass' };
			const elevated = ['danger-full-access', 'bypassPermissions'].includes(backend.permissionMode);
			const modelListRef = useRef(null);
			const focusNewModel = useRef(false);
			useEffect(() => {
				if (!focusNewModel.current) return;
				focusNewModel.current = false;
				const inputs = modelListRef.current?.querySelectorAll('input[data-model-id]');
				inputs?.[inputs.length - 1]?.focus?.();
			}, [backend.models.length]);
			const expertSummary = backend.profile
				? translate('expertCurrent', { executable: backend.executable, profile: backend.profile })
				: translate('expertDefault');
			return h('section', { className: 'bs-card', 'aria-label': title },
				h('div', { className: 'bs-cardHead' },
					h('h3', { className: 'bs-cardTitle' }, title),
					h(SwitchRow, { id: 'bs-' + spec.cli + '-enabled', label: translate('backendEnable'),
						checked: backend.enabled, disabled, onChange: (enabled) => onPatch({ enabled }) })),
				!backend.enabled ? h('p', { className: 'bs-hint' }, translate('backendOff')) : h('div', { className: 'bs-cardBody' },
					!scopeActive ? h('p', { className: 'bs-note', 'data-tone': 'warn' }, translate('scopeNone')) : null,
					h('div', { className: 'bs-fieldGrid' },
						h(Field, { id: 'bs-' + spec.cli + '-default-model', label: translate('defaultModelLabel') },
							h(Select, { className: 'bs-select', id: 'bs-' + spec.cli + '-default-model', value: backend.defaultModel,
								disabled: disabled || modelIds.length === 0, 'aria-invalid': !modelIds.includes(backend.defaultModel.trim()),
								onChange: (event) => onPatch({ defaultModel: event.target.value }) }, optionNodes(modelIds, backend.defaultModel, translate('defaultModelNone')))),
						h(Field, { id: 'bs-' + spec.cli + '-permission', label: translate('permissionLabel'), hint: translate('permissionHint') },
							h(Select, { className: 'bs-select', id: 'bs-' + spec.cli + '-permission', value: backend.permissionMode, disabled,
								onChange: (event) => onPatch({ permissionMode: event.target.value }) }, optionNodes(spec.permissions, backend.permissionMode)),
							h('p', { className: elevated ? 'bs-hint bs-hintWarn' : 'bs-hint' }, translate(permissionKeys[backend.permissionMode])))),
					h('div', { className: 'bs-modelsBlock' },
						h('div', { className: 'bs-cardHead' },
							h('h4', { className: 'bs-cardTitle' }, translate('modelsLabel')),
							h('div', { className: 'bs-actions' },
								h('button', { type: 'button', id: 'bs-' + spec.cli + '-discover', className: 'bs-button', 'data-variant': 'outline',
									disabled: disabled || !discoveryMatches || status?.status === 'loading', 'aria-busy': status?.status === 'loading', onClick: onDiscover },
									status?.status === 'loading' ? h('span', { className: 'bs-spinner', 'aria-hidden': true }) : null,
									status?.status === 'loading' ? translate('discovering') : translate('discover')),
								h('button', { type: 'button', id: 'bs-' + spec.cli + '-add-model', className: 'bs-button', 'data-variant': 'outline', disabled,
									onClick: () => { focusNewModel.current = true; onModelAdd(); } },
									h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'aria-hidden': true }, h('path', { d: 'M12 5v14M5 12h14' })), translate('modelAdd')),
								h('button', { type: 'button', className: 'bs-button', onClick: onDiagnostics }, translate('diagnosticsLink')))),
						h('p', { className: 'bs-hint' }, translate('modelsHint') + ' ' + translate('discoverHint')),
						!discoveryMatches ? h('p', { className: 'bs-hint' }, translate('saveBeforeDiscover')) : null,
						status?.text ? h('p', { className: 'bs-hint', role: status.status === 'error' ? 'alert' : 'status', 'data-tone': status.status === 'error' ? 'error' : 'ok' }, status.text) : null,
						backend.models.length === 0
							? h('div', { className: 'bs-empty', id: 'bs-' + spec.cli + '-models-empty' }, h('p', { className: 'bs-hint' }, translate('modelsEmpty')))
							: h('div', { className: 'bs-models', id: 'bs-' + spec.cli + '-models', ref: modelListRef },
								h('div', { className: 'bs-modelHead', 'aria-hidden': true }, h('span', null, translate('modelIdPlaceholder')), h('span', null, translate('effort')), h('span', null, translate('modelDefaultEffort')), h('span')),
								backend.models.map((model, index) => h(ModelRow, { key: generation + ':' + index, model, index, disabled,
									requiredDefault: model.id.trim() === backend.defaultModel.trim(), t: translate,
									onPatch: (patch) => onModelPatch(index, patch), onRemove: () => onModelRemove(index) })))),
					h(Advanced, { label: translate('expertSettings'), summary: expertSummary },
						h(Field, { id: 'bs-' + spec.cli + '-executable', label: translate('executableLabel'), hint: translate('executableHint') },
							h('input', { className: 'bs-input bs-mono', type: 'text', id: 'bs-' + spec.cli + '-executable',
								value: backend.executable, placeholder: spec.executable, spellCheck: false, autoComplete: 'off', disabled,
								onChange: (event) => onPatch({ executable: event.target.value }) })),
						spec.profile ? h(Field, { id: 'bs-' + spec.cli + '-profile', label: translate('profileLabel'), hint: translate('profileHint') },
							h('input', { className: 'bs-input bs-mono', id: 'bs-' + spec.cli + '-profile', value: backend.profile,
								placeholder: translate('profileNone'), autoComplete: 'off', spellCheck: false, disabled, onChange: (event) => onPatch({ profile: event.target.value }) }),
							h('div', { className: 'bs-profileChoices', id: 'bs-' + spec.cli + '-profiles' }, profileNames.map((profile) => h('button', {
								key: profile, type: 'button', className: 'bs-button bs-mono', disabled, 'aria-label': translate('profileChoose', { profile }),
								'aria-pressed': backend.profile === profile, onClick: () => onPatch({ profile }),
							}, profile)))) : null)));
		}

		/** 行配置页面主体。 */
		function BetterSubagentConfigPage({ form, t: translate }) {
			const state = form?.state;
			const revision = state?.revision;
			const capabilities = useEndpoint(CAPABILITIES_URL, revision);
			const routesState = useEndpoint(ROUTES_URL, revision);
			const allowed = routesOf(routesState);
			const [draft, setDraft] = useState(null);
			const [generation, setGeneration] = useState(0);
			const [busy, setBusy] = useState(false);
			const [notice, setNotice] = useState(null);
			const [discardFor, setDiscardFor] = useState(null);
			useEffect(() => {
				if (notice?.tone !== 'ok') return;
				const timer = setTimeout(() => setNotice(null), 4000);
				return () => clearTimeout(timer);
			}, [notice]);
			/** 每个后端的发现状态：`{ status: 'loading' | 'ok' | 'error', text? }`。 */
			const [discovery, setDiscovery] = useState({});
			const [tab, setTab] = useState('general');
			const [backendTab, setBackendTab] = useState('codex');
			const navigationTabs = useRef({});
			const latest = useRef(null);
			const requests = useRef({});

			const host = state?.status === 'ready' ? shape(state.value) : null;
			const live = draft !== null && draft.revision === revision ? draft.value : host;
			latest.current = { revision, generation, backends: live?.subagents };
			const writable = state?.status === 'ready' && state?.writable === true && state?.mode !== 'memory';
			const dirty = live !== null && host !== null && JSON.stringify(live) !== JSON.stringify(host);
			const invalid = live === null ? null : validate(live, allowed);
			const changeCount = dirty ? diffOps(host, live).length : 0;
			const dirtyKey = JSON.stringify(live);

			if (state === undefined) {
				// 官方页面在镜像读到该命名空间前不传 form：这是正常加载窗口，
				// 长期停在这里才说明本部署缺少 settings/config-editor。
				return h('div', { className: 'bs-cfg' },
					h('p', { className: 'bs-note bs-pulse', role: 'status' }, translate('waitingForm')),
					h('p', { className: 'bs-hint' }, translate('noFormHint')));
			}
			if (state.status === 'loading') {
				return h('div', { className: 'bs-cfg' },
					h('p', { className: 'bs-note bs-pulse', role: 'status' }, translate('loading')));
			}
			if (host === null) {
				return h('div', { className: 'bs-cfg' },
					h('p', { className: 'bs-note', 'data-tone': 'warn' }, translate('unavailable')));
			}

			/** 记一次草稿修改（函数式叠加：连续编辑不丢改动；换 revision 即失效）。 */
			const edit = (mutate) => {
				setDiscardFor(null);
				setDraft((previous) => {
					const base = previous !== null && previous.revision === revision ? previous.value : live;
					return { revision, value: mutate(base) };
				});
				setNotice(null);
			};
			const patchTier = (tier, patch) => edit((current) => ({
				...current,
				tiers: { ...current.tiers, [tier]: { ...current.tiers[tier], ...patch } },
			}));
			const patchBackend = (spec, patch) => edit((current) => ({
				...current,
				subagents: {
					...current.subagents,
					[spec.cli]: { ...current.subagents[spec.cli], ...patch },
				},
			}));
			/** 按 index 做函数式补丁：不依赖触发那一帧的数组快照。 */
			const patchModel = (spec, index, patch) => edit((current) => {
				const backend = current.subagents[spec.cli];
				const models = backend.models.map((model, at) => (at === index ? { ...model, ...patch } : model));
				const renamedDefault = patch.id !== undefined && backend.models[index].id.trim() === backend.defaultModel.trim();
				const defaultModel = renamedDefault ? patch.id.trim() : backend.defaultModel;
				return { ...current, subagents: { ...current.subagents, [spec.cli]: { ...backend, models, defaultModel } } };
			});
			const addModel = (spec) => edit((current) => {
				const backend = current.subagents[spec.cli];
				return {
					...current,
					subagents: {
						...current.subagents,
						[spec.cli]: { ...backend, models: [...backend.models, { id: '', efforts: [], defaultEffort: '' }] },
					},
				};
			});
			const removeModel = (spec, index) => edit((current) => {
				const backend = current.subagents[spec.cli];
				return {
					...current,
					subagents: {
						...current.subagents,
						[spec.cli]: { ...backend,
							models: backend.models.filter((model, at) => at !== index),
							defaultModel: backend.models[index].id.trim() === backend.defaultModel.trim() ? '' : backend.defaultModel,
						},
					},
				};
			});
			/** 发现失败原因：只认宿主给的 error.code，不回显可能含凭据的细节。 */
			const discoveryReason = (error) => {
				const key = DISCOVERY_REASON_KEYS[String(error?.code ?? '')];
				if (key === undefined) return translate('discoverUnknown');
				return translate(key, { status: String(error?.status ?? '') });
			};
			/** 拉取发现结果并并入草稿：保留已有条目，只追加新 id。 */
			const discoverModels = async (spec) => {
				if (discovery[spec.cli]?.status === 'loading' || !writable || busy) return;
				const backend = live.subagents[spec.cli];
				const request = { revision, generation, executable: backend.executable, profile: backend.profile };
				requests.current[spec.cli] = request;
				const stale = () => latest.current.revision !== request.revision || latest.current.generation !== request.generation
					|| latest.current.backends?.[spec.cli].executable !== request.executable
					|| latest.current.backends?.[spec.cli].profile !== request.profile;
				setDiscovery((previous) => ({ ...previous, [spec.cli]: { status: 'loading' } }));
				try {
					const response = await fetch(MODELS_URL + '?cli=' + encodeURIComponent(spec.cli));
					const body = await response.json().catch(() => undefined);
					if (requests.current[spec.cli] !== request || stale()) return;
					if (!response.ok || body?.ok !== true) throw new Error('HTTP ' + String(response.status));
					const value = isRecord(body.value) ? body.value : {};
					const found = modelList(value.models).filter((model) => model.id.trim() !== '');
					if (found.length === 0) {
						setDiscovery((previous) => ({
							...previous,
							[spec.cli]: {
								status: 'error',
								text: translate('discoverFailed', { reason: discoveryReason(value.error) }),
							},
						}));
						return;
					}
					const known = new Set(live.subagents[spec.cli].models
						.map((model) => model.id.trim()).filter((id) => id !== ''));
					const added = found.filter((model) => !known.has(model.id)).length;
					edit((current) => {
						const backend = current.subagents[spec.cli];
						const existing = new Set(backend.models
							.map((model) => model.id.trim()).filter((id) => id !== ''));
						const models = [...backend.models];
						for (const model of found) {
							if (existing.has(model.id)) continue;
							existing.add(model.id);
							models.push(model);
						}
						const defaultModel = backend.defaultModel.trim() !== '' ? backend.defaultModel : (models[0]?.id ?? '');
						return {
							...current,
							subagents: {
								...current.subagents,
								[spec.cli]: { ...backend, models, defaultModel },
							},
						};
					});
					setDiscovery((previous) => ({
						...previous,
						[spec.cli]: {
							status: 'ok',
							text: translate('discoverDone', { count: found.length, added }),
						},
					}));
				} catch (error) {
					if (requests.current[spec.cli] !== request || stale()) return;
					setDiscovery((previous) => ({
						...previous,
						[spec.cli]: {
							status: 'error',
							text: translate('discoverFailed', { reason: String(error?.message ?? error) }),
						},
					}));
				} finally {
					if (requests.current[spec.cli] === request && stale()) {
						setDiscovery((previous) => ({ ...previous, [spec.cli]: undefined }));
					}
				}
			};
			const save = async () => {
				if (busy || !dirty || invalid !== null || !writable) return;
				const ops = diffOps(host, live);
				if (ops.length === 0) return;
				setBusy(true);
				setNotice(null);
				try {
					const accepted = await form.mutate(ops, revision);
					if (accepted) {
						// 草稿保留：mirror 折叠后 revision 前进、草稿自动失效（避免回显旧值闪烁）。
						setNotice({ tone: 'ok', text: translate('saved') });
						navigationTabs.current[tab]?.focus();
					} else {
						setDraft(null);
						setGeneration((value) => value + 1);
						setNotice({ tone: 'warn', text: translate('conflict') });
					}
				} catch (error) {
					setNotice({ tone: 'error', text: translate('saveFailed') + String(error?.message ?? error) });
				} finally {
					setBusy(false);
				}
			};
			const reset = () => {
				if (changeCount > 3 && discardFor !== dirtyKey) { setDiscardFor(dirtyKey); return; }
				setDiscardFor(null);
				navigationTabs.current[tab]?.focus();
				requests.current = {};
				setDiscovery({});
				setDraft(null);
				setGeneration((value) => value + 1);
				setNotice(null);
			};

			const scopeActive = live.subagents.eng || live.subagents.global;
			const navigate = (next, cli) => {
				setTab(next); if (cli) setBackendTab(cli);
				navigationTabs.current[next]?.focus();
			};
			const invalidTab = invalid?.titleKey?.startsWith('tier') ? 'tiers' : invalid?.titleKey ? 'cli' : 'connection';
			const status = notice !== null
				? h('span', { className: 'bs-status', 'data-tone': notice.tone, role: notice.tone === 'error' ? 'alert' : 'status' }, notice.text)
				: invalid !== null
					? h('span', { className: 'bs-status', role: 'alert' }, h('button', { type: 'button', className: 'bs-button bs-errorLink',
						onClick: () => navigate(invalidTab, invalid.titleKey === 'claudeTitle' ? 'claude' : 'codex') },
						translate(invalid.key, { backend: invalid.titleKey ? translate(invalid.titleKey) : '' })))
					: null;
			const panelProps = (name) => ({ id: 'bs-settings-panel-' + name, className: 'bs-tabpanel', role: 'tabpanel',
				'aria-labelledby': 'bs-settings-tab-' + name, tabIndex: 0, hidden: tab !== name });
			return h('div', { className: 'bs-cfg', 'data-settings-dirty': dirty, 'data-settings-busy': busy },
				h('div', { className: 'bs-header' },
					h('div', { className: 'bs-headerMain' },
						h('h2', { className: 'bs-title' }, translate('title')),
						h('span', { className: 'bs-headerIntro' }, translate('intro'))),
					h('div', { className: 'bs-headerMeta' },
						dirty ? h('span', { className: 'bs-badge' }, translate('draftPreview')) : null,
						writable ? null : h('span', { className: 'bs-badge', role: 'status', title: translate('readonly') }, translate('readonlyShort')))),
				h(Tabs, { id: 'bs-settings', label: translate('title'), value: tab, onChange: setTab, tabRefs: navigationTabs, items: [
					{ id: 'general', label: translate('tabGeneral') }, { id: 'cli', label: translate('tabCli') },
					{ id: 'tiers', label: translate('tabTiers') }, { id: 'connection', label: translate('tabConnection') }] }),
				h('div', panelProps('general'),
					h('section', { className: 'bs-section', 'aria-label': translate('routingTitle') },
						h('div', { className: 'bs-sectionHead' }, h('h3', { className: 'bs-sectionTitle' }, translate('routingTitle'))),
						h('p', { className: 'bs-hint' }, translate('modelRecommendations')),
						h('div', { className: 'bs-routingDiagram', 'data-routing': 'main-agent' },
							h('div', { className: 'bs-routingSource', id: 'bs-routing-source' },
								h('span', { className: 'bs-routingSourceLabel' }, translate('mainAgent')),
								h('span', { className: 'bs-hint' }, translate('mainAgentNote'))),
							...TIERS.map((tier) => {
								const value = live.tiers[tier];
								const current = routeKey(value);
								const title = translate(TIER_TITLE_KEYS[tier]);
								return h('div', { key: tier, className: 'bs-routing' },
									h('span', { className: 'bs-routingBranchGlyph', 'aria-hidden': true }, '↳'),
									h('div', { className: 'bs-overviewName' },
										h('span', { className: 'bs-routingLabel' }, title),
										h('span', { className: 'bs-overviewMeta' }, translate(TIER_HINT_KEYS[tier]))),
									h('span', { className: 'bs-routingModel bs-mono' }, current === '' ? translate('tierInherit') : current),
									h('button', { type: 'button', id: 'bs-tier-' + tier + '-change', className: 'bs-button', 'data-variant': 'outline',
										'data-tier-change': tier, onClick: () => navigate('tiers') },
										translate(current === '' ? 'chooseModel' : 'changeModel')));
							})),
						h('p', { className: 'bs-hint bs-routingNote' }, translate('routingNote'))),
					h('section', { className: 'bs-section' },
						h('div', { className: 'bs-sectionHead' }, h('h3', { className: 'bs-sectionTitle' }, translate('backendsTitle'))),
						h('p', { className: 'bs-hint' }, translate('backendsIntro')),
						h('div', { className: 'bs-overview' }, BACKENDS.map((spec) => {
							const backend = live.subagents[spec.cli];
							const title = spec.cli === 'codex' ? 'Codex' : 'Claude';
							return h('button', { key: spec.cli, type: 'button', id: 'bs-open-' + spec.cli, className: 'bs-overviewRow',
								'aria-label': translate('configureBackend', { backend: title }), onClick: () => navigate('cli', spec.cli) },
								h('span', { className: 'bs-overviewGlyph', 'aria-hidden': true }, h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M4 5h16v14H4Zm4 5 2 2-2 2m5 0h3' }))),
								h('span', { className: 'bs-overviewName' }, h('span', null, title),
									h('span', { className: 'bs-overviewMeta bs-mono' }, backend.enabled ? (translate('modelCount', { count: backend.models.length }) + (backend.defaultModel ? ' · ' + backend.defaultModel : '')) : '')),
								h('span', { className: 'bs-badge', 'data-active': backend.enabled && scopeActive }, h('span', { className: 'bs-dot', 'data-active': backend.enabled && scopeActive, 'aria-hidden': true }),
									translate(!backend.enabled ? 'inactive' : !scopeActive ? 'scopeInactive' : 'configured')), h(Chevron));
						})))),
				h('div', panelProps('cli'),
					h(Tabs, { id: 'bs-backend', label: translate('tabCli'), compact: true, value: backendTab, onChange: setBackendTab,
						items: BACKENDS.map((spec) => ({ id: spec.cli, label: spec.cli === 'codex' ? 'Codex' : 'Claude', active: live.subagents[spec.cli].enabled && scopeActive })) }),
					...BACKENDS.map((spec) => h('div', { key: spec.cli, id: 'bs-backend-panel-' + spec.cli, role: 'tabpanel',
						'aria-labelledby': 'bs-backend-tab-' + spec.cli, tabIndex: 0, hidden: backendTab !== spec.cli },
						h(BackendCard, { spec, backend: live.subagents[spec.cli], disabled: !writable || busy, capabilities, discovery,
							discoveryMatches: live.subagents[spec.cli].executable === host.subagents[spec.cli].executable && live.subagents[spec.cli].profile === host.subagents[spec.cli].profile,
							scopeActive, t: translate, generation, onPatch: (patch) => patchBackend(spec, patch), onModelPatch: (index, patch) => patchModel(spec, index, patch),
							onModelAdd: () => addModel(spec), onModelRemove: (index) => removeModel(spec, index), onDiscover: () => discoverModels(spec), onDiagnostics: () => navigate('connection') })))),
				h('div', panelProps('tiers'),
					h('section', { className: 'bs-section' },
						h('div', { className: 'bs-sectionHead' }, h('h3', { className: 'bs-sectionTitle' }, translate('tiersTitle'))),
						h('p', { className: 'bs-hint' }, translate('tiersIntro')),
						routesState.status === 'loading' ? h('p', { className: 'bs-hint', role: 'status' }, translate('routesLoading'))
							: allowed === null ? h('p', { className: 'bs-note', 'data-tone': 'warn' }, translate('routesError'))
								: !allowed.enabled || allowed.routes.length === 0 ? h('p', { className: 'bs-note', 'data-tone': 'warn' }, translate('tiersInactive')) : null,
						h('div', { className: 'bs-tierGrid' }, ...TIERS.map((tier) => h(TierRow, { key: tier, tier, value: live.tiers[tier], allowed, disabled: !writable || busy,
							t: translate, onPatch: (patch) => patchTier(tier, patch) }))))),
				h('div', panelProps('connection'),
					h('section', { className: 'bs-section' },
						h('div', { className: 'bs-sectionHead' }, h('h3', { className: 'bs-sectionTitle' }, translate('scopeTitle'))),
						h(SwitchRow, { id: 'bs-scope-eng', label: live.subagents.global ? translate('scopeEngIncluded') : translate('scopeEng'),
							hint: live.subagents.global ? translate('globalOverrides') : translate('scopeEngHint'),
							checked: live.subagents.global ? true : live.subagents.eng, disabled: !writable || busy || live.subagents.global,
							onChange: (eng) => edit((current) => ({ ...current, subagents: { ...current.subagents, eng } })) }),
						h(SwitchRow, { id: 'bs-scope-global', label: translate('scopeGlobal'), hint: translate('scopeGlobalHint'), checked: live.subagents.global,
							disabled: !writable || busy, onChange: (global) => edit((current) => ({ ...current, subagents: { ...current.subagents, global } })) }),
						!scopeActive ? h('p', { className: 'bs-note', 'data-tone': 'warn' }, translate('scopeNone')) : null),
					h('section', { className: 'bs-section' },
						h('div', { className: 'bs-sectionHead' }, h('h3', { className: 'bs-sectionTitle' }, translate('behaviorTitle'))),
						h(SwitchRow, { id: 'bs-delegation-prompt', label: translate('delegationPromptLabel'), hint: translate('delegationPromptHint'),
							checked: live.delegationPrompt, disabled: !writable || busy, onChange: (delegationPrompt) => edit((current) => ({ ...current, delegationPrompt })) }),
						h(SwitchRow, { id: 'bs-child-exit-guard', label: translate('childExitGuardLabel'), hint: translate('childExitGuardHint'),
							checked: live.childExitGuard, disabled: !writable || busy, onChange: (childExitGuard) => edit((current) => ({ ...current, childExitGuard })) })),
					h('section', { className: 'bs-section', 'aria-label': translate('readonlyDiagnostics') },
						h('div', { className: 'bs-sectionHead' }, h('h3', { className: 'bs-sectionTitle' }, translate('readonlyDiagnostics')),
							h('button', { type: 'button', id: 'bs-refresh', className: 'bs-button', 'data-variant': 'outline',
								disabled: capabilities.status === 'loading' || routesState.status === 'loading', 'aria-busy': capabilities.status === 'loading' || routesState.status === 'loading',
								onClick: () => { capabilities.reload(); routesState.reload(); } }, translate('refresh'))),
						h('div', { className: 'bs-metricGrid' },
							h('div', { className: 'bs-metric' }, h('span', { className: 'bs-metricLabel' }, translate('connectionMode')),
								h('span', { className: 'bs-metricValue' }, translate(writable ? 'connectionWritable' : 'connectionReadonly'))),
							h('div', { className: 'bs-metric' }, h('span', { className: 'bs-metricLabel' }, translate('capabilitiesLabel')),
								h('span', { className: 'bs-metricValue', role: 'status' }, capabilities.status === 'ready' ? translate('ready') : capabilities.status === 'loading' ? translate('loading') : translate('failed'))),
							h('div', { className: 'bs-metric' }, h('span', { className: 'bs-metricLabel' }, translate('routesLabel')),
								h('span', { className: 'bs-metricValue', role: 'status' }, routesState.status === 'loading' ? translate('loading')
									: allowed === null ? translate('failed') : !allowed.enabled ? translate('inactive') : translate('modelCount', { count: allowed.routes.length })))),
						...BACKENDS.map((spec) => h('div', { key: spec.cli, className: 'bs-connectionRow', 'data-backend': spec.cli },
							h('span', null, spec.cli === 'codex' ? 'Codex' : 'Claude'),
							h('p', { className: 'bs-hint bs-mono', role: 'status' }, detectionOf(capabilities, spec, host.subagents[spec.cli], translate))))),
					h('section', { className: 'bs-section' },
						h(Advanced, { label: translate('trustedHostsAdvanced'), summary: live.trustedHosts.length ? translate('trustedCount', { count: live.trustedHosts.length }) : translate('trustedDefault') },
							h(Field, { id: 'bs-trusted-hosts', label: translate('trustedHostsLabel'), hint: translate('trustedHostsHint') },
								h(HostList, { key: generation, hosts: live.trustedHosts, disabled: !writable || busy, t: translate,
									onChange: (trustedHosts) => edit((current) => ({ ...current, trustedHosts })) }))))),
				notice !== null || invalid !== null ? h('div', { className: 'bs-feedback' }, status) : null,
				dirty ? h('div', { className: 'bs-footer' },
					h('span', { className: 'bs-status' }, translate('changeCount', { count: changeCount })),
					h('button', { type: 'button', className: 'bs-button', 'data-variant': 'outline', disabled: busy, onClick: reset },
						translate(discardFor === dirtyKey ? 'resetConfirm' : 'reset')),
					h('button', { type: 'button', className: 'bs-button', 'data-variant': 'primary', disabled: !writable || busy || invalid !== null,
						'aria-busy': busy, onClick: () => void save() }, busy ? h('span', { className: 'bs-spinner', 'aria-hidden': true }) : null,
						busy ? translate('saving') : translate('save'))) : null);
		}

		/**
		 * 行配置入口：`summary` 只回一行描述；`page` 渲染样式表 + 表单主体。
		 * 样式随组件树内的 <style> 挂载一次（不写 DOM，重复渲染不重复注入）。
		 */
		function BetterSubagentPanel(props) {
			if (props.view === 'summary') return h('span', null, t('summary'));
			return h('div', { className: 'bs-root' },
				h('style', { 'data-plugin-css': STYLE_ID }, CSS),
				h(BetterSubagentConfigPage, { form: props.form, t: props.t ?? t }));
		}

		const inject = ['slots', 'locale'];

		function apply(ctx) {
			try {
				const dispose = ctx.locale.register(NS, { zh, en });
				t = ctx.locale.bind(NS);
				ctx.effect(() => dispose, '@oh-my-dsh/dsh-better-subagent: dictionaries');
			} catch {
				// locale 服务缺失时保持中文默认。
			}
			ctx.effect(() => ctx.slots.inject('plugins.row.config', () => {
				const disposers = [];
				for (const key of ROW_KEYS) {
					try {
						const dispose = ctx.slots.register({
							name: 'plugins.row.config',
							key,
							locale: NS,
						}, BetterSubagentPanel);
						if (typeof dispose === 'function') disposers.push(dispose);
					} catch {
						// 一个键被槽账本拒绝时，另一个键仍应注册。
					}
				}
				return () => {
					for (const dispose of disposers) dispose();
				};
			}), '@oh-my-dsh/dsh-better-subagent: row config page');
		}

		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
