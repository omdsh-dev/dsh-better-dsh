# dsh-better-subagent

独立的 DSH 插件：把子代理专用的增强从 Apollo 中移出，在**不安装 Apollo** 的 DSH 中也能独立配置与运行。

- **Codex / Claude 可续接 CLI 子代理**：仍是原生 `subagent` 工具，`provider="codex"|"claude"` 时由本插件接管；后台运行、可 `send_message` 续接、可 `interrupt_agent` 中断。
- **`wait_subagent` 宿主工具**：一次等待一批直接子代理，按输入顺序各回一行简短状态；正文仍由宿主结算通知投递，不排空、不重复转述 inbox。
- **跨回合等待正确性**：不再把上一次激活的 `subagent/end` 当成本轮完成。运行时用 live 状态、activation `runId` 与子会话的 durable turn/inbox 事件来证明“当前回合是否仍有排队输入”。
- **运行中子代理退出守卫**：`childExitGuard` 开启时，回合即将结束而仍有运行中的直接子代理会注入一条提醒；后台 bash job 与通用守卫仍归 Apollo。
- **子代理专用提示词**：委派纪律、fast/quality 分档、PTC fanout、CLI 目录与子代理守卫措辞只由本插件提供一份运行时来源。
- **设置页**：不构建的 React 行配置页（`plugins.row.config`），覆盖接入范围、模型分档、两个 CLI 后端与子代理退出守卫。

许可证：**Apache-2.0**（见 [LICENSE](LICENSE)；复用内容与第三方许可见 [third-party/NOTICE](third-party/NOTICE)）。

> 目标宿主：DSH `>=0.2.1-rc.2 <0.3.0`；Node.js `^22.19.0 || >=24.0.0`。纯 ESM，无构建步骤。

> **命名偏差**：S1 Spec 最初写的是 unscoped 包名/行名 `dsh-better-subagent`；该 npm 名已被其他发布者占用，经用户批准改为 scoped 包名 `@menghuan1918/dsh-better-subagent`。bundle 行 id 仍为 `dsh-better-subagent`，行 name 必须是 scoped 包名（Loader 把它当模块 specifier，client closure id 也必须等于它）；浏览器半边同时保留 S1 的 `dsh-better-subagent#dsh-better-subagent` 短键作兼容别名。

## 安装

### 独立安装（推荐的干净 profile）

```sh
# 新建/选择 profile；插件会向该 profile 注入一行 dsh-better-subagent
dsh plugin --profile <profile> add @menghuan1918/dsh-better-subagent

# 启动
dsh --profile <profile>
```

本插件**不依赖 Apollo**，也不会安装或加载 Apollo。设置出现在
**Plugins → @menghuan1918/dsh-better-subagent → dsh-better-subagent 行**。

> 当前补丁版本为 `0.1.1`，修复异步日志观察期间的跨回合等待竞态，以及超过启动宽限后的状态重读。宿主集成验证见 `scripts/runtime-smoke.mjs`；npm 发布结果以对应 GitHub Release 与 registry 为准。

### 与 Apollo 一起使用（集成由 Apollo 负责）

Apollo 的集成版本会插入同一个稳定行（id 为 `dsh-better-subagent`，name 为 `@menghuan1918/dsh-better-subagent`），
Loader 按行 id 去重，因此两个 bundle 同时选中时只会挂载一份。浏览器半边的
`plugins.row.config` 同时注册以下键，全部指向同一行、同一份配置：

- `@menghuan1918/dsh-better-subagent#dsh-better-subagent`（主键）
- `@menghuan1918/dsh-apollo#dsh-better-subagent`（Apollo 集成）
- `dsh-apollo#dsh-better-subagent`（旧 unscoped 依赖名兼容）
- `dsh-better-subagent#dsh-better-subagent`（短别名，无副作用）

> **S4 边界**：Apollo 删除旧处理器/旧预设插件并迁移 `exitGuard` 等旧配置由 Apollo 的集成 Sub-Spec 完成；本仓库不修改 Apollo。若同一 profile 里同时存在 Apollo 旧版和本插件，旧版仍会注册同名 `wait_subagent`（preset 作用域会遮蔽宿主工具）；这是迁移窗口的预期状态，S4 收尾。

## 快速配置

设置分为「概览」「CLI」「模型分档」「连接」。CLI 页内切换 Codex / Claude；说明默认折叠。所有修改先保留为草稿，点击「保存」一次提交，跨页切换不会丢失输入。连接页可编辑受信主机并刷新只读探测。

1. **没有 eng / eng-ptc 预设时，必须开启 global 范围。**
   设置页的「接入范围」里勾选「全部预设」（`subagents.global: true`），否则标准预设的会话看不到 CLI 子代理路由。eng 预设会话默认由 `subagents.eng: true` 覆盖。
2. **启用一个可用后端**（例如 Claude）：
   - 勾选「启用」；
   - 可执行文件保持 `claude`（从 PATH 解析）或填绝对路径；创建子代理前会执行一次 `<cli> --version` 预检，低于测试基线（Codex `0.162.1` / Claude `2.1.300`）或无法识别版本会给出可操作错误，不会静默回退；
   - 权限档保持 `plan`（默认；不会继承父会话权限）；
   - 在「模型与 effort」里至少加一条模型，例如 `sonnet` + efforts `low, medium, high` + 默认 `low`，并把「默认模型」设为 `sonnet`；
   - 保存后即时生效，无需重启。
3. 让模型这样创建子代理（模型侧）：
   ```
   subagent(provider="claude", prompt="…", description="…")
   ```
   返回 `{kind:"activation", subagentId:"…"}`；随后 `wait_subagent({subagent_id:["…"]})`。

默认是两个后端都**未启用**、`childExitGuard=false`；不启用后端时不会启动任何外部 CLI，原生 `subagent` / `subagent_fork` / `send_message` / `interrupt_agent` 行为不变。

## 配置语义

行配置是本插件唯一的设置事实源（`src/config.js` 的 `Config` schema）：

| 字段 | 默认 | volatile（保存即生效） | 含义 |
|---|---|---|---|
| `childExitGuard` | `false` | 是 | 回合结束时仍有**运行中的直接子代理**则注入提醒 |
| `tiers.fast` / `tiers.quality` | 均空 | 是 | `provider` / `model` / `reasoningEffort`；空值 = 沿用父会话路由 |
| `subagents.eng` | `true` | 是 | `eng` / `eng-ptc` 预设可见 CLI 后端 |
| `subagents.global` | `false` | 是 | 所有预设可见 CLI 后端 |
| `subagents.codex.enabled` | `false` | 是 | 启用 Codex 后端 |
| `subagents.codex.executable` | `codex` | 是 | 命令名或绝对路径 |
| `subagents.codex.profile` | `""` | 是 | `codex -p` profile |
| `subagents.codex.permissionMode` | `read-only` | 是 | `codex --sandbox` 取值 |
| `subagents.codex.defaultModel` / `models` | 空 | 是 | 模型白名单与默认档；模型条目为 `{id, efforts[], defaultEffort}` |
| `subagents.claude.*` | `enabled=false`、`executable=claude`、`permissionMode=plan` | 是 | Claude 后端；没有 `profile` 字段 |
| `trustedHosts` | `[]` | 是 | 额外信任的反向代理权威（host 或 host:port） |

规则：

- 模型与 effort 只接受白名单里的组合；**不做静默替换**。缺失/不允许时在启动前明确失败。
- 权限**完全**由这里设置决定，不继承父会话的权限状态，也不放宽默认值。
- 所有 schema 配置（含 `trustedHosts`）均可通过宿主设置编辑，保存即生效，无需重启或重挂；HTTP 信任边界每请求读取最新配置。
- 每个 CLI 子代理同一时刻最多一个 CLI 回合；model/effort 在创建时固定，权限每轮读取最新配置。
- 行/包升级、预设改动后仍需要对应的重载；`wait_subagent`、守卫与路由按次读取活配置。

## 等待语义（`wait_subagent`）

- 参数：`subagent_id`（非空字符串数组，去重保输入顺序）+ 可选 `timeout_ms`。
- 只接受调用者的**直接子代理**；含未知 id 时整批 fail-fast，不等待任何人。
- 整批并发等待；`timeout_ms` 是整批共享窗口，低于 15 分钟会提升到 15 分钟。
- 每个 id 一行：`done (stopReason)` / `timed out` / `aborted` / `has not started after 30s` / `could not be confirmed` / 已在此次等待前结束的状态说明。子代理正文仍由框架的 settlement notice 投递；本工具不排空、不改写、不重复转述父代理 inbox。
- 刚刚创建、尚未开始运行的子代理有 30 秒启动宽限；宽限内不误报“没在运行”。
- **跨回合**：`subagent/end` 必须与最近一次 `subagent/start` 的 `runId` 匹配（或挂载后只观测到 end）；匹配后仍会读子会话 durable 日志，把 `agent/inbox/spliced` 的插入/claim/取消删除折成“是否仍有排队输入”。`pending > 0` 时继续等待（resident idle 子代理没有新的 start，只能靠这条证明）；`pending == 0` 才 settle。继承的 fork 前缀事件（`inheritedEventCount` 之前）不计入子代理自己的回合。若 durable 状态不可读：子代理已不在 registry（如无本地 DSH 会话的 external provider）按匹配的 start/end 对 settle；仍有 live 子代理则返回 `could not be confirmed`，不伪报成功。状态 `running` 一律继续等待。

## 只读 API 与反向代理

本插件注册（`src/panel.js`）：

- `GET /better-subagent/api/capabilities` — 两个可执行文件的 PATH 解析、版本行、Codex profile 名；
- `GET /better-subagent/api/models?cli=codex|claude` — 显式触发的模型发现（Codex `debug models` / Anthropic `GET /v1/models`）；
- `GET /better-subagent/api/routes` — 宿主「子代理模型选择」白名单里的路由与 effort；
- 以及同名 `/apollo/api/*` 只读别名（Apollo 旧设置页兼容；S4 删除 Apollo 自己的处理器）。

边界与限制：

- 只信任 loopback（`localhost` / `127.0.0.0/8` / `[::1]`）与 `trustedHosts` 列出的权威；拒绝 `Sec-Fetch-Site: cross-site` 与异源 `Origin`；只允许 GET（其他方法 405），从不读取请求体。
- 这是 **DNS rebinding / 跨站调用防御**，不是登录认证。经反代域名访问 GUI 时，把该权威加入 `trustedHosts` 的后果上限是暴露本机可执行文件路径/版本、profile 名或模型清单。
- `trustedHosts` **只影响本插件的只读 API**，不会把官方设置镜像从 memory/只读变成可写；设置页能否写入由宿主连接策略决定（`declareOwnsHost` 是宿主/Apollo 所有的部署标志，本插件已按 Spec 移除）。
- 能力探针（`/capabilities`）带 30s 有界缓存；模型发现（`/models`）只在设置页显式点击时触发、不做后台缓存/重探。插件启动与页面重绘都不会探测 CLI 或网络。发现结果不代表当前会话实际可调用；已保存但不在候选中的值会保留并标注，不会被静默改掉。

## 持久身份与旧会话兼容

- 外部 provider 仍为 `codex` / `claude`；内部 durable LLM route 仍为 `apollo-cli-codex` / `apollo-cli-claude`。
- 身份 KV 仍是历史命名空间 `apollo_cli_<sha256(profile.dir)[:16]>`、version 1、`sessions` 表、`per-record` 布局。包名变化**不会**重命名、复制或清空旧存储；同一 profile 路径升级后，已有两类 CLI 子代理可以继续续接。
- 记录字段（child/parent、cwd、CLI executable/profile/home、model/effort、`delivered`、`started`、`remoteId` 等）语义不变。
- 已启动但没有可靠 `remoteId` 的会话拒绝恢复；进程发布后失败的轮次不自动重投已记 `delivered` 的输入——需要明确重发或新建，避免重复执行。
- profile 路径改变或 CLI 原生 home 不可用时明确诊断；不会假装迁移成功。

## 子代理退出守卫

`childExitGuard: true` 时，回合即将结束（`agent/turn-stopping`）而本 Agent 仍有**运行中的直接子代理**，插件会 steer 一条简短提醒，让回合继续到用 `wait_subagent` 收尾。它：

- 只看直接子代理的运行状态，不看 bash job（那是 Apollo 的 job/general guard）；
- 查询或注入失败按 fail-open 放行，不卡死会话；
- 用户中断（Esc/abort）始终是逃生口；
- 不扩大任何权限。

## 提示词归属

运行时子代理专用提示词只有一份来源（`src/prompt.js`）：在 `agent/created` 时把 section 注册到该 Agent 自己的 `agent.ctx.systemPrompt`，文本按活配置与 `agentPresets.composedPreset()`（回退 session header/projection）渲染：

- `better-subagent:delegation`（委派纪律 + fast/quality 分档；`eng-ptc` 追加 run_code fanout 规则）
- `better-subagent:child-guard`（仅 `childExitGuard` 开启时出现）
- `better-subagent:cli-subagents`（CLI 目录，沿用原内容；无启用后端时为空）

Apollo 的通用工程原则、完整工作流 skills、job/general 守卫措辞不属于本插件。

## 限制

- **双 bundle 不可寻址**：Loader 按行 id 去重，同一 profile 只有一个 `dsh-better-subagent` 行；同时安装独立包和 Apollo 集成版时，用户只能编辑这一份行配置。这是预期设计，Apollo 集成由 S4 收尾。
- 不支持 CLI 子代理的 `subagent_fork`（fork 永远走原生父路由/父上下文）；显式传 `agent_preset` 会明确失败；`run_in_background` 已从 CLI 子代理移除（它们始终后台运行）。
- CLI 后端的模型/effort 白名单需要手工维护（或点“自动发现模型”），发现结果不等于本会话实际可调用。
- 后端缺失或版本不兼容时给出可操作诊断，**不会**静默回退到另一种后端。
- 分档只是提示词委派建议，不自行路由；实际子代理路由仍受宿主的模型选择白名单/策略约束，白名单未开启或为空时建议仍会渲染，但离线路由可能被宿主拒绝。

## 验证状态（诚实记录）

本仓库验证过的内容：

- `npm test`：配置规约、CLI argv/JSONL、身份 KV 命名空间与重开、adapter 生命周期/回滚/游标/卸载、子代理路由/范围/守卫/fork 拒绝/白名单/cwd/预检、wait 契约/批量/超时/宽限/无 inbox 手术 + **跨回合回归**、子代理退出守卫、路由/信任边界/别名、客户端表单/四个槽键、manifest/patch/exports/发布工作流。
- 真实宿主临时 profile 启动（headless，安装后无 Apollo；已重跑含 `trustedHosts` 热更新与共享 PTC 依赖的完整 smoke）：宿主工具注册、per-agent 提示词 section 真实装配、真实 `dsh-settings` 投影（所有 schema 配置可编辑，schema/value 含 `childExitGuard` 与 `trustedHosts`）与 volatile 热更新、真实 `webServer` 上的 canonical + `/apollo/api` 别名路由（200/404/405）、原生 create → `wait_subagent` → 结算通知携带子代理正文 → 续接 → 等待 → 运行中子代理退出守卫真实拦截并继续回合 → 中断 → 等待。
- 真实 Claude CLI（本机已登录）临时 profile 端到端，含**同 profile/DSH_HOME 的进程内宿主重启**（dispose 宿主 fiber 后在同一进程、同一 profile 重新 boot，不是另一个 OS 进程）：创建 CLI 子代理 → 等待 → 落盘 `apollo_cli_<hash>/sessions/<id>.json` → 重新 boot、恢复父 Agent → cold resume 同一 CLI 子代理（remoteId 不变）→ 等待 → 运行中中断 → 等待；plan 权限、无工具，会消耗少量 Claude 额度。
- 真实 JSON storage backend（宿主 `@deepseek-ai/dsh-storage-json`）的 per-record KV 关闭/重开测试（`tests/cli-sessions.test.mjs`）。
- **未验证**：Codex CLI 端到端（本机 `codex login status` = `Not logged in`，属于凭据阻塞）；从 npm 正式发布后的 `dsh plugin add` 安装路径与真实 Web GUI 设置页点击（本仓库尚无发布）；Apollo + 本插件组合运行（S4）。

复现命令见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 开发

```sh
npm install
npm test
# 真实宿主（无需凭据）：
DSH_PACKAGE_ROOT="/path/to/@deepseek-ai/dsh" npm run smoke
# 真实 Claude CLI（需要已登录，会消耗少量额度）：
DSH_PACKAGE_ROOT="/path/to/@deepseek-ai/dsh" node scripts/cli-smoke.mjs claude
```

打包检查：

```sh
npm pack --dry-run --json
```

发布使用 npm trusted publishing（OIDC）：GitHub Release `published` 时校验 tag 与 `package.json` 版本一致、跑测试后 `npm publish --provenance --access public`；仓库不保存 npm token。见 [.github/workflows/release.yml](.github/workflows/release.yml)。

## 许可证

Apache-2.0。复用的 Apollo 代码（Apache-2.0）与信任边界逻辑（MIT）的版权/许可声明见 [third-party/NOTICE](third-party/NOTICE)。
