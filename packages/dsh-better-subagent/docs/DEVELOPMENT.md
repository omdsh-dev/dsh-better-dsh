# dsh-better-subagent 开发说明

本文件面向维护者：说明插件在 DSH 宿主里的装配方式、与 Better DSH / Apollo 的兼容契约、文件职责、验证命令与已知边界。

## 1. 包形态

- 纯 ESM、无构建步骤；宿主入口 `src/index.js`，浏览器入口 `src/client.js`。
- `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`；`dsh.client.platform = "web"`。
- `files` 白名单：`src`、`docs`、`cordis.patch.yml`、`README.md`、`LICENSE`、`third-party`。测试、脚本、设计 Spec、凭据、临时 profile 都不进发布包。
- 依赖：运行时只直接 import `@deepseek-ai/schemastery`；其余 DSH 包是精确 peer（`0.2.2-rc.2`），由宿主运行环境提供，服务全部经 `ctx` 获取。
- 浏览器半边只 `require('react')`，不 import 任何 DSH client 包；样式全部使用宿主主题 token（`--dsw-alias-*`），不写 DOM。

## 2. 宿主行与配置

`cordis.patch.yml` 只插入一行：

```yaml
- insert:
    - id: dsh-better-subagent
      name: '@oh-my-dsh/dsh-better-subagent'
```

- 行 `name` 必须是 scoped npm 名：Loader 把它当模块 specifier 解析，`dsh-client-modules` 还要求 manifest 的 `name` 与行完全一致才能发现 `./client`。
- 不允许再插入 agent preset 行；本插件不提供 preset。
- 行 `Config` 在 `src/config.js`，由 `src/index.js` 重新导出。全部字段 volatile：`childExitGuard`、`delegation.prompt`、`tiers.fast/quality`、`subagents.eng/global`、`subagents.codex.*`、`subagents.claude.*`、`trustedHosts`（信任边界按请求重读活配置，保存即生效不重挂）。
- `delegation.prompt`（默认 `true`）只决定 `better-subagent:delegation` 提示词段是否渲染，**对所有预设生效**；`subagents.eng/global` 只管 CLI 后端路由与 CLI 目录段。两者互不影响：把 CLI 范围全关掉，委派纪律照样渲染。
- `normalizeConfig` 会把任意来源（volatile 引用、旧 JSON、残缺对象）规整成精确默认形状；非法值回退默认、绝不抛错。`currentConfig(ctx, fallback)` 经 `configEditor` 找**活**行配置；找不到时回退 `fallback`。
- **命名**：S1 Spec 的 unscoped 名 `dsh-better-subagent` 已被他人占用，现使用 scoped 包名 `@oh-my-dsh/dsh-better-subagent`；行 id 仍是 `dsh-better-subagent`，行 name 与 client closure id 必须是 scoped 包名，短键 `dsh-better-subagent#dsh-better-subagent` 只作兼容别名保留。旧 `@menghuan1918/dsh-better-subagent` 作为 legacy 键保留。
- 行配置键（浏览器半边 `plugins.row.config`）六份，全部指向同一行：
  - `@oh-my-dsh/dsh-better-subagent#dsh-better-subagent`
  - `dsh-better-dsh#dsh-better-subagent`
  - `@menghuan1918/dsh-better-subagent#dsh-better-subagent`
  - `@menghuan1918/dsh-apollo#dsh-better-subagent`
  - `dsh-apollo#dsh-better-subagent`
  - `dsh-better-subagent#dsh-better-subagent`

## 3. 装配

`src/index.js` 的 `apply(ctx, config)` 依次调用：

| 模块 | 装配内容 | 需要的服务 |
|---|---|---|
| `mountSettings` | `/better-subagent/api/*` 路由（+ `/apollo/api/*` 读别名）、行配置页面策略 | `webServer`、`settings` |
| `mountSubagents` | Codex/Claude llm adapter、`subagent` 路由桥、身份 KV | `tools`、`subagents`、`agents`、`llm`、`storage`、`subprocess`、`workingDirectory` |
| `mountWaitSubagent` | 宿主工具 `wait_subagent` | `tools`、`subagents`、`agents`、`sessionQuery` |
| `mountChildExitGuard` | `agent/turn-stopping` 上的运行中子代理拦截 | `subagents`、`agents` |
| `mountPrompt` | `agent/created` 时给该 Agent 的 `agent.ctx.systemPrompt` 注册三个 section | `systemPrompt`、`agents` |

所有 `ctx.inject` 都是延迟的：headless 组合缺少 `webServer` 时只有设置路由跳过，其余照常工作；缺少 CLI 所需服务时只有 CLI 桥不挂载。

## 4. CLI 桥（`src/subagents.js` + `src/cli-adapter.js` + `src/cli/*`）

- 不注册第二个 spawn/fork registry；CLI 子代理仍是原生 `subagents.startActivation({provider:'spawn', childId, parent, prompt, ...})`，只是 `agentOptions.provider` 是内部 synthetic route。rc.2 的 spec 是扁平对象，返回 `{childId, name}`；工具结果只回传 `{kind:'activation', name}`。
- 内部 route 历史固定为 `apollo-cli-codex` / `apollo-cli-claude`；不要为新包名重命名，否则旧会话不可续接。
- 拦截点：
  - `ctx.tools.guard`：内部 route 保留、禁用范围明确拒绝、fork 拒绝；
  - `ctx.tools.execute`：`subagent` + `provider=codex|claude` 短路创建；`list_subagent_models` 合并 CLI 目录；
  - `ctx.on('tools/result')`：未被调用方接受的 child 回收（drain + 删 KV）。
- 创建流程：模型/effort 白名单校验 → 父当前目录解析（`workingDirectory.ensure`）→ `resolveExecutable` 预检 → `<executable> --version` 版本预检（`src/cli/version.js`：Codex 基线 `0.162.1`，Claude 基线 `2.1.300`；无法执行/无法识别/过旧都给出点名可执行文件与安装/升级方式的可操作错误）→ 先落 KV 再 `startActivation` → 已发布 activation 在失败/取消时 `dispose()`，再删记录；预发布失败由 rc.2 manager 回滚。`ctx.cliVersionProbe` 是测试 seam；真实运行时用 `execFile`，无 shell。
- 每个 adapter：一轮一个子进程；`delivered` 在 spawn 前落 KV；`remoteId` 第一行事件即落盘；`parse` 失败/非零退出/缺完成标志都抛错且不自动重试；`dispose()` 等待进程句柄退出。没有 `subprocess` 服务或 spawn 未发布时回滚 `started/delivered`。
- 身份 KV（`src/cli-sessions.js`）：命名空间前缀 `apollo_cli_` + `sha256(profile.dir)[:16]`，version 1，`sessions` 表，`per-record`。**包名变化不重命名/复制/清空**。
- 权限/模型/effort 与父子归属在启动前失败；缺 CLI 或版本不兼容给可操作诊断，不回退到另一后端。

## 5. wait_subagent 的跨回合判定（`src/wait-subagent.js`）

旧实现的缺陷：`settled` 只按 childId 缓存 `subagent/end`，当同一 child 被续接（新 activation 或 resident 新回合）时会把旧 end 当成本轮完成。

参数先经 `ctx.subagents.resolveName(parent, ref, signal)` 解析：rc.2 的 `list_agents` 和原生 `subagent` 结果都以树内名字为句柄，单个无法匹配的 token 仍按 durable id 处理。解析后再校验是否为当前 Agent 的直接子代理，输出行回显调用方给的名字。

现实现只依据宿主可证明的事实：

1. 监听 `subagent/start` / `subagent/end`，记录每个 child 最近的 activation `runId`；
2. `status === 'running'` → 继续等待；
3. 匹配 end：最近一次 end 的 runId 与最近一次 start 相同（或挂载后只见到 end）。不匹配（新 activation）→ 继续等；
4. 匹配 end 后再读 durable 日志（`ctx.sessionQuery.observeSession(childId)`）：只 fold `inheritedEventCount` 之后的**子代理自有**事件（fork 前缀的父 turn/end、splice 不属于该 child）；
5. fold `agent/inbox/spliced` 的 `inserted`/`removedCount`/`outcome:'canceled'`，按 target（`next-turn`/`next-step`）维护队列长度：turn claim（`removedCount` 无 outcome）与取消删除都会清掉排队计数；`pending = nextTurn + nextStep > 0`；
6. 匹配 end + `pending > 0` → 继续等（resident idle child 收到新输入时没有新 `subagent/start`，这是唯一的当前回合证明）；`pending === 0` → done；
7. durable 不可读：只有原生 `subagent/end.local === false` 的 external provider 可用匹配的 start/end 对 settle；本地 child（即使已不在 registry）仍返回 `could not be confirmed`，不把不可读会话伪报成功；
8. 无 end 时：`pending > 0` 继续等；不在 registry 且自有日志有 `turn/end` → “已在此次等待前结束”的说明（不是旧 done）；30s 启动宽限后仍无法证明 → not-started/不可确认行。

`observeSession` 是异步边界：读取返回后必须重新检查 live running，并确认 start/end 记录仍是读取前的同一代（事件每次替换记录对象，即使 runId 相同也能识别新的 end）。跨代读取不参与完成判断，由现有 250ms poller 重读；不立即循环重试。否则新回合在读取期间 claim 掉 pending 后，会被旧 end 误判为 done。

输出行保持旧契约：done/timeout/aborted/not-started/不可确认；正文交给框架 settlement notice，工具不碰父代理 inbox。

回归测试：`tests/wait-subagent.test.mjs` 构造「旧 end → 新 start + 排队 idle → running → 新 end」与「同一 run 内 turn 结束后又有 splice」；另通过真实 `installWaitTool` 注册 seam 的 deferred `observeSession`，覆盖读取挂起期间的新 activation / 无新 start 的 resident running + claim，以及 start/end 换代后 idle 的旧日志快照。

## 6. 子代理退出守卫（`src/child-exit-guard.js`）

- 只由 volatile `childExitGuard`（默认 false）控制；
- 只听 `agent/turn-stopping`，只收集 `subagents.listDescendants(agent.id)` 中 `depth === 1` 且 **live status === running** 的直接子代理；
- 只做一次 `agent.steer(buildChildGuardMessage(children))`；
- 查询/注入异常 → 告警并放行（fail open）；`payload.signal.aborted` 直接返回；
- 不看 jobs、不 import Apollo、不扩大权限。

## 7. 提示词（`src/prompt.js`）

在 `agent/created` 时向该 Agent 的 `agent.ctx.systemPrompt` 注册（effect 随 Agent 释放）：

| 名称 | order | 出现条件 | 内容 |
|---|---|---|---|
| `better-subagent:delegation` | 60 | `delegation.prompt` | 委派纪律（含等待纪律）+ fast/quality 分档；preset 以 `ptc` 结尾时追加 run_code fanout 规则 |
| `better-subagent:child-guard` | 70 | `childExitGuard` | 运行中子代理退出守卫措辞 |
| `better-subagent:cli-subagents` | 80 | 路由范围 + 至少一个后端 enabled | 旧 CLI 目录内容（provider、后台、send_message/wait_subagent/list_agents/interrupt_agent、模型/effort 目录） |

preset 解析优先 `agentPresets.composedPreset(agent.ctx)`，回退 `sessionProjections`/session header；文本是函数，按活配置每次请求渲染。Apollo 的 PRINCIPLES、工作流 skills、job/general guard 文本不在此处。

## 8. 只读 API（`src/panel.js` + `src/settings.js`）

- `registerCapabilitiesRoute` 一次注册两个 prefix：`/better-subagent/api` 与 `/apollo/api`，共享同一 handler；`settings.js` 只注册一次。
- 路由：`/capabilities`、`/models?cli=codex|claude`、`/routes`；GET only；未知路径 404；非 GET 405；不读请求体。
- 信任边界：loopback 或 `trustedHosts`；拒绝跨站 `Sec-Fetch-Site` 与异源 Origin。`trustedHosts` 每请求读活配置。
- 能力探针：30s 有界缓存 + 并发去重。发现：Codex `codex debug models`（失败回退 `--bundled`）；Claude 读 `ANTHROPIC_BASE_URL`/凭据并请求 `/v1/models`。发现只在显式调用时触发（不做后台缓存/重探）；响应不回凭据，只回可执行文件路径/版本、profile 名、模型 id/effort。
- `trustedHosts` 只约束本插件的读接口，不改变宿主设置镜像的可写性。

## 9. 客户端设置页（`src/client.js`）

- `window.__ModuleLoader__.load({id:'@oh-my-dsh/dsh-better-subagent', factory})`；只 require React。
- 使用 `form.state`（`{status, value, revision, writable, mode}`）与 `form.mutate(ops, revision)`；只在保存时提交与宿主快照的差异 `set` ops。
- 可写字段只包含 volatile 路径；`writable === false` / `mode === 'memory'` 禁用配置写入控件，保留页签导航与只读探测刷新；冲突（mutate 返回 false）回退宿主值并提示；异常保留草稿。
- 六份 `plugins.row.config` 键注册同一个组件；locale 命名空间 `better-subagent`（zh/en 字典键一致）。
- 表单分为概览、CLI（Codex / Claude）、模型分档、连接；覆盖 scope（eng/global）、fast/quality（路由 + effort）、两个后端（enabled/executable/profile/permission/defaultModel/models + 自动发现）、delegationPrompt、childExitGuard 与 trustedHosts。页签支持方向键 / Home / End，切换保留草稿和未输入完的 effort 文本。说明使用标签旁的原生信息折叠控件，保留 aria-describedby 与控件关联。
- 依赖：重命名默认模型会同步默认选择，删除时清空；effort 列表变更会清空失效默认 effort。后端停用时仍可提前编辑配置；scope 全关闭时提示路由不可见。未保存 executable / profile 时禁用模型发现，保存 revision 变更后重读探针；请求期间路径 / profile 改变、放弃改动或 revision 更新都会丢弃旧目录。失效请求会结束自己的加载状态，旧请求不会覆盖新一次发现的状态。
- 校验：模型 id 非空且唯一；启用的后端必须有模型、默认模型与默认 effort；白名单读到时已存分档路由必须在白名单内，已选 effort 必须属于模型提供的候选列表；trustedHosts 接受不含协议和路径的主机名或 host:port。已存但不在候选中的值保留并标注，不静默改值。分档本身只是提示词建议，实际子代理路由仍由宿主模型选择策略决定。

## 10. 验证

```sh
cd /path/to/dsh-better-subagent
npm install
npm test

# 真实宿主（headless，无需 CLI 凭据）：原生 subagent create→wait→continue→wait→interrupt→wait
DSH_PACKAGE_ROOT="/path/to/dependencies/dsh/node_modules/@deepseek-ai/dsh" npm run smoke

# 真实 Claude CLI（需要已登录；会消耗少量额度；含同 profile 的进程内宿主重启 + KV 重开 + cold resume）
DSH_PACKAGE_ROOT="/path/to/dependencies/dsh/node_modules/@deepseek-ai/dsh" node scripts/cli-smoke.mjs claude

# 真实 Codex CLI（需要 `codex login`；当前机器未登录时不可用）
DSH_PACKAGE_ROOT="/path/to/dependencies/dsh/node_modules/@deepseek-ai/dsh" node scripts/cli-smoke.mjs codex

npm pack --dry-run --json
npm ci --dry-run
```

测试目录：

| 文件 | 覆盖 |
|---|---|
| `tests/config.test.mjs` | 默认形状、volatile 集合、normalize 去重/回退/展开、活配置读取、settings 投影契约 |
| `tests/cli.test.mjs` | JSONL 切行/多字节/错误去敏、Codex/Claude argv 精确构造与事件语义 |
| `tests/cli-sessions.test.mjs` | KV 命名空间 `apollo_cli_*`、descriptor、校验、串行写、重开/关闭；真实 `@deepseek-ai/dsh-storage-json` per-record 重开/跨 profile 隔离 |
| `tests/cli-adapter.test.mjs` | provider 元数据、早存 remoteId、resume、env snapshot、并发、坏 JSON/非零退出、中断、游标、归属、dispose、rollback |
| `tests/subagents.test.mjs` | guard/路由、范围开关、fork/agent_preset/run_in_background 拒绝、白名单、降级、cwd、KV/预检/回收 |
| `tests/wait-subagent.test.mjs` | 契约/批量/去重/直接子代理/fail-fast/超时下限/宽限/取消/inbox 零手术 + 跨回合回归 |
| `tests/child-exit-guard.test.mjs` | 运行中子代理拦截、标签、开关、abort、fail-open、无 job 依赖 |
| `tests/prompt.test.mjs` | per-agent 注册、scope 门控、tiers/PTC/guard/catalog、活配置重渲染、preset 解析 |
| `tests/panel.test.mjs` | 探针、模型发现、信任边界、路由、canonical + Apollo 别名 |
| `tests/settings.test.mjs` | 延迟注入、路由注册、页面策略、无旧配置导入 |
| `tests/client.test.mjs` | 真实 React hooks/元素树：四个槽键、表单控件、保存/冲突/只读、发现、分档 |
| `tests/assembly.test.mjs` | manifest、bundle patch、exports、client closure id/键、发布工作流、包白名单、NOTICE |

真实宿主 smoke 会打印 `BETTER_SUBAGENT_RUNTIME_SMOKE_PASSED`（检查：精确宿主/隔离包路径、真实 step admission 阻止 CLI 越权启动、CLI advisory model catalog/精确 metadata、原生 local/runId 字段、真实 settings 投影/volatile 热更新、真实 webServer canonical+别名路由、结算通知正文、childExitGuard 真实 turn-stopping；模型输出由明确的 scripted adapter 提供，不是在线 LLM），CLI smoke 会打印 `BETTER_SUBAGENT_CLI_SMOKE_PASSED`（检查：真实 CLI 创建/等待、身份记录落盘、同 profile/DSH_HOME 的进程内宿主重启+父 Agent 恢复、KV 重开+cold CLI resume、remoteId 稳定、中断；不是独立 OS 进程），并在临时 `DSH_HOME/results.json` 留下检查项。

CLI smoke 会把 DSH profile 放在临时目录，但不会改 Claude/Codex 的原生 home（改 `CLAUDE_CONFIG_DIR` 会改变凭据/keychain 查找）；真实 CLI 自己的原生会话因此会留在该 CLI 的用户目录下，脚本不清理这些原生会话。

### 已知未验证项

- Codex CLI 端到端：实现机 `codex login status` 为 `Not logged in`，属于凭据阻塞；测试替身只能证明 argv/解析/生命周期边界。
- 从 npm 发布后的 `dsh plugin add` 与真实 Web GUI 点击：本仓库尚未发布；临时 profile 用同样的 scoped 安装布局 + `runProfile` 验证了加载（含真实 webServer 路由与真实 settings 投影/写入）。
- Apollo + 本插件组合运行与旧配置迁移：由 S4（Apollo 集成）负责并验证。

## 11. 迁移与边界

- 本仓库**不删除 Apollo 文件**、不修改 Apollo 预设/配置。Apollo 在执行 S4 之前仍保留旧的 `wait-subagent`、`exit-guard`、`mode-instructions` 与 `/apollo/api/*` 处理器。
- 同时安装时：preset 作用域的同名工具会遮蔽宿主工具；`/apollo/api` 路由可能由 Apollo 与本插件各注册一次（webServer 的重复 (kind,path) 会抛错）——这是迁移窗口的已知状态，S4 删除 Apollo 旧实现后消失。不要在这个窗口里声称组合安装已完成验收。
- 旧 `exitGuard` → `childExitGuard` 的映射归 S4；本插件只读自己的行配置，不读 `eng.json`/`atlas.json`。
- 身份 KV 与内部 route 是兼容契约：不要为了包名/品牌改名。
- 包名从 Spec 的 unscoped `dsh-better-subagent` 改为 scoped `@oh-my-dsh/dsh-better-subagent`（npm 名被他人占用）；旧 `@menghuan1918/dsh-better-subagent` 作为 legacy 键保留；行 id 与短槽键保留 `dsh-better-subagent`。

## 12. 发布

- `.github/workflows/release.yml`：GitHub Release `published` 触发；校验 tag `v<version>` 与 `package.json` 版本一致；`npm ci` → `npm test` → `npm publish --provenance --access public`。
- 使用 npm trusted publishing（OIDC），仓库与 workflow 中不保存 npm token；npmjs.com 的 trusted publisher 需指向本仓库与 `release.yml`。
- 发布前检查：`npm pack --dry-run --json` 的文件列表只含白名单（无 tests/scripts/docs 之外的内部 Spec、无 `.env`/`.npmrc`/凭据/临时 profile）。
