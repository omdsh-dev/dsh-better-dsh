/**
 * Real-profile runtime smoke for dsh-better-subagent.
 *
 * Boots an isolated headless DSH profile from the installed host packages with
 * this package installed as a plain (unbuilt) plugin, then exercises the real
 * host surface:
 *
 * - the one host-plane row loads with no Apollo installed;
 * - `wait_subagent` is visible and the per-Agent prompt sections really
 *   assemble through `ctx.systemPrompt.assemble`;
 * - the real dsh-settings service projects exactly the volatile form (all
 *   fields including `trustedHosts`); a hot `childExitGuard` update takes
 *   effect without remounting the row, and a hot `trustedHosts` update moves
 *   the read-only API trust fence on the very next request;
 * - the real `webServer` serves `/better-subagent/api/*` (canonical + Apollo
 *   read aliases) with the trust fence and 404/405 semantics;
 * - native subagent create → wait_subagent (short line) → the framework
 *   settlement notice still carries the child's closing content → resume via
 *   send_message → wait → interrupt → wait;
 * - `childExitGuard=true` intercepts a real parent turn stop while a direct
 *   child is running, the model can then interrupt/wait, and the turn finishes.
 *
 * No managed CLI child is executed here; the capabilities route may legitimately
 * run `<cli> --version` as a probe. CLI end-to-end lives in scripts/cli-smoke.mjs.
 *
 * Run:
 *   DSH_PACKAGE_ROOT="/…/node_modules/@deepseek-ai/dsh" node scripts/runtime-smoke.mjs
 */

import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile, cp, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dsh = process.env.DSH_PACKAGE_ROOT
if (!dsh) throw new Error('Set DSH_PACKAGE_ROOT to the installed @deepseek-ai/dsh package')
const packageName = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).name
const home = await mkdtemp(join(tmpdir(), 'dsh-better-subagent-smoke-'))
process.env.DSH_HOME = home
process.env.DSH_TELEMETRY_DISABLED = '1'

const A = await import(pathToFileURL(join(dirname(dsh), 'dsh-app-boot/lib/index.js')))
const { PROFILE_TEMPLATES } = await import(pathToFileURL(join(dirname(dsh), 'dsh-official-bundles/lib/index.js')))
const dir = A.resolveProfileDir('it', home)
A.initProfile(dir, [...PROFILE_TEMPLATES.headless.bundles, packageName])
const packageFile = join(dir, 'package.json')
const manifest = JSON.parse(await readFile(packageFile, 'utf8'))
const modules = join(dir, 'node_modules')
await mkdir(join(modules, '@menghuan1918'), { recursive: true })
// Exercise the published layout: copy only shipped files, with peers resolved
// from the same runtime the host uses. No copied node_modules or .git.
const plugin = join(modules, '@menghuan1918', 'dsh-better-subagent')
await mkdir(plugin, { recursive: true })
for (const name of ['package.json', 'src', 'docs', 'cordis.patch.yml', 'LICENSE', 'README.md', 'third-party']) {
  await cp(join(root, name), join(plugin, name), { recursive: true })
}
await symlink(dirname(dsh), join(modules, '@deepseek-ai'))
// Exercise the complete published bundle, including its shared PTC dependency.
const ptcRoot = dirname(fileURLToPath(import.meta.resolve('dsh-better-ptc/package.json')))
await symlink(ptcRoot, join(modules, 'dsh-better-ptc'))
manifest.dependencies[packageName] = `file:${plugin}`
await writeFile(packageFile, JSON.stringify(manifest, null, 2))

await writeFile(join(dir, 'cordis.patch.yml'), JSON.stringify([
  // Do not auto-run the headless one-shot task; drive the Agent directly.
  { id: 'headless-startup', disabled: true },
  { id: 'headless-runner', disabled: true },
  { id: 'sandbox-policy', inject: [], config: { mode: 'workspace-write', workspaceRoot: home, additionalWritableRoots: [] } },
  { id: 'credentials', disabled: false, config: { watch: false } },
  // A real HTTP listener on a random loopback port for the read-only API test.
  { insert: [{ id: 'webserver', name: '@deepseek-ai/dsh-host-webserver', config: { host: '127.0.0.1', port: 0 } }] },
  // Row config: global subagent scope with one (unused) CLI backend so the CLI
  // catalog prompt renders. childExitGuard is enabled later through the real
  // settings service to prove volatile hot apply; nothing spawns codex here.
  {
    id: 'dsh-better-subagent',
    config: {
      subagents: {
        global: true,
        codex: {
          enabled: true,
          executable: 'codex',
          defaultModel: 'noop',
          models: [{ id: 'noop', efforts: ['low'], defaultEffort: 'low' }],
        },
      },
    },
  },
]))

const { runProfile } = await import(pathToFileURL(join(dsh, 'lib/profile-boot.js')))
const { createUserMessage } = await import(pathToFileURL(join(dirname(dsh), 'dsh-llm/lib/index.js')))
let ctx
try {
  const resolvedProfile = A.loadProfile('dsh', 'it', join(dir, 'package.json'), home)
  assert.deepEqual(resolvedProfile.skippedBundles, [])
  assert.equal(resolvedProfile.layers.find((layer) => layer.packageName === packageName)?.packageDir, plugin, 'load the isolated copied plugin, never an ancestor checkout')
  assert.equal(JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8')).version, '0.5.3')
  assert.equal(JSON.parse(await readFile(join(dsh, 'package.json'), 'utf8')).version, '0.2.2-rc.2')
  const booted = await runProfile({ profile: 'it', resolvedProfile, patchFiles: [], args: [], environment: A.loadLayeredEnv('dsh') })
  ctx = booted.ctx

  // Scripted provider. `slowSessions` hold a turn open until aborted; the
  // parent reacts to the child-exit-guard notice by interrupting then waiting.
  const slowSessions = new Set()
  const scriptedStreams = new Set()
  const childIds = new Set()
  const starts = new Map()
  const ends = new Map()
  ctx.on('subagent/start', (info) => { starts.set(info.id, info) })
  ctx.on('subagent/end', (info) => { ends.set(info.id, info) })
  let parentId
  let guardTarget
  let guardSeen = false
  let guardInterrupted = false
  let guardWaited = false
  const lastUserText = (messages) => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      if (message.role !== 'user') continue
      const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
      return (blocks ?? []).filter((block) => block?.type === 'text').map((block) => block.text).join('\n')
    }
    return ''
  }
  const toolCall = (name, args) => {
    const id = `smoke-${randomUUID()}`
    const argumentsText = JSON.stringify(args)
    return [
      { type: 'block-start', index: 0, blockType: 'tool-call' },
      { type: 'tool-call-delta', index: 0, id, name, argumentsDelta: argumentsText },
      { type: 'block-end', index: 0, block: { type: 'tool-call', id, name, arguments: argumentsText } },
      { type: 'finish', reason: { kind: 'tool-calls' } },
    ]
  }
  const adapter = {
    providerInfo: (id) => ({ id, name: 'Better Subagent smoke adapter' }),
    providerRetryPolicy: () => undefined,
    imageRequestPricing: () => undefined,
    listModels: async () => [{ provider: 'it-noop', id: 'noop', name: 'Noop', inputModalities: ['text'] }],
    resolveModel: async (provider, id) => ({ provider, id, name: id, inputModalities: ['text'] }),
    async prepareCall(provider, model) {
      return { model: await adapter.resolveModel(provider, model), stream: (options) => adapter.stream(options) }
    },
    async *stream(options) {
      scriptedStreams.add(options.sessionId)
      if (slowSessions.has(options.sessionId)) {
        options.signal?.throwIfAborted()
        await new Promise((resolveWait, reject) => {
          const timer = setTimeout(resolveWait, 30_000)
          options.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(options.signal.reason ?? new Error('aborted'))
          }, { once: true })
        })
      }
      const userText = lastUserText(options.messages ?? [])
      const inGuard = userText.includes('Direct subagent work is still running')
      if (options.sessionId === parentId && inGuard && guardTarget !== undefined) {
        guardSeen = true
        if (!guardInterrupted) {
          guardInterrupted = true
          for (const chunk of toolCall('interrupt_agent', { agent_id: guardTarget })) yield chunk
          return
        }
        if (!guardWaited) {
          guardWaited = true
          for (const chunk of toolCall('wait_subagent', { subagent_id: [guardTarget] })) yield chunk
          return
        }
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'Smoke response.' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Smoke response.' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  ctx.llm.registerAdapter(['it-noop'], adapter)

  const created = await ctx.agents.create({
    sessionId: randomUUID(),
    meta: { cwd: home },
    agentOptions: { provider: 'it-noop', model: 'noop' },
    setup: async () => {},
  })
  const agent = created.agent
  parentId = agent.id
  const tool = (name) => {
    const definition = ctx.tools.get(name, agent)
    assert.ok(definition, `${name} must be visible to the Agent`)
    return definition
  }
  const call = async (name, args) => {
    tool(name)
    const signal = new AbortController().signal
    const toolSet = await ctx.tools.resolve({ agent, modelSelection: agent.model.current(), signal })
    let result
    try {
      const batch = await ctx.tools.execute({
        calls: [{ type: 'tool-call', id: randomUUID(), name, arguments: JSON.stringify(args) }],
        agent, signal, toolSet,
      })
      result = batch.results[0].result
    } finally { toolSet.dispose() }
    assert.equal(result.isError, false, `${name} failed: ${JSON.stringify(result.error ?? result.content)}`)
    return result.value
  }
  const disposeLease = (lease) => { try { lease?.[Symbol.dispose]?.() } catch { /* released */ } }

  // A conditional native registration must be admitted before CLI around-dispatch.
  const childrenBeforeAdmission = await ctx.subagents.listChildren(agent.id)
  const stopConditional = agent.ctx.tools.register({ ...tool('subagent') }, { when: () => false })
  const admissionSignal = new AbortController().signal
  const deniedTools = await ctx.tools.resolve({ agent, modelSelection: agent.model.current(), signal: admissionSignal })
  try {
    const denied = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: randomUUID(), name: 'subagent', arguments: JSON.stringify({ provider: 'codex', description: 'must not start', prompt: 'must not run' }) }],
      agent, signal: admissionSignal, toolSet: deniedTools,
    })
    assert.equal(denied.results[0].result.isError, true)
    assert.equal(denied.results[0].result.error.info.code, 'UNKNOWN_TOOL')
    assert.deepEqual(await ctx.subagents.listChildren(agent.id), childrenBeforeAdmission)
  } finally {
    deniedTools.dispose()
    stopConditional()
  }
  assert.equal(ctx.tools.get('subagent', agent, deniedTools), undefined, 'disposed admissions cannot be reused')
  const cliModels = await ctx.llm.listModels('apollo-cli-codex')
  assert.deepEqual(cliModels.map(({ id }) => id), ['noop'])
  const cliModelInfo = await ctx.llm.resolveModelInfo('apollo-cli-codex', 'noop')
  assert.deepEqual(cliModelInfo.reasoning.efforts.map(({ id }) => id), ['low'])
  assert.equal(cliModelInfo.reasoning.defaultEffort, 'low')

  // ── row, tool and per-Agent prompt sections on the live host ──────────────
  assert.equal(typeof tool('wait_subagent').execute, 'function')
  const assembly = await ctx.systemPrompt.assemble({ agent, scope: agent })
  const sectionNames = assembly.sections.map((section) => section.name)
  assert.ok(sectionNames.includes('better-subagent:delegation'), 'per-agent delegation section')
  assert.ok(sectionNames.includes('better-subagent:cli-subagents'), 'per-agent CLI catalog section')
  const delegation = assembly.sections.find((section) => section.name === 'better-subagent:delegation').text
  assert.match(delegation, /## Delegation/)
  assert.match(delegation, /## Subagent model tiers/)
  const catalog = assembly.sections.find((section) => section.name === 'better-subagent:cli-subagents').text
  assert.match(catalog, /provider="codex"/)
  assert.match(catalog, /codex — Codex CLI/)

  // ── real dsh-settings projection + hot volatile update ────────────────────
  const settings = ctx.get('settings')
  assert.ok(settings, 'real settings service is available')
  const findRow = async () => {
    const rows = await settings.describe()
    const row = rows.find((entry) => entry.ns === 'dsh-better-subagent')
    assert.ok(row, 'the row exposes a formal Config')
    return row
  }
  let settingsRow = await findRow()
  assert.equal('trustedHosts' in settingsRow.value, true, 'trustedHosts is editable (volatile, re-read per request)')
  assert.deepEqual(settingsRow.value.trustedHosts, [])
  assert.equal('childExitGuard' in settingsRow.value, true)
  assert.equal(settingsRow.value.childExitGuard, false)
  const formText = JSON.stringify(settingsRow.schema)
  assert.match(formText, /childExitGuard/)
  assert.match(formText, /trustedHosts/)
  await settings.update('dsh-better-subagent', { childExitGuard: true }, settingsRow.revision)
  settingsRow = await findRow()
  assert.equal(settingsRow.value.childExitGuard, true, 'volatile update is persisted in the form snapshot')

  // ── real webServer: canonical route, Apollo read alias, 404/405 ───────────
  const origin = ctx.webServer.getOrigin()
  const http = async (path, init) => {
    const response = await fetch(`${origin}${path}`, init)
    const body = await response.json().catch(() => undefined)
    return { status: response.status, body }
  }
  const capabilities = await http('/better-subagent/api/capabilities')
  assert.equal(capabilities.status, 200)
  assert.equal(capabilities.body.ok, true)
  assert.equal(typeof capabilities.body.value.executables.codex.path, 'string')
  assert.equal(Array.isArray(capabilities.body.value.codexProfiles), true)
  const routes = await http('/apollo/api/routes')
  assert.equal(routes.status, 200)
  assert.equal(routes.body.ok, true)
  assert.equal(Array.isArray(routes.body.value.routes), true)
  assert.equal((await http('/better-subagent/api/unknown')).status, 404)
  assert.equal((await http('/better-subagent/api/capabilities', { method: 'POST', body: '{}' })).status, 405)

  // trustedHosts is volatile: an untrusted authority is refused before the
  // settings write and trusted on the very next request after it — the fence
  // moves without remounting the row.
  const forgedGet = (authority) => new Promise((resolveGet, rejectGet) => {
    const req = httpRequest(`${origin}/better-subagent/api/capabilities`, { headers: { host: authority } }, (res) => {
      res.resume()
      res.on('end', () => resolveGet(res.statusCode))
    })
    req.on('error', rejectGet)
    req.end()
  })
  assert.equal(await forgedGet('proxy.example.com'), 403, 'untrusted authority is refused')
  settingsRow = await findRow()
  await settings.update('dsh-better-subagent', { trustedHosts: ['proxy.example.com'] }, settingsRow.revision)
  settingsRow = await findRow()
  assert.deepEqual(settingsRow.value.trustedHosts, ['proxy.example.com'], 'the write is persisted in the form snapshot')
  assert.equal(await forgedGet('proxy.example.com'), 200, 'hot trustedHosts update moves the trust fence without remount')

  // ── native create → wait; the settlement notice keeps the child content ───
  const activation = await call('subagent', { description: 'smoke child', prompt: 'First smoke turn.' })
  const childId = activation.subagentId
  childIds.add(childId)
  const firstWait = await call('wait_subagent', { subagent_id: [childId] })
  assert.match(firstWait, new RegExp(`subagent ${childId} done \\(completed\\)`))
  assert.doesNotMatch(firstWait, /Smoke response/)
  // The settlement notice wakes a parent turn; read the durable parent log to
  // prove the notice (with the child's closing content) was delivered. The
  // claim/append races the direct tool call, so poll briefly.
  const findSettlementEvent = async (id) => {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      const lease = await ctx.sessionQuery.observeSession(agent.id)
      const event = lease.events.find((candidate) => candidate.type === 'user/message'
        && candidate.data?.source?.kind === 'subagent-settled'
        && candidate.data.source.senderSessionId === id)
      disposeLease(lease)
      if (event !== undefined) return event
      await new Promise((resolveWait) => setTimeout(resolveWait, 25))
    }
    return undefined
  }
  const noticeEvent = await findSettlementEvent(childId)
  const noticeText = noticeEvent?.data.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n') ?? ''
  assert.ok(noticeEvent, 'the framework settlement notice must still be delivered')
  assert.match(noticeText, /Smoke response\./, 'the notice carries the closing content, not just the wait line')
  await agent.whenIdle()

  // ── continue the same durable child, then wait again ─────────────────────
  await call('send_message', { agent_id: childId, message: 'Second smoke turn.' })
  const secondWait = await call('wait_subagent', { subagent_id: [childId] })
  assert.match(secondWait, new RegExp(`subagent ${childId} done \\(completed\\)`))
  await agent.whenIdle()

  // ── childExitGuard intercepts a real turn stop; the model handles it ─────
  const slow = await call('subagent', { description: 'guarded slow child', prompt: 'Slow guarded turn.' })
  guardTarget = slow.subagentId
  slowSessions.add(guardTarget)
  childIds.add(guardTarget)
  const runningDeadline = Date.now() + 10_000
  while ((ctx.agents.get(guardTarget)?.status !== 'running' || !scriptedStreams.has(guardTarget)) && Date.now() < runningDeadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20))
  }
  assert.equal(ctx.agents.get(guardTarget)?.status, 'running', 'guarded child must be running before the parent turn')
  assert.ok(scriptedStreams.has(guardTarget), 'the scripted child stream must start before interruption')
  const parentTurnEnded = new Promise((resolveTurn, rejectTurn) => {
    const timer = setTimeout(() => { off(); rejectTurn(new Error('parent turn did not finish')) }, 20_000)
    const off = ctx.on('session/event', (session, event) => {
      if (session.id !== agent.id || event.type !== 'turn/end') return
      clearTimeout(timer)
      off()
      resolveTurn(event)
    })
  })
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Finish the guarded parent turn.' }], source: { kind: 'user' } }))
  await parentTurnEnded
  await agent.whenIdle()
  assert.equal(guardSeen, true, 'the child exit guard notice reached the model inside the turn')
  const turnLease = await ctx.sessionQuery.observeSession(agent.id)
  const guardNotice = turnLease.events.find((event) => event.type === 'user/message'
    && event.data?.source?.kind === 'better-subagent-child-exit-guard')
  disposeLease(turnLease)
  assert.ok(guardNotice, 'the guard notice is durably logged in the parent session')
  const guardedWait = await call('wait_subagent', { subagent_id: [guardTarget] })
  assert.match(guardedWait, new RegExp(`subagent ${guardTarget} done \\(aborted\\)`))

  // ── an unguarded parent turn with no running children finishes normally ──
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Plain parent turn.' }], source: { kind: 'user' } }))
  await agent.whenIdle()

  // ── no managed CLI child execution ────────────────────────────────────────
  // A CLI child always persists an apollo_cli_ identity record before spawning
  // its CLI. No record means no managed CLI execution was started (the
  // capabilities probe's `--version` runs are not child executions).
  const profileDir = ctx.get('profileContext')?.dir ?? dir
  const cliNamespace = `apollo_cli_${createHash('sha256').update(profileDir).digest('hex').slice(0, 16)}`
  const cliSessionDir = join(home, 'storages', cliNamespace, 'sessions')
  assert.equal(
    existsSync(cliSessionDir) && readdirSync(cliSessionDir).length > 0,
    false,
    'no managed CLI identity record must exist (no CLI child execution)',
  )
  for (const id of childIds) {
    assert.equal(scriptedStreams.has(id), true, `child ${id} ran through the native/scripted route, not a CLI adapter`)
    assert.equal(starts.get(id)?.local, true, 'native local activation metadata')
    assert.equal(ends.get(id)?.local, true, 'native local settlement metadata')
    assert.equal(ends.get(id)?.runId, starts.get(id)?.runId, 'paired native activation identity')
    assert.equal(ends.get(id)?.provider, 'spawn')
  }

  const result = {
    passed: true,
    profile: dir,
    home,
    checks: [
      'real-profile-boot',
      'host-plane-wait-subagent',
      'conditional-tool-admission-before-cli-routing',
      'cli-model-catalog-and-exact-metadata',
      'per-agent-prompt-sections',
      'settings-projection-and-hot-volatile-update',
      'real-webserver-canonical-and-apollo-route',
      'native-create-wait',
      'native-local-and-runid-settlement-fields',
      'settlement-notice-carries-closing-content',
      'continue-wait',
      'child-exit-guard-real-turn-stopping',
      'interrupt-wait',
      'no-managed-cli-child-execution',
    ],
    cliE2E: 'not-run here (scripts/cli-smoke.mjs covers it)',
  }
  await writeFile(join(home, 'results.json'), JSON.stringify(result, null, 2))
  console.log('BETTER_SUBAGENT_RUNTIME_SMOKE_PASSED', JSON.stringify(result))
} finally {
  if (ctx) await ctx.fiber.dispose()
}
