import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply } from '../src/index.js'
import { mountMigrationAdmission } from '../src/admission.js'

function host() {
  const listeners = new Map()
  const ctx = {
    skills: { registerProvider() {} }, logger: { warn() {}, info() {} },
    get() { return undefined },
    on(name, listener, options) { listeners.set(name, { listener, options }); return () => listeners.delete(name) },
    inject() {},
  }
  apply(ctx, {})
  return { ctx, listeners }
}

const handler = (listeners, name) => {
  const value = listeners.get(name)
  return typeof value === 'function' ? value : value.listener
}
const step = (listeners) => handler(listeners, 'agent/pre-step')

test('admission: no agent step or model call may precede migration readiness', async () => {
  const { listeners } = host()
  let calls = 0
  await assert.rejects(step(listeners)({}, () => { calls++ }), /迁移/)
  const stream = handler(listeners, 'llm/stream')
  const next = async function* () { calls++; yield { type: 'finish' } }
  await assert.rejects(async () => { for await (const chunk of stream({}, next)) void chunk }, /迁移/)
  assert.equal(calls, 0)
})

test('admission: pending, blocked and failed reports stay closed; verified completion opens', async () => {
  const listeners = new Map()
  const complete = mountMigrationAdmission({ on: (name, fn) => listeners.set(name, fn), get: () => undefined })
  const next = () => 'work'
  for (const status of ['pending', 'blocked', 'error']) {
    complete({ status, error: 'unverified configuration' })
    await assert.rejects(step(listeners)({}, next), /unverified configuration/)
  }
  complete({ status: 'complete', compact: { status: 'no-change' } })
  assert.equal(await step(listeners)({}, next), 'work')
  const chunks = []
  for await (const value of handler(listeners, 'llm/stream')({}, async function* () { yield 'provider' })) chunks.push(value)
  assert.deepEqual(chunks, ['provider'])
})

test('admission: migrated load-time values require reload; ordinary later saves do not close admission', async () => {
  const listeners = new Map()
  let saved = { mode: 'goal', thresholdRatio: 0.8 }
  const snapshot = { ...saved }
  const companion = { snapshot: () => snapshot, current: () => saved }
  const complete = mountMigrationAdmission({ on: (name, fn) => listeners.set(name, fn), get: () => companion })
  saved = { ...saved, thresholdRatio: 0.7 }
  complete({ status: 'complete', compact: { status: 'complete', fields: ['thresholdRatio'] } })
  await assert.rejects(step(listeners)({}, () => 'work'), { code: 'APOLLO_MIGRATION_RELOAD_REQUIRED' })
  complete({ status: 'complete', compact: { status: 'no-change' } })
  assert.equal(await step(listeners)({}, () => 'work'), 'work')
})

test('admission: a load-time failure is retried once from the turn path (issue #2)', async () => {
  const listeners = new Map()
  let retries = 0
  const retry = async () => ({ status: 'complete' })
  const complete = mountMigrationAdmission(
    { on: (name, fn) => listeners.set(name, fn), get: () => undefined },
    { retry: () => { retries += 1; return retry() } },
  )
  // The load-time attempt failed inside an HMR transaction and latched the gate.
  complete({ status: 'error', error: 'HMR transactions cannot be nested' })
  // The next turn is not an HMR transaction; one retry re-runs the idempotent
  // migration before the gate is asserted, so the turn can proceed.
  assert.equal(await step(listeners)({}, () => 'work'), 'work')
  assert.equal(retries, 1)
  assert.equal(await step(listeners)({}, () => 'work'), 'work', 'completion must stay open')
})

test('admission: retry is bounded, so a permanent failure cannot stall every turn', async () => {
  const listeners = new Map()
  let retries = 0
  const complete = mountMigrationAdmission(
    { on: (name, fn) => listeners.set(name, fn), get: () => undefined },
    { retry: async () => { retries += 1; return { status: 'pending', error: 'rows not readable' } } },
  )
  complete({ status: 'pending', error: 'rows not readable' })
  await assert.rejects(step(listeners)({}, () => 'work'), /rows not readable/)
  await assert.rejects(step(listeners)({}, () => 'work'), /rows not readable/)
  assert.equal(retries, 1)
})

test('admission: real Cordis dispatch prepends the gate before automatic compaction and manual summaries', {
  skip: process.env.DSH_PACKAGE_ROOT ? false : 'DSH_PACKAGE_ROOT is not set',
}, async () => {
  const req = createRequire(join(dirname(process.env.DSH_PACKAGE_ROOT), 'cordis/package.json'))
  const { Context } = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')).href)
  const ctx = new Context()
  let calls = 0
  ctx.on('agent/pre-step', (_payload, next) => { calls++; return next() })
  const complete = mountMigrationAdmission(ctx)
  try {
    await assert.rejects(async () => { ctx.waterfall('agent/pre-step', {}, () => { calls++ }) }, /迁移/)
    await assert.rejects(async () => {
      for await (const value of ctx.waterfall('llm/stream', {}, async function* () { calls++; yield 'provider' })) void value
    }, /迁移/)
    assert.equal(calls, 0)
    complete({ status: 'complete', compact: { status: 'no-change' } })
    ctx.waterfall('agent/pre-step', {}, () => { calls++ })
    assert.equal(calls, 2)
  } finally { await ctx.fiber.dispose() }
})
