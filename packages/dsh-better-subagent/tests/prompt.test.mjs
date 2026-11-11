/**
 * Prompt ownership tests: the per-Agent sections are registered on the Agent's
 * own scoped systemPrompt, gated by the live config + composed preset, and
 * render delegation/tiers/PTC/guard/catalog from one source.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CHILD_GUARD_ORDER,
  CLI_CATALOG_ORDER,
  DELEGATION_ORDER,
  installPromptSections,
  presetOf,
  renderChildGuard,
  renderCliCatalog,
  renderDelegation,
  renderTier,
  scopeEnabled,
} from '../src/prompt.js'
import { normalizeConfig } from '../src/config.js'

let liveConfig = {}
let composed

/** Build one fake Agent with its own scoped section registry. */
function makeAgent({ preset = 'eng', id = 'agent-1' } = {}) {
  const sections = []
  const agent = {
    id,
    session: { header: { agentPreset: preset } },
    sections,
    ctx: {
      systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
      get: () => undefined,
    },
  }
  return agent
}

/** Fake ctx capturing agent/created and the fake preset registry. */
function makeCtx({ agents = [] } = {}) {
  const handlers = new Map()
  const warnings = []
  const ctx = {
    handlers,
    warnings,
    on: (event, fn) => { handlers.set(event, fn); return () => {} },
    agents: { list: () => agents },
    get: (name) => {
      if (name === 'configEditor') return { entries: () => [{ options: { id: 'dsh-better-subagent' }, fiber: { config: liveConfig } }] }
      if (name === 'agentPresets') return { composedPreset: (agentCtx) => composed ?? agentCtx?.owner }
      return undefined
    },
    logger: { warn: (text) => warnings.push(String(text)) },
  }
  installPromptSections(ctx, {})
  ctx.create = (options) => {
    const agent = makeAgent(options)
    handlers.get('agent/created')({ agent })
    return agent
  }
  return ctx
}

function withConfig(content, preset, run) {
  const previous = liveConfig
  const previousPreset = composed
  liveConfig = content === undefined ? {} : JSON.parse(content)
  composed = preset
  return Promise.resolve().then(run).finally(() => { liveConfig = previous; composed = previousPreset })
}

const section = (agent, name) => agent.sections.find((entry) => entry.name === name)
const textOf = (agent, name) => section(agent, name).text({ agent })

test('sections: unique names, delegation < guard < catalog, non-interpolating render functions', async () => {
  await withConfig('{"subagents":{"global":true,"codex":{"enabled":true,"defaultModel":"m","models":[{"id":"m","efforts":["low"],"defaultEffort":"low"}]}}}', 'eng', async () => {
    const ctx = makeCtx()
    const agent = ctx.create({ preset: 'eng' })
    assert.equal(agent.sections.length, 3)
    assert.deepEqual(agent.sections.map((entry) => entry.name), [
      'better-subagent:delegation',
      'better-subagent:child-guard',
      'better-subagent:cli-subagents',
    ])
    assert.ok(DELEGATION_ORDER < CHILD_GUARD_ORDER && CHILD_GUARD_ORDER < CLI_CATALOG_ORDER)
    assert.deepEqual(agent.sections.map((entry) => entry.order), [DELEGATION_ORDER, CHILD_GUARD_ORDER, CLI_CATALOG_ORDER])
    for (const entry of agent.sections) {
      assert.equal(entry.interpolate, false)
      assert.equal(typeof entry.text, 'function')
    }
  })
})

test('scope: eng preset or global=true; explicit eng=false wins for non-eng presets', async () => {
  await withConfig('{"subagents":{"eng":true,"global":false}}', undefined, async () => {
    const ctx = makeCtx()
    const eng = ctx.create({ preset: 'eng' })
    const ptc = ctx.create({ preset: 'eng-ptc' })
    const standard = ctx.create({ preset: 'standard' })
    assert.match(textOf(eng, 'better-subagent:delegation'), /## Delegation/)
    assert.match(textOf(ptc, 'better-subagent:delegation'), /## Delegation/)
    assert.equal(textOf(standard, 'better-subagent:delegation'), '')
  })
  await withConfig('{"subagents":{"eng":false,"global":true}}', undefined, async () => {
    const ctx = makeCtx()
    const standard = ctx.create({ preset: 'standard' })
    assert.match(textOf(standard, 'better-subagent:delegation'), /## Delegation/)
  })
  await withConfig('{"subagents":{"eng":false,"global":false}}', undefined, async () => {
    const ctx = makeCtx()
    const eng = ctx.create({ preset: 'eng' })
    assert.equal(textOf(eng, 'better-subagent:delegation'), '')
  })
})

test('model tiers render from live config without re-registration', async () => {
  await withConfig('{}', undefined, async () => {
    const ctx = makeCtx()
    const agent = ctx.create({ preset: 'eng' })
    assert.match(textOf(agent, 'better-subagent:delegation'), /Fast tier[^\n]*inherit the parent route/)
    liveConfig = { tiers: { fast: { provider: 'p', model: 'm', reasoningEffort: 'max' }, quality: { provider: '', model: '' } } }
    const text = textOf(agent, 'better-subagent:delegation')
    assert.match(text, /Fast tier[^\n]*provider: `p` · model: `m` · reasoning_effort: `max`/)
    assert.match(text, /Quality tier[^\n]*inherit the parent route/)
  })
})

test('PTC fanout appears only for the eng-ptc preset', async () => {
  await withConfig('{}', undefined, async () => {
    const ctx = makeCtx()
    const native = ctx.create({ preset: 'eng' })
    const ptc = ctx.create({ preset: 'eng-ptc' })
    assert.doesNotMatch(textOf(native, 'better-subagent:delegation'), /run_code/)
    assert.match(textOf(ptc, 'better-subagent:delegation'), /dispatch all subagents inside one run_code program/)
    assert.doesNotMatch(textOf(ptc, 'better-subagent:delegation'), /workflow/)
  })
})

test('child guard wording is gated by childExitGuard and never mentions jobs', async () => {
  await withConfig('{}', undefined, async () => {
    const ctx = makeCtx()
    const agent = ctx.create({ preset: 'eng' })
    assert.equal(textOf(agent, 'better-subagent:child-guard'), '')
  })
  await withConfig('{"childExitGuard":true}', undefined, async () => {
    const ctx = makeCtx()
    const agent = ctx.create({ preset: 'standard' })
    const text = textOf(agent, 'better-subagent:child-guard')
    assert.match(text, /## Child exit guard/)
    assert.match(text, /wait_subagent/)
    assert.doesNotMatch(text, /job_output|job_kill/)
  })
})

test('CLI catalog is gated by routing scope and enabled backends, and shows allowed models', async () => {
  const enabled = '{"subagents":{"eng":true,"global":false,"codex":{"enabled":true,"defaultModel":"gpt-5","models":[{"id":"gpt-5","efforts":["low"],"defaultEffort":"low"}]}}}'
  await withConfig(enabled, undefined, async () => {
    const ctx = makeCtx()
    const eng = ctx.create({ preset: 'eng' })
    const text = textOf(eng, 'better-subagent:cli-subagents')
    assert.match(text, /provider="codex"/)
    assert.match(text, /provider="claude"/)
    assert.match(text, /background/)
    assert.match(text, /send_message/)
    assert.match(text, /codex — Codex CLI/)
    // Claude is disabled → catalog lists only codex.
    assert.doesNotMatch(text, /claude — Claude CLI/)
    const standard = ctx.create({ preset: 'standard' })
    assert.equal(textOf(standard, 'better-subagent:cli-subagents'), '')
  })
  await withConfig('{"subagents":{"eng":true,"global":false}}', undefined, async () => {
    const ctx = makeCtx()
    const eng = ctx.create({ preset: 'eng' })
    assert.equal(textOf(eng, 'better-subagent:cli-subagents'), '')
  })
})

test('presetOf prefers the composed preset over the session header', async () => {
  const ctx = makeCtx()
  const agent = makeAgent({ preset: 'standard' })
  composed = 'eng-ptc'
  try {
    assert.equal(presetOf(ctx, agent), 'eng-ptc')
  } finally {
    composed = undefined
  }
  assert.equal(presetOf(ctx, agent), 'standard')
})

test('already-live Agents get sections at mount; one failing agent does not block others', async () => {
  const first = makeAgent({ preset: 'eng', id: 'a' })
  const second = makeAgent({ preset: 'eng', id: 'b' })
  const ctx = makeCtx({ agents: [first, second] })
  assert.equal(first.sections.length, 3)
  assert.equal(second.sections.length, 3)
  // A duplicate registration on the same agent is prevented by the WeakSet.
  ctx.handlers.get('agent/created')({ agent: first })
  assert.equal(first.sections.length, 3)
})

test('render helpers expose the exact contract', () => {
  assert.equal(renderTier({ provider: '', model: '' }), 'omit provider / model / reasoning_effort to inherit the parent route')
  assert.equal(renderTier({ provider: 'p', model: 'm', reasoningEffort: '' }), 'provider: `p` · model: `m`')
  assert.match(renderChildGuard(), /^## Child exit guard/)
  const withBackend = normalizeConfig({ subagents: { codex: { enabled: true, defaultModel: 'm', models: [{ id: 'm', efforts: ['low'], defaultEffort: 'low' }] } } })
  assert.match(renderCliCatalog(withBackend), /codex — Codex CLI/)
  assert.equal(renderCliCatalog(normalizeConfig({})), '')
  assert.match(renderDelegation(normalizeConfig({}), { ptc: true }), /run_code/)
  assert.equal(scopeEnabled(normalizeConfig({}), { id: 'a' }, 'eng'), true)
  assert.equal(scopeEnabled(normalizeConfig({}), { id: 'a' }, 'standard'), false)
})
