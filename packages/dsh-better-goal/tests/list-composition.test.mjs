import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, Service, symbols } from '@deepseek-ai/cordis'

const enabled = Boolean(process.env.LAZY_SESSION_LIST_ROOT && process.env.DSH_PACKAGE_ROOT)
const skip = enabled ? false : 'Set LAZY_SESSION_LIST_ROOT and DSH_PACKAGE_ROOT to test independent plugin composition'

for (const mountOrder of ['goal-first', 'lazy-first']) {
  for (const removeOrder of ['goal-first', 'lazy-first']) {
    test('independent list owners compose: mount ' + mountOrder + ', remove ' + removeOrder, { skip }, async t => {
      const { mountGoalListHints } = await import('../src/list-hints.js')
      const lazy = await import(pathToFileURL(join(process.env.LAZY_SESSION_LIST_ROOT, 'src/index.js')))
      const hostRequire = createRequire(join(process.env.DSH_PACKAGE_ROOT, 'package.json'))
      const { SessionController } = await import(pathToFileURL(hostRequire.resolve('@deepseek-ai/dsh-api-session-controller')))
      const values = {
        title: 'fixture title', sessionListMetadata: { blank: false, lastPromptAt: 12 },
        goal: { goal: { id: 'g1', objective: 'Only load when opened' } },
        'better-goal-history': { entries: [{ id: 'g0', objective: 'Historical objective' }], error: null },
        pluginSummary: { amount: 9 }, pluginDetail: { records: ['detail'] },
      }
      const rows = [{ sessionId: 'allowed', updatedAt: 12, blank: false, running: false,
        projections: { kind: 'sequenced', asOfSeq: 5, values } },
        { sessionId: 'hidden', updatedAt: 11, blank: false, running: false,
          projections: { kind: 'cached', asOfSeq: 4, values } }]
      const ctx = new Context()
      t.after(() => ctx.fiber.dispose())
      class Access extends Service {
        constructor(inner) { super(inner, 'remoteAccess') }
        allows(resource) { return this.ctx.invocation?.allowed.includes(resource.id) ?? true }
      }
      class Controller extends Service {
        constructor(inner) {
          super(inner, 'sessionController')
          this.listState = { list: async () => rows }
        }
        list(...args) { return Reflect.apply(SessionController.prototype.list, this, args) }
        async projections() { return { kind: 'sequenced', asOfSeq: 5, values } }
      }
      await ctx.plugin(Access)
      await ctx.plugin(Controller)
      const protoList = Object.getPrototypeOf(ctx.sessionController[symbols.original]).list
      const goal = { name: 'goal-list-boundary-test', apply: mountGoalListHints }
      const lazyConfig = { listProjectionKeys: ['title', 'sessionListMetadata', 'goal', 'better-goal-history', 'pluginSummary'] }
      let goalFiber, lazyFiber
      if (mountOrder === 'goal-first') {
        goalFiber = ctx.plugin(goal); await goalFiber
        lazyFiber = ctx.plugin(lazy, lazyConfig); await lazyFiber
      } else {
        lazyFiber = ctx.plugin(lazy, lazyConfig); await lazyFiber
        goalFiber = ctx.plugin(goal); await goalFiber
      }
      const caller = ctx.extend({ invocation: { allowed: ['allowed'] } }).get('sessionController')
      const getKeys = async () => {
        const result = await caller.list({})
        assert.deepEqual(result.items.map(row => row.sessionId), ['allowed'])
        const hints = result.items[0].projections
        assert.equal(hints.kind, 'sequenced')
        assert.equal(hints.asOfSeq, 5)
        for (const [key, value] of Object.entries(hints.values)) assert.equal(value, values[key])
        return Object.keys(hints.values).sort()
      }
      assert.deepEqual(await getKeys(), ['title', 'sessionListMetadata', 'pluginSummary'].sort())
      assert.equal((await caller.projections()).values, values, 'full detail endpoint is untouched')
      if (removeOrder === 'goal-first') {
        await goalFiber.dispose()
        assert.deepEqual(await getKeys(), ['title', 'sessionListMetadata', 'goal', 'better-goal-history', 'pluginSummary'].sort(),
          'generic lazy plugin has no special goal exclusion after the goal owner unloads')
        await lazyFiber.dispose()
      } else {
        await lazyFiber.dispose()
        assert.deepEqual(await getKeys(), ['title', 'sessionListMetadata', 'pluginSummary', 'pluginDetail'].sort(),
          'goal owner only removes its two keys after the generic filter unloads')
        await goalFiber.dispose()
      }
      assert.deepEqual(await getKeys(), Object.keys(values).sort())
      assert.equal(Object.getPrototypeOf(ctx.sessionController[symbols.original]).list, protoList)
      assert.deepEqual(rows[0].projections.values, values, 'shared source has not been filtered in place')
    })
  }
}
