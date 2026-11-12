# AGENTS.md — Better DSH

本仓是 Better DSH bundle 与其六个子包的 monorepo。修改前先读 `docs/DEVELOPMENT.md` 与 `docs/UI-KIT.md`；本文件只记录 agent 最常踩的边界与命令。

## 目录

| 路径 | 说明 |
|---|---|
| `src/`、`presets/`、`skills/`、`prompts/`、`tests/`、`docs/` | Better DSH bundle 本体 |
| `packages/dsh-better-ask-user` | 提问插件（官方 `ask_user_question` 影子 + 等待/卡片/历史行） |
| `packages/dsh-better-compact` | 压缩 companion + engine + 设置页 |
| `packages/dsh-better-goal` | goal 域 |
| `packages/dsh-better-ptc` | PTC deadline 豁免单例 |
| `packages/dsh-better-subagent` | 子代理 CLI/等待/child guard/分档（`@oh-my-dsh/dsh-better-subagent`） |
| `packages/dsh-lazy-session-list` | 惰性 session list 实验包 |
| `plugins/` | 迁移前的子包源码归档，已被 gitignore，**不要修改** |
| `.agents/worktrees/` | 本地隔离 worktree，已被 gitignore |

## 工具链

- Node `>=24.9.0`，pnpm `11.7.0`，DSH 精确 `0.2.2-rc.2`。
- 根目录：
  - `pnpm install --frozen-lockfile`
  - `pnpm test`：只跑根 bundle 的 `tests/*.test.mjs`
  - `pnpm test:packages`：跑 `packages/*`（暂时排除 `dsh-lazy-session-list`，见下）
  - `pnpm test:all`：根 + 子包
  - `pnpm build:packages`、`pnpm prompts`、`pnpm smoke`
- 单包：
  - `pnpm --filter dsh-better-ask-user test`
  - ask-user 的 `pretest` 会重建已跟踪的 `lib/client.js`；改了 `src/client/` 后必须重新生成并提交。
- 根 `node --test` 必须带 `tests/*.test.mjs`，否则会把 `packages/*/tests` 也发现进来。

## 依赖与版本

- 根 `dependencies` 当前固定已发布的精确版本（ask-user `0.3.4`、compact `0.4.1`、goal `0.4.4`、subagent `0.5.3`、ptc `0.2.1`）。
- **不要**把根依赖切成 `workspace:*` 或未发布版本：根依赖必须指向可安装的精确 npm 版本。发布新子包后，再统一 bump 版本并更新根依赖；本地 `packages/*` 与 registry 版本号保持一致。
- 本地 `packages/*` 是源码真相：ask-user `0.3.4`、compact `0.4.1`、goal `0.4.4`、ptc `0.2.1`、subagent `0.5.3` 已完成 DSH rc.2 适配并发布；发布验证需使用官方 registry，默认 npmmirror 可能滞后。
- 发布前先确认子包版本在 `https://registry.npmjs.org/` 可取得；不要提交 `file:`/`link:`/`git:` 依赖。

## 发布

- 根 bundle：更新 `package.json` 版本与子包依赖 → `pnpm test:all` → 建 `v<version>` tag 与 GitHub Release。根 `.github/workflows/release.yml` 用 pnpm 安装、测试，并通过 npm trusted publishing（OIDC）发布；仓库里不存 npm token。
- 子包：目前仍走各子包的独立发布流程；monorepo 统一的子包发布 workflow 尚未完成。ask-user 的发版仓是 `omdsh-dev/dsh-better-ask-user`，本地 `packages/dsh-better-ask-user` 要与其已发布代码保持同步。
- 不要在基于旧 bundle 版本的分支上直接发 bundle；先把分支 rebase 到最新 `main`/release 基线。

## 测试已知限制

- `dsh-lazy-session-list` 不在本轮适配范围；DSH rc.2 已提供匹配的 `@deepseek-ai/dsh-skill` / `@deepseek-ai/dsh-native-command`，但该包尚未适配，`pnpm test:packages` 仍排除它。需要时用匹配的 DSH host 单独跑 `pnpm test:lazy-session-list`。
- 需要真实 DSH 安装的漂移/迁移测试：设置 `DSH_PACKAGE_ROOT=/path/to/node_modules/@deepseek-ai/dsh` 后跑 `pnpm test`。
- 浏览器/客户端测试使用 esbuild + `react-test-renderer`；不要用 jsdom 替代真实渲染边界。

## 约定

- 保持中文文档与既有命名；新增副本、迁移或发布说明时同步更新 `README.md` 与 `docs/DEVELOPMENT.md`。
- 保留无关的未提交改动；需要隔离时用 `.agents/worktrees/` 新建 worktree，不要在主检出上切来切去。
- 第三方内容与 Apache-2.0 许可声明分别保留在 `third-party/` 和各包自己的 `third-party/`；不要删除 NOTICE/LICENSE。
