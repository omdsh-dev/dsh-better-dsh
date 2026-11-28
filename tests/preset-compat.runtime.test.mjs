/**
 * Real-host preset compatibility: save two sessions, stop the host, then resume
 * their original ids from the same throwaway profile (no model calls or CLI).
 * DSH_PACKAGE_ROOT opts in; APOLLO_PLUGIN_SOURCE_ROOT is handled by prepareProfile.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { bootProfile, hostPackage, prepareProfile } from '../scripts/lib/profile.mjs'

const enabled = process.env.DSH_PACKAGE_ROOT !== undefined
const modelSelection = { provider: 'preset-compat-no-model', model: 'never-called' }
const presets = [
  ['eng', '工程模式(旧版，不建议使用)'],
  ['eng-ptc', '工程(PTC)模式'],
]

const PATCH = [
  { id: 'headless-startup', disabled: true },
  { id: 'headless-runner', disabled: true },
  { id: 'workflow-ptc', disabled: true },
  { id: 'tool-workflow', disabled: true },
  { id: 'credentials', disabled: false, config: { watch: false } },
  { insert: [
    { id: 'agent-preset-registry', name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'eng-ptc' } },
    { id: 'workspace', name: '@deepseek-ai/dsh-workspace' },
    { id: 'subagent-model-selection-settings', name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings' },
  ] },
]

// Tool admission resolves a real local model, but this test never starts a turn.
function registerLocalModel(ctx) {
  const model = { provider: modelSelection.provider, id: modelSelection.model, name: modelSelection.model, inputModalities: ['text'], context: { contextWindow: 200000 }, defaultMaxTokens: 64 }
  ctx.llm.registerAdapter([modelSelection.provider], {
    providerInfo: id => ({ id, name: 'Preset compatibility test' }),
    providerRetryPolicy: () => undefined,
    imageRequestPricing: () => undefined,
    listModels: async () => [model],
    resolveModel: async () => model,
  })
}

test('real profile: eng and eng-ptc retain their identity, composition and prompt after host restart', {
  skip: enabled ? false : 'DSH_PACKAGE_ROOT is not set',
  timeout: 60000,
}, async (t) => {
  const info = await prepareProfile({ patch: PATCH, prefix: 'apollo-preset-compat-' })
  let ctx
  try {
    const { renderPrompt } = await import(hostPackage('dsh-system-prompt/lib/index.js'))
    const cwd = join(info.home, 'workspace')
    await mkdir(cwd)
    ctx = await bootProfile(info)
    // eng/eng-ptc carry the standard tool-cordis row; its host service comes from
    // the web-app bundle, which the headless test template omits.
    ctx.provide('cordisInspect', { list: () => [], query: async () => ({}) })
    registerLocalModel(ctx)
    const { ToolStep } = await import(hostPackage('dsh-tools/lib/pipeline.js'))
    const roster = await ctx.agentPresets.list()
    for (const [id, name] of presets) {
      const preset = roster.find((candidate) => candidate.id === id)
      assert.ok(preset, id + ' must remain registered')
      assert.equal(preset.name, name)
      assert.equal(preset.broken, undefined, preset.broken)
    }
    t.diagnostic('registered eng and eng-ptc with their expected display names')

    const saved = []
    for (const [id] of presets) {
      const { agent } = await ctx.agents.create({
        sessionId: randomUUID(),
        meta: { cwd, agentPreset: id },
        agentOptions: modelSelection,
        setup: async (agentCtx) => { await ctx.agentPresets.mount(agentCtx, id) },
      })
      assert.equal(ctx.agentPresets.composedPreset(agent.ctx), id)
      assert.equal(ctx.agentPresets.presetForSession(agent.session), id)
      // A real log-backed user rename materializes nonempty history without a turn.
      const title = 'preset compatibility ' + id + ' ' + randomUUID()
      ctx.sessionTitle.rename(agent.session, title)
      assert.equal(await ctx.sessions.flush(agent.session), true)
      const stored = await ctx.sessionPersistence.stat(agent.id)
      assert.equal(stored.header.id, agent.id)
      assert.equal(stored.header.agentPreset, id)
      assert.equal(stored.header.createdAt, agent.session.header.createdAt)
      saved.push({ id, sessionId: agent.id, header: stored.header, events: agent.session.snapshotEvents(), title })
      t.diagnostic('saved ' + id + ': ' + agent.id + ' (' + agent.session.snapshotEvents().length + ' events)')
    }

    const originalHost = ctx
    await ctx.fiber.dispose()
    ctx = undefined
    // Do not prepare/copy the profile again: this boot must consume stored data.
    ctx = await bootProfile(info)
    // eng/eng-ptc carry the standard tool-cordis row; its host service comes from
    // the web-app bundle, which the headless test template omits.
    ctx.provide('cordisInspect', { list: () => [], query: async () => ({}) })
    registerLocalModel(ctx)
    assert.notEqual(ctx, originalHost)
    assert.equal(ctx.agentPresets.defaultId, 'eng-ptc')
    for (const savedSession of saved) {
      const { id, sessionId, header, events, title } = savedSession
      assert.equal(ctx.agents.get(sessionId), undefined)
      assert.equal(ctx.sessions.get(sessionId), undefined)
      const { agent } = await ctx.agents.resume({
        resumeSessionId: sessionId,
        agentOptions: modelSelection,
        setup: async (agentCtx, restoredAgent) => {
          // Read the restored projection, not the default or a synthetic header.
          const restoredPreset = ctx.agentPresets.presetForSession(restoredAgent.session)
          assert.equal(restoredPreset, id)
          await ctx.agentPresets.mount(agentCtx, restoredPreset)
        },
      })
      assert.equal(agent.id, sessionId)
      assert.deepEqual(agent.session.header, header)
      assert.deepEqual(agent.session.snapshotEvents().slice(0, events.length), events)
      assert.equal(ctx.sessionTitle.get(agent.session).title, title)
      assert.equal(ctx.agentPresets.presetForSession(agent.session), id)
      assert.equal(ctx.agentPresets.composedPreset(agent.ctx), id)

      const signal = new AbortController().signal
      // alpha.3 captures the model step instead of resolving a disposable tool set.
      const toolStep = ToolStep.capture(ctx.tools, agent)
      {
        const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent, modelSelection, toolStep, signal })
        const prompt = renderPrompt({ ...assembly, contexts: [] })
        for (const name of ['eng:mode-instructions', 'better-subagent:delegation']) {
          const sections = assembly.sections.filter((section) => section.name === name)
          assert.equal(sections.length, 1, id + ': one real ' + name + ' section')
          assert.ok(sections[0].text.trim(), id + ': nonempty ' + name + ' section')
          assert.ok(prompt.includes(sections[0].text), id + ': rendered ' + name + ' section')
        }
        assert.match(assembly.sections.find((section) => section.name === 'better-subagent:delegation').text, /wait_subagent/)
        if (id === 'eng-ptc') {
          // The PTC root declares only run_code; its bindings render into the SDK section.
          assert.match(prompt, /wait_subagent/, id + ': wait tool is declared to programs')
        } else {
          assert.ok(toolStep.declarations.some((definition) => definition.name === 'wait_subagent'), id + ': wait tool is available')
        }
      }
      t.diagnostic('resumed ' + sessionId + ' as ' + id + '; stored header/history/title retained; preset mounted and prompt assembled')
    }
  } finally {
    if (ctx) await ctx.fiber.dispose()
    await rm(info.home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
})
