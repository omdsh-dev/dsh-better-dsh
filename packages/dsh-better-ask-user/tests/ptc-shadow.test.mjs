/**
 * Real host: a PTC root answers name lookups only for `run_code`, so the
 * official ask row is invisible there. The shadow must register from the
 * vendored definition and win the binding programs call. Skipped unless
 * DSH_PACKAGE_ROOT points at an installed @deepseek-ai/dsh.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import * as betterAsk from '../lib/index.js'

const hostRoot = process.env.DSH_PACKAGE_ROOT
const hostRequire = createRequire(hostRoot ? resolve(hostRoot, 'package.json') : import.meta.url)
const load = name => import(pathToFileURL(hostRequire.resolve(name)).href)

test('a PTC root binds the better shadow instead of the hidden official row', { skip: !hostRoot }, async t => {
  const { Context } = await load('@deepseek-ai/cordis')
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  for (const name of ['dsh-session-projection', 'dsh-agent', 'dsh-system-prompt', 'dsh-tools', 'dsh-user-questions']) {
    await ctx.plugin((await load('@deepseek-ai/' + name)).default)
  }
  await ctx.plugin(await load('@deepseek-ai/dsh-tool-registry-native'))
  await ctx.plugin(await load('@deepseek-ai/dsh-tool-ask-user'))
  const config = { questionTimeoutSeconds: 5, timeoutBehavior: 'native', goalTimeoutBehavior: 'native' }
  await ctx.plugin({ inject: betterAsk.inject, apply: inner => betterAsk.apply(inner, config) })

  const { createScope } = await load('@deepseek-ai/dsh-scope')
  const { Session } = await load('@deepseek-ai/dsh-session')
  const agent = { id: 'ask-ptc-shadow', session: new Session('ask-ptc-shadow') }
  const scope = createScope(ctx, agent)
  agent.ctx = scope.ctx
  t.after(() => scope.dispose())

  const { PtcToolRegistry } = await load('@deepseek-ai/dsh-tool-registry-ptc')
  const { PtcRuntime } = await load('@deepseek-ai/dsh-ptc-runtime')
  class StubRuntime extends PtcRuntime {
    language = 'typescript'
    isolation = 'worker-thread'
    resolve() { throw new Error('stub runtime does not execute programs') }
    async run() { throw new Error('stub runtime does not execute programs') }
  }
  const runtime = new StubRuntime(scope.ctx)
  let registry
  await scope.ctx.plugin({
    inject: ['tools', 'systemPrompt'],
    apply(inner) {
      registry = new PtcToolRegistry(inner, { name: 'run_code', runtime })
      return registry.mountRoot()
    },
  })

  const created = Promise.withResolvers()
  ctx.on('agent/created', () => { created.resolve() })
  const unregister = ctx.agents.register(agent)
  t.after(() => unregister())
  await created.promise

  // The PTC root really hides the official row from name lookups; the unscoped
  // native root still resolves it, which is the definition we must mirror.
  assert.equal(ctx.tools.get('ask_user_question', agent), undefined)
  const official = ctx.tools.get('ask_user_question')
  assert.equal(official?.name, 'ask_user_question')
  assert.equal(ctx.tools.get('run_code', agent)?.name, 'run_code')

  const bound = registry.bindings(agent).find(definition => definition.name === 'ask_user_question')
  assert.ok(bound, 'the PTC program bindings must still offer ask_user_question')
  assert.equal(bound.description, official.description)
  assert.equal(bound.parameters.properties.questions.items.properties.detail.type, 'string')
  assert.equal(bound.parameters.properties.timeout.type, 'integer')
  assert.ok(bound.output.schema.oneOf.some(branch => branch.properties?.pending !== undefined))

  // The vendored base must stay a faithful copy of the official parameters.
  const normalized = structuredClone(bound.parameters)
  delete normalized.properties.timeout
  delete normalized.properties.questions.items.properties.detail
  assert.deepEqual(normalized, official.parameters)
})
