/**
 * 浏览器半边（src/client.js）真实 React 测试：react-test-renderer@18 驱动真实 hooks
 * 与元素树（不需要 react-dom/浏览器）。宿主面按 0.2.0-rc.2 公开形状构造：`form` =
 * 官方插件页 formFor() 的 `{ state, mutate }`，`slots` = keyed 槽声明生命周期，
 * capabilities 用假 fetch（默认不触网）。client.js 只 require('react')。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import TestRenderer from 'react-test-renderer'
import { CLAUDE_PERMISSION_MODES, CODEX_PERMISSION_MODES } from '../src/config.js'

const { createElement } = React
const act = TestRenderer.act ?? TestRenderer.default?.act
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SOURCE = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
const NS = 'better-subagent'
/** 假 t：键名 + 参数（断言不依赖文案）。 */
const t = (key, params) => (params === undefined ? key : key + '(' + JSON.stringify(params) + ')')

const READY = {
  childExitGuard: false,
  subagents: {
    eng: true,
    global: false,
    codex: {
      enabled: true, executable: 'codex', profile: 'work', permissionMode: 'read-only', defaultModel: 'gpt-5',
      models: [{ id: 'gpt-5', efforts: ['low', 'high'], defaultEffort: 'high' }],
    },
    claude: { enabled: false, executable: 'claude', permissionMode: 'plan', defaultModel: '', models: [] },
  },
}

/** ConfigForm 公开面：getSnapshot() + mutate(ops, revision)。 */
function makeForm(options = {}) {
  const behavior = options.behavior ?? 'accept'
  let snapshot = {
    status: options.status ?? 'ready',
    value: options.value ?? READY,
    base: options.value ?? READY,
    user: options.user,
    revision: options.revision ?? 1,
    writable: options.writable ?? true,
    mode: options.mode ?? 'host',
  }
  const calls = []
  let settle = null
  // 镜像折叠：把写入的 set 操作落到值上并推进 revision。
  const accept = (ops) => {
    const value = structuredClone(snapshot.value)
    for (const op of ops) {
      let cursor = value
      for (const key of op.path.slice(0, -1)) cursor = cursor[key] ??= {}
      cursor[op.path[op.path.length - 1]] = structuredClone(op.value)
    }
    snapshot = { ...snapshot, value, revision: snapshot.revision + 1 }
    return true
  }
  return {
    calls,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
    async mutate(ops, expectedRevision) {
      calls.push({ ops, revision: expectedRevision })
      if (behavior === 'refuse') return false
      if (behavior === 'reject') throw new Error('transport down')
      if (behavior === 'manual') {
        return await new Promise((resolve) => {
          settle = (ok) => { settle = null; resolve(ok ? accept(ops) : false) }
        })
      }
      return accept(ops)
    },
    /** Replace the host snapshot externally (host revision advanced elsewhere). */
    replace(value) {
      snapshot = { ...snapshot, value, revision: snapshot.revision + 1 }
    },
    finish(ok) {
      assert.equal(typeof settle, 'function', 'mutate is not pending')
      settle(ok)
    },
  }
}

/** keyed slot 生命周期假实现：声明后才回调 register，撤销即回收。 */
function makeSlots() {
  const watchers = new Map()
  const registrations = []
  return {
    registrations,
    injected: [],
    inject(name, callback) {
      this.injected.push(name)
      const set = watchers.get(name) ?? new Set()
      watchers.set(name, set)
      set.add(callback)
      return () => set.delete(callback)
    },
    register(options, component) {
      const record = { options, component }
      registrations.push(record)
      return () => {
        const at = registrations.indexOf(record)
        if (at >= 0) registrations.splice(at, 1)
      }
    },
    declare(name) {
      const disposers = []
      for (const callback of [...(watchers.get(name) ?? [])]) {
        const dispose = callback()
        if (typeof dispose === 'function') disposers.push(dispose)
      }
      watchers.set(name, new Set(disposers))
      return disposers
    },
    undeclare(name) {
      for (const dispose of watchers.get(name) ?? []) dispose()
      watchers.set(name, new Set())
    },
  }
}

/** 装载一份新的 client.js（模块状态互不串场）。 */
function loadClient() {
  const registrations = []
  new Function('window', SOURCE)({ __ModuleLoader__: { load: (entry) => registrations.push(entry) } })
  assert.equal(registrations.length, 1)
  const exports = new Function('require', 'return (' + registrations[0].factory.toString() + ')(require)')((specifier) => {
    if (specifier === 'react') return React
    throw new Error('unexpected external require: ' + specifier)
  })
  return { entry: registrations[0], exports }
}

/** 装载 client 并 apply（槽仍未声明）：返回可观察注册生命周期的上下文。 */
function install() {
  const slots = makeSlots()
  const effects = []
  const dicts = []
  const loaded = loadClient()
  loaded.exports.apply({
    fiber: {},
    inject() {},
    effect(factory, label) { const dispose = factory(); effects.push({ label, dispose }); return dispose },
    locale: { register: (ns, dictionaries) => { dicts.push({ ns, dictionaries }); return () => {} }, bind: () => t },
    slots,
  })
  return {
    slots,
    effects,
    dicts,
    loaded,
    declare() {
      const disposers = slots.declare('plugins.row.config')
      assert.equal(slots.registrations.length, 6)
      return { disposers, component: slots.registrations[0].component }
    },
  }
}

/** 装载 client、声明槽、起一个挂载好的行配置页。 */
async function mountPage(options = {}) {
  const setup = install()
  const { component } = setup.declare()
  const controller = options.controller ?? makeForm(options.form ?? {})
  // 官方页面交给注册者的配置页 props：form.state + form.mutate（owner share）。
  const form = () => ({ state: controller.getSnapshot(), mutate: (ops, revision) => controller.mutate(ops, revision) })
  const element = () => createElement(component, { view: 'page', t, form: form() })
  let renderer = null
  const page = {
    ...setup,
    component,
    controller,
    get renderer() { return renderer },
    async run(run) { await act(async () => { await run() }) },
    /** 模拟官方页面重渲染（镜像折叠后送来新的快照）。 */
    async update() { await act(async () => { renderer.update(element()) }) },
  }
  await act(async () => { renderer = TestRenderer.create(element()) })
  return page
}

// 只匹配宿主元素：组件实例也会带同名 props。
const host = (node) => typeof node.type === 'string'
const byId = (renderer, id) => renderer.root.findAll((node) => host(node) && node.props?.id === id)[0]
const byLabel = (renderer, label) => renderer.root.findAll((node) => host(node) && node.props?.['aria-label'] === label)[0]
const byType = (renderer, type) => renderer.root.findAllByType(type)
const saveButton = (renderer) => byType(renderer, 'button').find((node) => node.props['data-variant'] === 'primary')
const optionItems = (node) => node.parent.findAll((item) => host(item) && item.props.role === 'option')
const optionsOf = (node) => optionItems(node).map((option) => option.props['data-value'])
function setControlValue(node, value) {
  if (node.props.role === 'combobox') {
    const option = optionItems(node).find((item) => item.props['data-value'] === value)
    assert.ok(option, 'option must be offered by the actual control: ' + value)
    option.props.onClick()
  } else node.props.onChange({ target: { value } })
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  return (node.children ?? []).map(textOf).join('')
}

const pageText = (renderer) => textOf(renderer.toJSON())

/** 假 fetch：默认绝不触网。 */
const CAPABILITIES = {
  executables: { codex: { executable: 'codex', path: '/opt/bin/codex', version: 'codex-cli 9.9.9' }, claude: { executable: 'claude', path: null, version: null } },
  codexProfiles: ['default', 'work'],
}

function useFetch(handler) {
  const original = globalThis.fetch
  globalThis.fetch = handler
  return () => { globalThis.fetch = original }
}

useFetch(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }))

test('装载与 slot 注册：声明才注册、新键与旧键并排、塌缩回收、summary 只回一行', async () => {
  const { slots, effects, dicts, loaded, declare } = install()
  assert.equal(loaded.entry.id, '@oh-my-dsh/dsh-better-subagent')
  assert.deepEqual(loaded.exports.inject, ['slots', 'locale'])
  assert.equal(SOURCE.includes('document.'), false)

  // 页面未打开（槽未声明）：只挂等待，不注册。
  assert.deepEqual(slots.injected, ['plugins.row.config'])
  assert.equal(slots.registrations.length, 0)
  assert.deepEqual(effects.map((effect) => effect.label), ['@oh-my-dsh/dsh-better-subagent: dictionaries', '@oh-my-dsh/dsh-better-subagent: row config page'])
  assert.deepEqual(dicts.map((entry) => entry.ns), [NS])
  assert.deepEqual(Object.keys(dicts[0].dictionaries.zh).sort(), Object.keys(dicts[0].dictionaries.en).sort())

  const declared = declare()
  assert.deepEqual(slots.registrations.map((entry) => entry.options), [
    { name: 'plugins.row.config', key: '@oh-my-dsh/dsh-better-subagent#dsh-better-subagent', locale: NS },
    { name: 'plugins.row.config', key: 'dsh-better-dsh#dsh-better-subagent', locale: NS },
    { name: 'plugins.row.config', key: '@menghuan1918/dsh-better-subagent#dsh-better-subagent', locale: NS },
    { name: 'plugins.row.config', key: '@menghuan1918/dsh-apollo#dsh-better-subagent', locale: NS },
    { name: 'plugins.row.config', key: 'dsh-apollo#dsh-better-subagent', locale: NS },
    { name: 'plugins.row.config', key: 'dsh-better-subagent#dsh-better-subagent', locale: NS },
  ])
  assert.equal(declared.disposers.length, 1)
  // 两个键注册同一个页面组件。
  assert.equal(new Set(slots.registrations.map((entry) => entry.component)).size, 1)

  // summary：一行文案，不挂样式表。
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(declared.component, { view: 'summary', t })) })
  assert.equal(pageText(renderer), 'summary')
  assert.equal(byType(renderer, 'style').length, 0)
  await act(async () => { renderer.unmount() })

  // 声明塌缩回收。
  slots.undeclare('plugins.row.config')
  assert.equal(slots.registrations.length, 0)
})

test('ready：真实渲染表单 + 唯一 <style>，权限档与 src/config.js 一致', async () => {
  const page = await mountPage()
  const renderer = page.renderer
  await page.run(async () => { await Promise.resolve() })

  const styles = byType(renderer, 'style')
  assert.equal(styles.length, 1)
  assert.match(styles[0].children[0], /\.bs-switch/)
  assert.match(styles[0].children[0], /--cfg-accent:var\(--dsw-alias-state-business-primary,#4176e6\)/)
  assert.match(styles[0].children[0], /--cfg-accent-solid:var\(--dsw-alias-button-primary-fill,#0f1115\)/)
  assert.match(styles[0].children[0], /--cfg-accent-text:color-mix\(in srgb,var\(--cfg-accent\) 72%,var\(--cfg-ink\)\)/)
  assert.equal(renderer.root.findAll((node) => String(node.props.className ?? '').includes('bs-root')).length, 1)

  // 单一页面标题；字段提示保留为无障碍描述，不再逐行显示信息图标。
  const titles = renderer.root.findAll((node) => host(node) && node.type === 'h2' && node.props.className === 'bs-title')
  assert.equal(titles.length, 1)
  assert.equal(textOf(titles[0].props.children), 'title')
  const header = renderer.root.findAll((node) => host(node) && node.props.className === 'bs-header')[0]
  assert.equal(header.findAllByType('p').length, 0, 'header has no generic subtitle')
  const routineHints = byType(renderer, 'p').filter((node) => /executableHint|profileHint/.test(textOf(node)))
  assert.ok(routineHints.length > 0, 'supplementary help remains available')
  assert.ok(routineHints.every((hint) => String(hint.props.className).includes('bs-hint')), 'routine descriptions are visible in the form')
  assert.ok(byType(renderer, 'details').every((node) => node.props.className === 'bs-advanced'), 'only task-level advanced disclosures remain')
  const described = renderer.root.findAll((node) => host(node) && typeof node.props['aria-describedby'] === 'string')
  assert.ok(described.length >= 2, 'retained hints associate with their controls')
  // 模型行窄屏标签：隐藏列头语义由每格 label 承担。
  const cellLabels = renderer.root.findAll((node) => host(node) && node.props.className === 'bs-cellLabel')
  assert.ok(cellLabels.length >= 3, 'model rows carry per-cell labels for narrow layout')
  assert.equal(byId(renderer, 'bs-child-exit-guard').props['aria-checked'], false)
  assert.deepEqual(optionsOf(byId(renderer, 'bs-codex-permission')), [...CODEX_PERMISSION_MODES])
  assert.equal(byId(renderer, 'bs-claude-permission'), undefined)
  await page.run(async () => byId(renderer, 'bs-claude-enabled').props.onClick())
  assert.deepEqual(optionsOf(byId(renderer, 'bs-claude-permission')), [...CLAUDE_PERMISSION_MODES])
  await page.run(async () => byId(renderer, 'bs-claude-enabled').props.onClick())
  // 探针成功：profile 选项来自 host 探针，可执行文件显示解析结果。
  assert.equal(byId(renderer, 'bs-codex-profile').type, 'input')
  assert.equal(byId(renderer, 'bs-codex-profile').props.list, undefined)
  assert.deepEqual(byId(renderer, 'bs-codex-profiles').findAllByType('button').map((button) => textOf(button)), ['default', 'work'])
  assert.equal(byType(renderer, 'select').length, 0)
  assert.equal(byType(renderer, 'datalist').length, 0)
  assert.match(pageText(renderer), /\/opt\/bin\/codex/)
  assert.equal(saveButton(renderer), undefined)

  // 重渲染仍是同一个样式节点（不重复注入）。
  await page.update()
  assert.equal(byType(renderer, 'style').length, 1)
})

test('只读：writable=false 与 mode=memory 都禁用写入控件且不写入', async () => {
  for (const form of [{ writable: false }, { mode: 'memory' }]) {
    const page = await mountPage({ form })
    const renderer = page.renderer
    const controls = renderer.root.findAll((node) => ['input', 'textarea'].includes(node.type) || node.props.role === 'combobox' || node.props.role === 'switch' || node.props['data-variant'] === 'primary' || node.props.id?.endsWith('-discover'))
    assert.ok(controls.length > 5)
    for (const control of controls) assert.equal(control.props.disabled, true, String(control.type))
    assert.match(pageText(renderer), /readonly/)
    assert.equal(saveButton(renderer), undefined)
    assert.deepEqual(page.controller.calls, [])
  }
})

test('同一 act 内连续编辑 → 单次 mutate（真实 hooks 状态队列）', async () => {
  const page = await mountPage()
  const renderer = page.renderer

  await act(async () => {
    byId(renderer, 'bs-child-exit-guard').props.onClick()
    byId(renderer, 'bs-scope-global').props.onClick()
    byId(renderer, 'bs-delegation-prompt').props.onClick()
    setControlValue(byId(renderer, 'bs-codex-permission'), 'workspace-write')
    setControlValue(byLabel(renderer, 'modelIdPlaceholder 1'), 'gpt-5.1')
  })

  assert.deepEqual(page.controller.calls, [])
  assert.equal(byId(renderer, 'bs-child-exit-guard').props['aria-checked'], true)
  assert.equal(byId(renderer, 'bs-scope-global').props['aria-checked'], true)
  assert.equal(byId(renderer, 'bs-delegation-prompt').props['aria-checked'], false)
  assert.equal(saveButton(renderer).props.disabled, false)

  await page.run(async () => { saveButton(renderer).props.onClick() })
  assert.equal(page.controller.calls.length, 1)
  assert.equal(page.controller.calls[0].revision, 1)
  assert.deepEqual(page.controller.calls[0].ops, [
    { op: 'set', path: ['childExitGuard'], value: true },
    { op: 'set', path: ['delegation', 'prompt'], value: false },
    { op: 'set', path: ['subagents', 'global'], value: true },
    { op: 'set', path: ['subagents', 'codex', 'permissionMode'], value: 'workspace-write' },
    { op: 'set', path: ['subagents', 'codex', 'defaultModel'], value: 'gpt-5.1' },
    { op: 'set', path: ['subagents', 'codex', 'models'], value: [{ id: 'gpt-5.1', efforts: ['low', 'high'], defaultEffort: 'high' }] },
  ])
  await page.update()
  assert.match(pageText(renderer), /saved/)
  assert.equal(saveButton(renderer), undefined)
})

test('委派提示词开关：缺省即开启、显式 false 才渲染为关、只在变化时写入', async () => {
  // 宿主快照完全没有 delegation 键（旧 profile）：默认开启，不产生任何写入。
  const plain = await mountPage()
  assert.equal(byId(plain.renderer, 'bs-delegation-prompt').props['aria-checked'], true)
  assert.equal(saveButton(plain.renderer), undefined)

  // 显式 false 渲染为关，切回开启写出一个 set 操作。
  const off = await mountPage({ form: { value: { ...READY, delegation: { prompt: false } } } })
  const renderer = off.renderer
  assert.equal(byId(renderer, 'bs-delegation-prompt').props['aria-checked'], false)
  await off.run(async () => { byId(renderer, 'bs-delegation-prompt').props.onClick() })
  assert.equal(byId(renderer, 'bs-delegation-prompt').props['aria-checked'], true)
  await off.run(async () => { await saveButton(renderer).props.onClick() })
  assert.deepEqual(off.controller.calls[0].ops, [{ op: 'set', path: ['delegation', 'prompt'], value: true }])

  // 非布尔垃圾值同样按默认（开启）渲染，不显示为关闭。
  const junk = await mountPage({ form: { value: { ...READY, delegation: { prompt: 'off' } } } })
  assert.equal(byId(junk.renderer, 'bs-delegation-prompt').props['aria-checked'], true)
})

test('saving 与 conflict：挂起态、false 回退宿主值、抛错保留草稿', async () => {
  // 挂起：按钮显示 saving 且禁用，宿主接受后 revision 前进。
  const pending = makeForm({ behavior: 'manual' })
  const page = await mountPage({ controller: pending })
  const renderer = page.renderer
  await page.run(async () => { byId(renderer, 'bs-child-exit-guard').props.onClick() })
  await page.run(async () => { saveButton(renderer).props.onClick() })
  assert.equal(textOf(saveButton(renderer).props.children), 'saving')
  assert.equal(saveButton(renderer).props.disabled, true)
  assert.equal(byId(renderer, 'bs-child-exit-guard').props.disabled, true)
  await page.run(async () => { pending.finish(true) })
  await page.update()
  assert.equal(pending.getSnapshot().revision, 2)
  assert.match(pageText(renderer), /saved/)

  // false：宿主拒绝 → 回退宿主值 + warn，且不再可保存。
  const refusing = makeForm({ behavior: 'refuse' })
  const refused = await mountPage({ controller: refusing })
  const back = refused.renderer
  await refused.run(async () => { byId(back, 'bs-child-exit-guard').props.onClick() })
  await refused.run(async () => { saveButton(back).props.onClick() })
  await refused.update()
  assert.equal(refusing.calls.length, 1)
  assert.equal(byId(back, 'bs-child-exit-guard').props['aria-checked'], false)
  assert.match(pageText(back), /conflict/)
  assert.equal(saveButton(back), undefined)

  // 抛错：保留草稿、显示失败详情、可再次保存。
  const failing = makeForm({ behavior: 'reject' })
  const failed = await mountPage({ controller: failing })
  const kept = failed.renderer
  await failed.run(async () => { byId(kept, 'bs-child-exit-guard').props.onClick() })
  await failed.run(async () => { saveButton(kept).props.onClick() })
  await failed.update()
  assert.match(pageText(kept), /saveFailed/)
  assert.match(pageText(kept), /transport down/)
  assert.equal(byId(kept, 'bs-child-exit-guard').props['aria-checked'], true)
  assert.equal(saveButton(kept).props.disabled, false)
})

test('模型 effort 关联与启用校验：缓冲保住逗号、失配清空、缺项阻止保存', async () => {
  const page = await mountPage()
  const renderer = page.renderer

  // effort 文本缓冲：未输完的逗号不被吃掉；默认 effort 失配即清空。
  await page.run(async () => { setControlValue(byLabel(renderer, 'modelEffortsPlaceholder 1'), 'low, mid, ') })
  assert.equal(byLabel(renderer, 'modelEffortsPlaceholder 1').props.value, 'low, mid, ')
  assert.equal(byLabel(renderer, 'modelDefaultEffort 1').props.value, '')
  assert.deepEqual(optionsOf(byLabel(renderer, 'modelDefaultEffort 1')), ['', 'low', 'mid'])

  // 启用的后端缺默认 effort → 阻止保存并点明后端。
  assert.equal(saveButton(renderer).props.disabled, true)
  assert.match(pageText(renderer), /invalidDefaultEffort.*codexTitle/)

  // 选定默认 effort 后可保存。
  await page.run(async () => { setControlValue(byLabel(renderer, 'modelDefaultEffort 1'), 'mid') })
  assert.equal(saveButton(renderer).props.disabled, false)
  await page.run(async () => { saveButton(renderer).props.onClick() })
  assert.deepEqual(page.controller.calls[0].ops, [{
    op: 'set',
    path: ['subagents', 'codex', 'models'],
    value: [{ id: 'gpt-5', efforts: ['low', 'mid'], defaultEffort: 'mid' }],
  }])

  // 清空默认模型 / 删掉全部模型：都阻止保存并给出明确原因。
  await page.run(async () => { setControlValue(byId(renderer, 'bs-codex-default-model'), '') })
  assert.equal(saveButton(renderer).props.disabled, true)
  assert.match(pageText(renderer), /invalidDefaultModel/)
  await page.run(async () => { byLabel(renderer, 'modelRemove').props.onClick() })
  assert.equal(saveButton(renderer).props.disabled, true)
  assert.match(pageText(renderer), /invalidNoModels/)
})

test('模型行缓冲：删除上一行后剩余行显示自己的 efforts（同 index 复用）', async () => {
  const TWO_MODELS = {
    ...READY,
    subagents: {
      ...READY.subagents,
      codex: {
        ...READY.subagents.codex,
        defaultModel: 'a',
        models: [
          { id: 'a', efforts: ['low', 'high'], defaultEffort: 'high' },
          { id: 'b', efforts: ['medium', 'max'], defaultEffort: 'max' },
        ],
      },
    },
  };
  const page = await mountPage({ form: { value: TWO_MODELS } })
  const renderer = page.renderer
  await page.run(async () => {})
  assert.equal(byLabel(renderer, 'modelIdPlaceholder 1').props.value, 'a')
  assert.equal(byLabel(renderer, 'modelEffortsPlaceholder 1').props.value, 'low, high')
  assert.equal(byLabel(renderer, 'modelEffortsPlaceholder 2').props.value, 'medium, max')

  // Remove "a"; "b" moves into index 0 and reuses the component instance.
  await page.run(async () => { byLabel(renderer, 'modelRemove').props.onClick() })
  assert.equal(byLabel(renderer, 'modelIdPlaceholder 1').props.value, 'b')
  assert.equal(byLabel(renderer, 'modelEffortsPlaceholder 1').props.value, 'medium, max', 'stale effort text must be resynced')
  assert.deepEqual(optionsOf(byLabel(renderer, 'modelDefaultEffort 1')), ['', 'medium', 'max'])
})

test('模型行缓冲：宿主 revision 外部更新后 effort 文本同步，不保存陈旧值', async () => {
  const TWO_MODELS = {
    ...READY,
    subagents: {
      ...READY.subagents,
      codex: {
        ...READY.subagents.codex,
        defaultModel: 'a',
        models: [{ id: 'a', efforts: ['low', 'high'], defaultEffort: 'high' }],
      },
    },
  };
  const page = await mountPage({ form: { value: TWO_MODELS } })
  const renderer = page.renderer
  await page.run(async () => {})
  assert.equal(byLabel(renderer, 'modelEffortsPlaceholder 1').props.value, 'low, high')

  page.controller.replace({
    ...TWO_MODELS,
    subagents: {
      ...TWO_MODELS.subagents,
      codex: {
        ...TWO_MODELS.subagents.codex,
        models: [{ id: 'a', efforts: ['medium', 'max'], defaultEffort: 'medium' }],
      },
    },
  })
  await page.update()
  assert.equal(byLabel(renderer, 'modelEffortsPlaceholder 1').props.value, 'medium, max', 'external revision must resync the buffer')
  assert.deepEqual(optionsOf(byLabel(renderer, 'modelDefaultEffort 1')), ['', 'medium', 'max'])
})

test('capabilities 失败：降级提示但保存仍可用', async () => {
  const restore = useFetch(async () => { throw new Error('offline') })
  try {
    const page = await mountPage()
    const renderer = page.renderer
    await page.run(async () => {})
    assert.match(pageText(renderer), /capabilitiesError/)

    await page.run(async () => { byId(renderer, 'bs-child-exit-guard').props.onClick() })
    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.equal(page.controller.calls.length, 1)
  } finally {
    restore()
  }
})

test('自动发现：按 cli 请求、保留已有模型、只追加新 id、空默认模型自动补上', async () => {
  const requests = []
  const discovery = {
    codex: {
      models: [
        { id: 'gpt-5', efforts: ['low'], defaultEffort: 'low' },
        { id: 'gpt-5.1', efforts: ['low', 'high'], defaultEffort: 'high' },
      ],
      source: 'codex-catalog',
      error: null,
    },
    claude: {
      models: [{ id: 'claude-opus-5-5', efforts: ['low', 'high'], defaultEffort: 'high' }],
      source: 'claude-models-api',
      error: null,
    },
  }
  const restore = useFetch(async (url) => {
    const target = String(url)
    if (target.startsWith('/better-subagent/api/models')) {
      requests.push(target)
      const cli = new URL('http://dsh.internal' + target).searchParams.get('cli')
      return { ok: true, status: 200, json: async () => ({ ok: true, value: discovery[cli] }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  try {
    const page = await mountPage()
    const renderer = page.renderer

    await page.run(async () => { await byId(renderer, 'bs-codex-discover').props.onClick() })
    // 已存在的 gpt-5 保留宿主值（efforts 未被发现结果覆盖），新 id 追加。
    assert.equal(byLabel(renderer, 'modelIdPlaceholder 1').props.value, 'gpt-5')
    assert.equal(byLabel(renderer, 'modelIdPlaceholder 2').props.value, 'gpt-5.1')
    assert.deepEqual(optionsOf(byId(renderer, 'bs-codex-default-model')), ['', 'gpt-5', 'gpt-5.1'])
    assert.equal(byId(renderer, 'bs-codex-default-model').props.value, 'gpt-5')

    await page.run(async () => byId(renderer, 'bs-claude-enabled').props.onClick())
    await page.run(async () => { await byId(renderer, 'bs-claude-discover').props.onClick() })
    assert.equal(byLabel(renderer, 'modelIdPlaceholder 1').props.value, 'gpt-5')
    assert.equal(byId(renderer, 'bs-claude-default-model').props.value, 'claude-opus-5-5')
    assert.match(pageText(renderer), /discoverDone/)
    assert.deepEqual(requests, ['/better-subagent/api/models?cli=codex', '/better-subagent/api/models?cli=claude'])

    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.deepEqual(page.controller.calls[0].ops, [
      {
        op: 'set',
        path: ['subagents', 'codex', 'models'],
        value: [
          { id: 'gpt-5', efforts: ['low', 'high'], defaultEffort: 'high' },
          { id: 'gpt-5.1', efforts: ['low', 'high'], defaultEffort: 'high' },
        ],
      },
      {
        op: 'set',
        path: ['subagents', 'claude', 'enabled'],
        value: true,
      },
      {
        op: 'set',
        path: ['subagents', 'claude', 'defaultModel'],
        value: 'claude-opus-5-5',
      },
      {
        op: 'set',
        path: ['subagents', 'claude', 'models'],
        value: [{ id: 'claude-opus-5-5', efforts: ['low', 'high'], defaultEffort: 'high' }],
      },
    ])
  } finally {
    restore()
  }
})

test('自动发现失败：显示宿主给的 code（含 HTTP 状态），不改草稿', async () => {
  const restore = useFetch(async (url) => {
    const target = String(url)
    if (target.startsWith('/better-subagent/api/models')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          value: { models: [], source: null, error: { code: 'unauthorized', status: 401 } },
        }),
      }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  try {
    const page = await mountPage()
    const renderer = page.renderer
    await page.run(async () => { await byId(renderer, 'bs-codex-discover').props.onClick() })
    assert.match(pageText(renderer), /discoverFailed/)
    assert.match(pageText(renderer), /discoverReasonUnauthorized/)
    assert.match(pageText(renderer), /401/)
    assert.equal(saveButton(renderer), undefined)
    assert.deepEqual(page.controller.calls, [])
  } finally {
    restore()
  }
})

// ── 子代理模型分档 ───────────────────────────────────────────────────────

const ROUTES = {
  enabled: true,
  routes: [
    { provider: 'deepseek-official', model: 'deepseek-flash', efforts: ['low', 'max'], defaultEffort: 'max' },
    { provider: 'poke2api', model: 'gpt-6.1-sol', efforts: [], defaultEffort: '' },
  ],
}

/** 假 fetch：/better-subagent/api/routes 走 routes 处理器，其余回探针数据。 */
function useRoutes(routes) {
  const requests = []
  const restore = useFetch(async (url) => {
    const target = String(url)
    if (target.startsWith('/better-subagent/api/routes')) {
      requests.push(target)
      if (routes instanceof Error) throw routes
      return { ok: true, status: 200, json: async () => ({ ok: true, value: routes }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  return { requests, restore }
}

const labelsOf = (node) => optionItems(node).map((option) => textOf(option.findByProps({ className: 'bs-optionLabel' }).props.children))

test('模型分档：候选来自白名单，effort 有列表时下拉、否则文本，保存整档写入', async () => {
  const { requests, restore } = useRoutes(ROUTES)
  try {
    const page = await mountPage()
    const renderer = page.renderer
    await page.run(async () => {})
    assert.deepEqual(requests, ['/better-subagent/api/routes'])
    assert.match(pageText(renderer), /tierFast|tierQuality/)
    assert.doesNotMatch(pageText(renderer), /tiersInactive|routesError/)

    const fast = byId(renderer, 'bs-tier-fast-route')
    assert.deepEqual(optionsOf(fast), ['', 'deepseek-official/deepseek-flash', 'poke2api/gpt-6.1-sol'])
    assert.deepEqual(labelsOf(fast), ['tierInherit', 'deepseek-official / deepseek-flash', 'poke2api / gpt-6.1-sol'])
    assert.equal(fast.props.value, '')
    // 沿用父会话路由时 effort 无意义：不渲染。
    assert.equal(byId(renderer, 'bs-tier-fast-effort'), undefined)

    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-fast-route'), 'deepseek-official/deepseek-flash') })
    const effort = byId(renderer, 'bs-tier-fast-effort')
    assert.equal(effort.props.role, 'combobox')
    assert.deepEqual(optionsOf(effort), ['', 'low', 'max'])
    assert.deepEqual(labelsOf(effort), ['tierEffortDefault', 'low', 'max'])
    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-fast-effort'), 'max') })

    // 路由没有 effort 列表：文本输入。
    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-quality-route'), 'poke2api/gpt-6.1-sol') })
    assert.equal(byId(renderer, 'bs-tier-quality-effort').type, 'input')
    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-quality-effort'), ' high ') })

    assert.equal(saveButton(renderer).props.disabled, false)
    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.deepEqual(page.controller.calls[0].ops, [
      { op: 'set', path: ['tiers', 'fast'], value: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'max' } },
      { op: 'set', path: ['tiers', 'quality'], value: { provider: 'poke2api', model: 'gpt-6.1-sol', reasoningEffort: 'high' } },
    ])

    // 换路由清空 effort；改回沿用父会话路由整档清空。
    await page.update()
    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-fast-route'), 'poke2api/gpt-6.1-sol') })
    assert.equal(byId(renderer, 'bs-tier-fast-effort').props.value, '')
    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-fast-route'), '') })
    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.deepEqual(page.controller.calls[1].ops, [
      { op: 'set', path: ['tiers', 'fast'], value: { provider: '', model: '', reasoningEffort: '' } },
    ])
  } finally {
    restore()
  }
})

test('模型分档：已存路由不在白名单 → 标注并阻止保存；改回沿用后可保存', async () => {
  const { restore } = useRoutes(ROUTES)
  try {
    const value = { ...READY, tiers: { fast: { provider: 'old', model: 'gone', reasoningEffort: 'high' } } }
    const page = await mountPage({ form: { value } })
    const renderer = page.renderer
    await page.run(async () => {})

    const fast = byId(renderer, 'bs-tier-fast-route')
    assert.equal(fast.props.value, 'old/gone')
    assert.deepEqual(optionsOf(fast), ['', 'deepseek-official/deepseek-flash', 'poke2api/gpt-6.1-sol', 'old/gone'])
    assert.match(labelsOf(fast)[3], /tierOffList.*old \/ gone/)
    // 未知路由没有 effort 列表：文本输入保留旧值。
    assert.equal(byId(renderer, 'bs-tier-fast-effort').props.value, 'high')

    await page.run(async () => { byId(renderer, 'bs-child-exit-guard').props.onClick() })
    assert.equal(saveButton(renderer).props.disabled, true)
    assert.match(pageText(renderer), /invalidTierRoute.*tierFast/)
    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.deepEqual(page.controller.calls, [])

    await page.run(async () => { setControlValue(byId(renderer, 'bs-tier-fast-route'), '') })
    assert.equal(saveButton(renderer).props.disabled, false)
    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.deepEqual(page.controller.calls[0].ops, [
      { op: 'set', path: ['childExitGuard'], value: true },
      { op: 'set', path: ['tiers', 'fast'], value: { provider: '', model: '', reasoningEffort: '' } },
    ])
  } finally {
    restore()
  }
})

test('模型分档：白名单关闭/为空给出提醒；读取失败降级但不阻止保存', async () => {
  for (const routes of [{ enabled: false, routes: ROUTES.routes }, { enabled: true, routes: [] }]) {
    const { restore } = useRoutes(routes)
    try {
      const page = await mountPage()
      await page.run(async () => {})
      assert.match(pageText(page.renderer), /tiersInactive/)
    } finally {
      restore()
    }
  }

  const { restore } = useRoutes(new Error('offline'))
  try {
    const value = { ...READY, tiers: { fast: { provider: 'old', model: 'gone', reasoningEffort: '' } } }
    const page = await mountPage({ form: { value } })
    const renderer = page.renderer
    await page.run(async () => {})
    assert.match(pageText(renderer), /routesError/)
    // 白名单未读到：已存路由原样保留为选项，不标注、不阻止保存。
    const fast = byId(renderer, 'bs-tier-fast-route')
    assert.deepEqual(optionsOf(fast), ['', 'old/gone'])
    assert.deepEqual(labelsOf(fast), ['tierInherit', 'old / gone'])
    await page.run(async () => { byId(renderer, 'bs-child-exit-guard').props.onClick() })
    await page.run(async () => { await saveButton(renderer).props.onClick() })
    assert.deepEqual(page.controller.calls[0].ops, [{ op: 'set', path: ['childExitGuard'], value: true }])
  } finally {
    restore()
  }
})

test('页签：键盘循环、ARIA关联、切换保留未保存输入，只读允许导航', async () => {
  const page = await mountPage({ form: { writable: false } })
  const renderer = page.renderer
  const tab = (id) => byId(renderer, 'bs-settings-tab-' + id)
  assert.equal(tab('general').props['aria-selected'], true)
  assert.equal(tab('cli').props.tabIndex, -1)
  let prevented = false
  await page.run(async () => tab('general').props.onKeyDown({ key: 'End', preventDefault() { prevented = true } }))
  assert.equal(prevented, true)
  assert.equal(tab('connection').props['aria-selected'], true)
  assert.equal(byId(renderer, tab('connection').props['aria-controls']).props.hidden, false)
  await page.run(async () => tab('connection').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} }))
  assert.equal(tab('general').props['aria-selected'], true)
  assert.equal(byId(renderer, 'bs-trusted-hosts').props.disabled, true)
  assert.deepEqual(page.controller.calls, [])

  const editable = await mountPage()
  const tree = editable.renderer
  await editable.run(async () => setControlValue(byLabel(tree, 'modelEffortsPlaceholder 1'), 'low, high, '))
  await editable.run(async () => byId(tree, 'bs-settings-tab-cli').props.onClick())
  await editable.run(async () => byId(tree, 'bs-backend-tab-claude').props.onClick())
  assert.equal(byId(tree, 'bs-backend-panel-codex').props.hidden, true)
  await editable.run(async () => byId(tree, 'bs-backend-tab-codex').props.onClick())
  assert.equal(byLabel(tree, 'modelEffortsPlaceholder 1').props.value, 'low, high, ')
})

test('连接：受信主机完整编辑、保留换行、验证格式并原子保存', async () => {
  const page = await mountPage()
  const renderer = page.renderer
  const text = 'proxy.example.com:8443\nlocalhost\nproxy.example.com:8443\n'
  await page.run(async () => setControlValue(byId(renderer, 'bs-trusted-hosts'), text))
  assert.equal(byId(renderer, 'bs-trusted-hosts').props.value, text)
  assert.equal(saveButton(renderer).props.disabled, false)
  await page.run(async () => saveButton(renderer).props.onClick())
  assert.deepEqual(page.controller.calls[0].ops, [{ op: 'set', path: ['trustedHosts'], value: ['proxy.example.com:8443', 'localhost'] }])
  await page.update()
  for (const value of ["https://proxy.example.com/path","proxy\\path","user@proxy.example.com","proxy.example.com:99999","proxy.example.com/path"]) {
    await page.run(async () => byId(renderer, 'bs-trusted-hosts').props.onChange({ target: { value } }))
    assert.equal(saveButton(renderer).props.disabled, true, value)
    assert.match(pageText(renderer), /invalidTrustedHosts/)
  }
  const error = byType(renderer, 'button').find((node) => node.props.className?.includes('bs-errorLink'))
  await page.run(async () => error.props.onClick())
  assert.equal(byId(renderer, 'bs-settings-panel-connection').props.hidden, false)
})

test('模型默认依赖：重命名跟随默认、移除默认清空、禁用后依赖项不渲染且可保存', async () => {
  const page = await mountPage()
  const renderer = page.renderer
  await page.run(async () => setControlValue(byLabel(renderer, 'modelIdPlaceholder 1'), 'renamed-model'))
  assert.equal(byId(renderer, 'bs-codex-default-model').props.value, 'renamed-model')
  assert.equal(saveButton(renderer).props.disabled, false)
  await page.run(async () => byLabel(renderer, 'modelRemove').props.onClick())
  assert.equal(byId(renderer, 'bs-codex-default-model').props.value, '')
  assert.equal(byId(renderer, 'bs-codex-default-model').props.disabled, true)
  assert.equal(saveButton(renderer).props.disabled, true)
  await page.run(async () => byId(renderer, 'bs-codex-enabled').props.onClick())
  assert.equal(saveButton(renderer).props.disabled, false)
  assert.equal(byId(renderer, 'bs-codex-permission'), undefined)
  assert.equal(byId(renderer, 'bs-codex-executable'), undefined)
})

test('CLI发现：未保存路径/Profile禁用发现，保存后探针自动刷新', async () => {
  let probes = 0
  const restore = useFetch(async (url) => {
    if (String(url).includes('/capabilities')) probes++
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  try {
    const page = await mountPage()
    const renderer = page.renderer
    assert.equal(probes, 1)
    await page.run(async () => setControlValue(byId(renderer, 'bs-codex-profile'), 'custom-profile'))
    assert.equal(byId(renderer, 'bs-codex-discover').props.disabled, true)
    assert.match(pageText(renderer), /saveBeforeDiscover/)
    await page.run(async () => saveButton(renderer).props.onClick())
    await page.update()
    assert.equal(probes, 2)
    assert.equal(byId(renderer, 'bs-codex-discover').props.disabled, false)
    assert.equal(byId(renderer, 'bs-codex-profile').props.value, 'custom-profile')
  } finally { restore() }
})

test('模型分档：已保存但失效的effort阻止保存，点击错误进入分档页', async () => {
  const { restore } = useRoutes(ROUTES)
  try {
    const value = { ...READY, tiers: { fast: { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'removed' } } }
    const page = await mountPage({ form: { value } })
    const renderer = page.renderer
    assert.equal(byId(renderer, 'bs-tier-fast-effort').props['aria-invalid'], true)
    await page.run(async () => byId(renderer, 'bs-child-exit-guard').props.onClick())
    assert.equal(saveButton(renderer).props.disabled, true)
    assert.match(pageText(renderer), /invalidTierEffort/)
    const error = byType(renderer, 'button').find((node) => node.props.className?.includes('bs-errorLink'))
    await page.run(async () => error.props.onClick())
    assert.equal(byId(renderer, 'bs-settings-panel-tiers').props.hidden, false)
    await page.run(async () => setControlValue(byId(renderer, 'bs-tier-fast-effort'), 'max'))
    assert.equal(saveButton(renderer).props.disabled, false)
  } finally { restore() }
})

test('发现中的放弃改动：迟到响应不重新写回模型草稿', async () => {
  let resolveDiscovery
  const restore = useFetch(async (url) => {
    if (String(url).includes('/models?')) return await new Promise((resolve) => { resolveDiscovery = resolve })
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  try {
    const page = await mountPage()
    const renderer = page.renderer
    let pending
    await page.run(async () => { pending = byId(renderer, 'bs-codex-discover').props.onClick() })
    await page.run(async () => byId(renderer, 'bs-child-exit-guard').props.onClick())
    const reset = byType(renderer, 'button').find((node) => textOf(node) === 'reset')
    await page.run(async () => reset.props.onClick())
    await page.run(async () => {
      resolveDiscovery({ ok: true, status: 200, json: async () => ({ ok: true, value: { models: [{ id: 'late', efforts: ['high'], defaultEffort: 'high' }] } }) })
      await pending
    })
    assert.equal(byLabel(renderer, 'modelIdPlaceholder 2'), undefined)
    assert.equal(saveButton(renderer), undefined)
    assert.deepEqual(page.controller.calls, [])
  } finally { restore() }
})

test('发现依赖改变：请求期间修改 executable 或 profile 丢弃旧目录', async () => {
  for (const [id, value] of [['bs-codex-executable', '/custom/other-codex'], ['bs-codex-profile', 'another-profile']]) {
    let resolveDiscovery
    const restore = useFetch(async (url) => {
      if (String(url).includes('/models?')) return await new Promise((resolve) => { resolveDiscovery = resolve })
      return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
    })
    try {
      const page = await mountPage()
      const renderer = page.renderer
      let pending
      await page.run(async () => { pending = byId(renderer, 'bs-codex-discover').props.onClick() })
      await page.run(async () => byId(renderer, id).props.onChange({ target: { value } }))
      await page.run(async () => {
        resolveDiscovery({ ok: true, status: 200, json: async () => ({ ok: true, value: { models: [{ id: 'old-executable-model', efforts: ['high'], defaultEffort: 'high' }] } }) })
        await pending
      })
      assert.equal(byLabel(renderer, 'modelIdPlaceholder 2'), undefined)
      assert.equal(textOf(byId(renderer, 'bs-codex-discover')), 'discover')
      assert.equal(byId(renderer, id).props.value, value)
    } finally { restore() }
  }
})

test('发现失败遇到新 revision：结束旧加载状态，允许立即重试', async () => {
  let rejectDiscovery
  const restore = useFetch(async (url) => {
    if (String(url).includes('/models?')) return await new Promise((resolve, reject) => { rejectDiscovery = reject })
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  try {
    const page = await mountPage()
    const renderer = page.renderer
    let pending
    await page.run(async () => { pending = byId(renderer, 'bs-codex-discover').props.onClick() })
    await page.run(async () => byId(renderer, 'bs-child-exit-guard').props.onClick())
    await page.run(async () => saveButton(renderer).props.onClick())
    await page.update()
    await page.run(async () => { rejectDiscovery(new Error('network error')); await pending })
    assert.equal(byId(renderer, 'bs-codex-discover').props.disabled, false)
    assert.equal(textOf(byId(renderer, 'bs-codex-discover')), 'discover')
    assert.doesNotMatch(pageText(renderer), /discoverFailed/)
  } finally { restore() }
})

test('发现请求所有权：放弃后重试，旧结果不能清除新请求加载状态', async () => {
  const resolvers = []
  const restore = useFetch(async (url) => {
    if (String(url).includes('/models?')) return await new Promise((resolve) => { resolvers.push(resolve) })
    return { ok: true, status: 200, json: async () => ({ ok: true, value: CAPABILITIES }) }
  })
  try {
    const page = await mountPage()
    const renderer = page.renderer
    let first, second
    await page.run(async () => { first = byId(renderer, 'bs-codex-discover').props.onClick() })
    await page.run(async () => byId(renderer, 'bs-child-exit-guard').props.onClick())
    await page.run(async () => byType(renderer, 'button').find((node) => textOf(node) === 'reset').props.onClick())
    await page.run(async () => { second = byId(renderer, 'bs-codex-discover').props.onClick() })
    const response = (id) => ({ ok: true, status: 200, json: async () => ({ ok: true, value: { models: [{ id, efforts: ['high'], defaultEffort: 'high' }] } }) })
    await page.run(async () => { resolvers[0](response('stale')); await first })
    assert.equal(textOf(byId(renderer, 'bs-codex-discover')), 'discovering')
    assert.equal(byId(renderer, 'bs-codex-discover').props.disabled, true)
    assert.equal(byLabel(renderer, 'modelIdPlaceholder 2'), undefined)
    await page.run(async () => { resolvers[1](response('current')); await second })
    assert.equal(byLabel(renderer, 'modelIdPlaceholder 2').props.value, 'current')
    assert.equal(byId(renderer, 'bs-codex-discover').props.disabled, false)
  } finally { restore() }
})

function keyEvent(key) {
  return { key, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true } }
}

test('自绘下拉：键盘预览不写草稿，Esc只关闭弹层，提交与首字母定位有效', async () => {
  const page = await mountPage()
  const renderer = page.renderer
  const control = () => byId(renderer, 'bs-codex-permission')
  assert.equal(control().props.role, 'combobox')
  assert.equal(control().props['aria-expanded'], false)
  await page.run(async () => control().props.onKeyDown(keyEvent('ArrowDown')))
  assert.equal(control().props['aria-expanded'], true)
  assert.equal(byId(renderer, control().props['aria-controls']).props.hidden, false)
  await page.run(async () => control().props.onKeyDown(keyEvent('End')))
  assert.equal(byId(renderer, control().props['aria-activedescendant']).props['data-value'], 'danger-full-access')
  assert.equal(control().props.value, 'read-only', 'keyboard preview keeps the saved selection')
  assert.equal(saveButton(renderer), undefined)
  const escape = keyEvent('Escape')
  await page.run(async () => control().props.onKeyDown(escape))
  assert.equal(escape.defaultPrevented, true)
  assert.equal(escape.stopped, true, 'escape must not close the host settings modal')
  assert.equal(control().props['aria-expanded'], false)
  assert.equal(control().props.value, 'read-only')
  await page.run(async () => control().props.onKeyDown(keyEvent('w')))
  assert.equal(byId(renderer, control().props['aria-activedescendant']).props['data-value'], 'workspace-write')
  await page.run(async () => control().props.onKeyDown(keyEvent('Enter')))
  assert.equal(control().props.value, 'workspace-write')
  assert.equal(control().props['aria-expanded'], false)
  assert.equal(saveButton(renderer).props.disabled, false)
  await page.run(async () => control().props.onKeyDown(keyEvent(' ')))
  await page.run(async () => control().props.onKeyDown(keyEvent('Home')))
  await page.run(async () => control().props.onKeyDown(keyEvent('Enter')))
  assert.equal(saveButton(renderer), undefined, 'returning to the saved value removes all save actions')
  assert.deepEqual(page.controller.calls, [])
})

test('保存状态：无差异不渲染保存栏，dirty/busy与真实快照一致，成功反馈独立', async () => {
  const pending = makeForm({ behavior: 'manual' })
  const page = await mountPage({ controller: pending })
  const renderer = page.renderer
  const root = () => renderer.root.findAll((node) => host(node) && node.props['data-settings-dirty'] !== undefined)[0]
  const footer = () => renderer.root.findAll((node) => host(node) && node.props.className === 'bs-footer')[0]
  assert.equal(root().props['data-settings-dirty'], false)
  assert.equal(root().props['data-settings-busy'], false)
  assert.equal(footer(), undefined)
  await page.run(async () => byId(renderer, 'bs-child-exit-guard').props.onClick())
  assert.equal(root().props['data-settings-dirty'], true)
  assert.equal(footer().children[0].props.className, 'bs-status')
  assert.equal(textOf(footer().children[1]), 'reset')
  assert.equal(footer().children[2].props['data-variant'], 'primary', 'Save comes last in DOM and keyboard order')
  await page.run(async () => saveButton(renderer).props.onClick())
  assert.equal(root().props['data-settings-busy'], true)
  assert.equal(saveButton(renderer).props['aria-busy'], true)
  await page.run(async () => pending.finish(true))
  await page.update()
  assert.equal(root().props['data-settings-dirty'], false)
  assert.equal(root().props['data-settings-busy'], false)
  assert.equal(footer(), undefined)
  assert.match(pageText(renderer), /saved/)
  assert.ok(renderer.root.findAll((node) => host(node) && node.props.className === 'bs-feedback').length)
})

test('高级与依赖：默认折叠并给出非默认摘要，停用CLI保留配置，诊断使用已保存路径', async () => {
  const page = await mountPage()
  const renderer = page.renderer
  const advanced = byType(renderer, 'details').filter((node) => node.props.className === 'bs-advanced')
  assert.equal(advanced.length, 2)
  assert.ok(advanced.every((node) => node.props.open !== true))
  assert.match(textOf(advanced[0].findByType('summary')), /expertSettings.*expertCurrent/)
  let restoredFocus = false
  const target = { open: true, querySelector: () => ({ focus() { restoredFocus = true } }) }
  const escape = { ...keyEvent('Escape'), currentTarget: target }
  await page.run(async () => advanced[0].props.onKeyDown(escape))
  assert.equal(escape.defaultPrevented, true)
  assert.equal(escape.stopped, true, 'advanced disclosure closes before the host modal')
  assert.equal(target.open, false)
  assert.equal(restoredFocus, true)
  const handled = { ...keyEvent('Escape'), defaultPrevented: true, currentTarget: { ...target, open: true } }
  await page.run(async () => advanced[0].props.onKeyDown(handled))
  assert.equal(handled.currentTarget.open, true, 'inner combobox handles Escape before the outer disclosure')
  assert.equal(byId(renderer, 'bs-claude-permission'), undefined)
  await page.run(async () => setControlValue(byId(renderer, 'bs-codex-executable'), '/draft/codex'))
  const diagnostics = byId(renderer, 'bs-settings-panel-connection')
  assert.match(textOf(diagnostics), /detected.*opt.*bin.*codex/)
  assert.doesNotMatch(textOf(diagnostics), /draft[/]codex/)
  assert.match(pageText(renderer), /saveBeforeDiscover/)
  await page.run(async () => byId(renderer, 'bs-codex-enabled').props.onClick())
  assert.equal(byId(renderer, 'bs-codex-executable'), undefined)
  await page.run(async () => byId(renderer, 'bs-codex-enabled').props.onClick())
  assert.equal(byId(renderer, 'bs-codex-executable').props.value, '/draft/codex')
  const overview = byId(renderer, 'bs-open-codex')
  assert.equal(overview.type, 'button')
  assert.match(textOf(overview), /modelCount.*1.*gpt-5/)
  assert.ok(overview.findByProps({ className: 'bs-overviewGlyph' }))
})

test('放弃大量改动：需要第二次点击，继续编辑后确认复位', async () => {
  const page = await mountPage()
  const renderer = page.renderer
  const reset = () => byType(renderer, 'button').find((node) => ['reset', 'resetConfirm'].includes(textOf(node)))
  await page.run(async () => {
    byId(renderer, 'bs-child-exit-guard').props.onClick()
    byId(renderer, 'bs-scope-global').props.onClick()
    setControlValue(byId(renderer, 'bs-codex-profile'), 'another')
    setControlValue(byId(renderer, 'bs-codex-permission'), 'workspace-write')
  })
  await page.run(async () => reset().props.onClick())
  assert.equal(textOf(reset()), 'resetConfirm')
  assert.equal(byId(renderer, 'bs-child-exit-guard').props['aria-checked'], true)
  await page.run(async () => setControlValue(byId(renderer, 'bs-codex-profile'), 'edited-again'))
  assert.equal(textOf(reset()), 'reset')
  await page.run(async () => reset().props.onClick())
  await page.run(async () => reset().props.onClick())
  assert.equal(saveButton(renderer), undefined)
  assert.equal(byId(renderer, 'bs-child-exit-guard').props['aria-checked'], false)
  assert.deepEqual(page.controller.calls, [])
})
