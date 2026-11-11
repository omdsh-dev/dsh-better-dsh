<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/omdsh-dev/dsh-better-ask-user/main/docs/assets/banner-dark.svg">
    <img src="https://raw.githubusercontent.com/omdsh-dev/dsh-better-ask-user/main/docs/assets/banner-light.svg" width="100%" alt="Part of Better DSH — dsh-better-ask-user">
  </picture>
</p>

<h1 align="center">dsh-better-ask-user</h1>

<p align="center">让提问等待变得可见、可控、对移动端友好，同时守住必须由人做的决策。</p>

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-better-ask-user"><img src="https://img.shields.io/npm/v/dsh-better-ask-user.svg" alt="npm 版本"></a>
  <a href="LICENSE"><img alt="Apache-2.0" src="https://img.shields.io/github/license/omdsh-dev/dsh-better-ask-user?color=blue"></a>
  <a href="package.json"><img alt="DSH 0.2.2-rc.1" src="https://img.shields.io/badge/DSH-0.2.2--rc.1-4B32C3"></a>
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

- `ask_user_question` 等待与输入续期
- 倒计时 / 进度 / 过期状态
- Markdown、移动端卡片与键盘操作
- 普通提问超时默认选择

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/omdsh-dev/dsh-better-ask-user/main/docs/assets/ownership-dark.svg">
    <img src="https://raw.githubusercontent.com/omdsh-dev/dsh-better-ask-user/main/docs/assets/ownership-light.svg" width="100%" alt="dsh-better-ask-user 与 Better DSH 的装配关系">
  </picture>
</p>

## 安装

```sh
# 只安装这个插件
dsh plugin --profile <profile> add dsh-better-ask-user@0.3.1 dsh-better-ptc@0.2.0

# 或安装 Better DSH（会自动带上所有独立插件）
dsh plugin --profile <profile> add dsh-better-dsh@0.10.0
```

> 安装 / 升级 / 换包后必须重启对应 profile；只刷新网页不够。

## 它拥有什么

| | |
|---|---|
| 稳定行 id | `dsh-better-ask-user` |
| 入口 / 工具 | `ask_user_question` · 问题卡片 / 等待时间线 · 提问设置页 |
| 设置 | 等待时长、输入续期、普通 / Goal 超时行为 |
| npm 包 | `dsh-better-ask-user@0.3.1` |
| 仓库 | https://github.com/omdsh-dev/dsh-better-ask-user |

## 设置

可以在 Plugins 页的 `dsh-better-ask-user` 行设置，也可以在 Better DSH 详情页的「集成设置」里打开同名页面。两个入口共用同一份配置和同一个设置组件，不会产生第二份存储。

- plan-review / approval 始终要求人工决策，不自动批准。
- 普通提问可配置超时默认选择；旧 goal 的提问配置会一次性迁移。

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
