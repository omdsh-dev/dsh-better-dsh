<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/omdsh-dev/dsh-better-subagent/main/docs/assets/banner-dark.svg">
    <img src="https://raw.githubusercontent.com/omdsh-dev/dsh-better-subagent/main/docs/assets/banner-light.svg" width="100%" alt="Part of Better DSH — @oh-my-dsh/dsh-better-subagent">
  </picture>
</p>

<h1 align="center">@oh-my-dsh/dsh-better-subagent</h1>

<p align="center">把 Codex / Claude CLI 接成可续接的 DSH 子代理，并给它们统一的路由、等待和分档。</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@oh-my-dsh/dsh-better-subagent"><img src="https://img.shields.io/npm/v/%40oh-my-dsh%2Fdsh-better-subagent.svg" alt="npm 版本"></a>
  <a href="LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/github/license/omdsh-dev/dsh-better-subagent?color=blue"></a>
  <a href="package.json"><img alt="DSH 0.2.2-rc.2" src="https://img.shields.io/badge/DSH-0.2.2--rc.2-4B32C3"></a>
  <a href="https://github.com/omdsh-dev/dsh-better-dsh"><img alt="Part of Better DSH" src="https://img.shields.io/badge/part%20of-dsh--better--dsh-2F80B7"></a>
</p>

<p align="center">
  <a href="https://github.com/omdsh-dev/dsh-better-dsh">Better DSH 插件集合</a> ·
  <a href="#安装">安装</a> ·
  <a href="#它拥有什么">它拥有什么</a> ·
  <a href="#设置">设置</a> ·
  <a href="#与-better-dsh-的关系">与 Better DSH 的关系</a>
</p>

## 它做什么

- Codex / Claude CLI 适配器
- `wait_subagent` 等待续接
- 运行中子代理退出守卫
- 模型分档、路由与子代理提示词

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/omdsh-dev/dsh-better-subagent/main/docs/assets/ownership-dark.svg">
    <img src="https://raw.githubusercontent.com/omdsh-dev/dsh-better-subagent/main/docs/assets/ownership-light.svg" width="100%" alt="@oh-my-dsh/dsh-better-subagent 与 Better DSH 的装配关系">
  </picture>
</p>

## 安装

```sh
# 只安装这个插件
dsh plugin --profile <profile> add @oh-my-dsh/dsh-better-subagent@0.5.3

# 或安装 Better DSH（会自动带上所有独立插件）
dsh plugin --profile <profile> add dsh-better-dsh@0.10.1
```

> 安装 / 升级 / 换包后必须重启对应 profile；只刷新网页不够。

## 它拥有什么

| | |
|---|---|
| 稳定行 id | `dsh-better-subagent` |
| 入口 / 工具 | `wait_subagent` · `/better-subagent/api/*` · 子代理设置页 |
| 设置 | `childExitGuard`、`delegation.prompt`、`tiers.*`、两个 CLI 后端、`trustedHosts` |
| npm 包 | `@oh-my-dsh/dsh-better-subagent@0.5.3` |
| 仓库 | https://github.com/omdsh-dev/dsh-better-subagent |

## 设置

可以在 Plugins 页的 `dsh-better-subagent` 行设置，也可以在 Better DSH 详情页的「集成设置」里打开同名页面。两个入口共用同一份配置和同一个设置组件，不会产生第二份存储。

- 模型 / effort / profile 在子代理创建时固定；权限每轮读取。
- 旧 `@menghuan1918/dsh-better-subagent` 的配置键保留兼容；行 id 仍是 `dsh-better-subagent`。

## 与 Better DSH 的关系

- **同一个稳定行**：独立安装或由 `dsh-better-dsh` 装配，行 id 和设置命名空间都不变。
- **旧入口兼容**：早期 Apollo 集成使用的行配置键仍然注册，指向同一份配置。
- **可以单独使用**：不安装 Better DSH 也能工作；只是不会得到工程预设、流程技能或后台 job 守卫。
- **Apache-2.0**：本仓库与 Better DSH 的其他仓库统一使用 Apache License 2.0。

## 开发

```sh
npm test        # 单元 / 组件测试
npm run smoke   # 如仓库提供运行时冒烟
```

实现与测试说明见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 许可

[Apache License 2.0](LICENSE)。
