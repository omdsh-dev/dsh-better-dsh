/**
 * Package/assembly contract tests: manifest identity, bundle patch row, export
 * resolution in a real scoped node_modules layout, client closure id/keys, and
 * the release workflow (OIDC trusted publishing, no token).
 *
 * These are data/shape assertions only: they do not load the plugin or start a
 * Loader (the runtime smoke covers real assembly).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const PACKAGE_NAME = '@oh-my-dsh/dsh-better-subagent'
const ENTRY_ID = 'dsh-better-subagent'
const manifest = () => JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const patch = () => yaml.load(readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8'))

test('manifest identity: scoped name, version, Apache-2.0, repository, publish config', () => {
  const m = manifest()
  assert.equal(m.name, PACKAGE_NAME)
  assert.equal(m.version, '0.5.3')
  assert.equal(m.license, 'Apache-2.0')
  assert.equal(m.type, 'module')
  assert.equal(m.main, 'src/index.js')
  assert.deepEqual(m.exports, {
    '.': './src/index.js',
    './client': './src/client.js',
    './package.json': './package.json',
  })
  assert.deepEqual(m.repository, {
    type: 'git',
    url: 'git+https://github.com/omdsh-dev/dsh-better-subagent.git',
  })
  assert.deepEqual(m.publishConfig, {
    registry: 'https://registry.npmjs.org/',
    access: 'public',
  })
  assert.equal(m.engines.node, '>=24.9.0')
  assert.equal(m.engines.dsh, '0.2.2-rc.2')
})

test('manifest: no build step, schemastery dependency, peer ranges, dev test deps', () => {
  const m = manifest()
  assert.equal(m.scripts?.build, undefined, 'pure ESM package must not require a build')
  assert.equal(m.scripts.test, 'node --test')
  assert.equal(m.dependencies['@deepseek-ai/schemastery'], '~3.19.0')
  assert.equal(m.dependencies['dsh-better-ptc'], '0.2.1')
  for (const [name, range] of Object.entries(m.peerDependencies)) {
    if (name === 'react') assert.equal(range, '^18.2.0')
    else if (name === '@deepseek-ai/cordis') assert.equal(range, '~4.1.0')
    else assert.equal(range, '0.2.2-rc.2', name)
  }
  assert.equal(m.peerDependencies.react, '^18.2.0')
  assert.equal(m.devDependencies.react, '18.3.1')
  assert.equal(m.devDependencies['react-test-renderer'], '18.3.1')
  assert.equal(typeof m.devDependencies['js-yaml'], 'string')
})

test('manifest: files whitelist never ships tests, specs, scripts or credentials', () => {
  const m = manifest()
  assert.deepEqual([...m.files].sort(), ['LICENSE', 'README.md', 'cordis.patch.yml', 'docs', 'src', 'third-party'].sort())
  for (const forbidden of ['tests', 'scripts', 'presets', 'skills', '.github', '.env', '.npmrc']) {
    assert.equal(m.files.includes(forbidden), false, forbidden)
  }
})

test('bundle patch: stable shared PTC row plus the scoped package row', () => {
  const patches = patch()
  assert.equal(Array.isArray(patches), true)
  assert.deepEqual(patches.map((entry) => Object.keys(entry)), [['insert']])
  const rows = patches[0].insert
  assert.deepEqual(rows, [
    { id: 'dsh-better-ptc', name: 'dsh-better-ptc' },
    { id: ENTRY_ID, name: PACKAGE_NAME },
  ])
  const disabled = patches.filter((entry) => entry.disabled === true)
  assert.deepEqual(disabled, [], 'this bundle must not disable any native row')
})

test('manifest dsh block: bundle patch path and client platform/inject baseline', () => {
  const m = manifest()
  assert.deepEqual(m.dsh.bundle, { patch: './cordis.patch.yml' })
  assert.equal(m.dsh.client.platform, 'web')
  assert.deepEqual(m.dsh.client.inject, [
    '@deepseek-ai/dsh-client-connection',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-locale',
  ])
})

test('scoped install layout: package root, client and package.json resolve', () => {
  const dir = mkdtempSync(join(tmpdir(), 'better-subagent-scoped-'))
  try {
    const scope = join(dir, 'node_modules', '@oh-my-dsh')
    mkdirSync(scope, { recursive: true })
    symlinkSync(ROOT, join(scope, 'dsh-better-subagent'), process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(dir, 'package.json'), '{}\n')
    const require = createRequire(join(dir, 'package.json'))
    assert.equal(require.resolve(PACKAGE_NAME), join(ROOT, 'src/index.js'))
    assert.equal(require.resolve(`${PACKAGE_NAME}/client`), join(ROOT, 'src/client.js'))
    assert.equal(require.resolve(`${PACKAGE_NAME}/package.json`), join(ROOT, 'package.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('client half: closure id equals the package name and all six row config keys exist', () => {
  const source = readFileSync(join(ROOT, 'src/client.js'), 'utf8')
  assert.equal(source.includes(`id: '${PACKAGE_NAME}'`), true)
  for (const key of [
    `${PACKAGE_NAME}#${ENTRY_ID}`,
    `dsh-better-dsh#${ENTRY_ID}`,
    `@menghuan1918/dsh-better-subagent#${ENTRY_ID}`,
    `@menghuan1918/dsh-apollo#${ENTRY_ID}`,
    `dsh-apollo#${ENTRY_ID}`,
    `${ENTRY_ID}#${ENTRY_ID}`,
  ]) assert.equal(source.includes(`'${key}'`), true, key)
  assert.doesNotMatch(source, /document\./, 'no-build client must not touch the DOM directly')
  assert.doesNotMatch(source, /require\('(?!react')/, 'the client factory only requires react')
})

test('host sources never import Apollo or a design-spec path', () => {
  for (const file of ['src/index.js', 'src/config.js', 'src/settings.js', 'src/panel.js', 'src/subagents.js', 'src/wait-subagent.js', 'src/child-exit-guard.js', 'src/prompt.js']) {
    const source = readFileSync(join(ROOT, file), 'utf8')
    assert.doesNotMatch(source, /from\s+'@menghuan1918\/dsh-apollo/, file)
    assert.doesNotMatch(source, /docs\/specs/, file)
  }
})

test('release workflow: release-published OIDC trusted publishing, no npm token', () => {
  const workflow = readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8')
  assert.match(workflow, /on:\s*\n\s*release:\s*\n\s*types: \[published\]/)
  assert.match(workflow, /id-token: write/)
  assert.match(workflow, /npm ci --no-audit --no-fund/)
  assert.match(workflow, /npm test/)
  assert.match(workflow, /npm publish --provenance --access public/)
  assert.match(workflow, /GITHUB_REF_NAME/)
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN|npm_token/)
})

test('license is the full Apache-2.0 text and third-party notices exist', () => {
  const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8')
  assert.match(license, /Apache License/)
  assert.match(license, /Version 2.0, January 2004/)
  assert.equal(createHash('sha256').update(license).digest('hex'), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30')
  const notice = readFileSync(join(ROOT, 'third-party/NOTICE'), 'utf8')
  assert.match(notice, /Apache-2.0/)
  assert.match(notice, /apollo/i)
  assert.match(notice, /MIT License/)
})
