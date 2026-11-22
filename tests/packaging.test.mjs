/**
 * 发布清单测试：私有设计 Specs、测试、脚本、本地 tarball 不得进入 npm 包。
 *
 * 直接跑真实的 `npm pack --dry-run --json`，而不是只读 .gitignore 或 `files`
 * 文本——npm 对 `files` 目录白名单与 .npmignore 的组合才是最终清单。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

function packList() {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'error' },
  })
  assert.equal(result.status, 0, `npm pack failed: ${result.stderr}`)
  const [report] = JSON.parse(result.stdout)
  assert.ok(Array.isArray(report.files), 'npm pack must report a file list')
  return report.files.map((entry) => entry.path)
}

test('npm pack --dry-run：Specs、测试、脚本、tarball 均不在发布清单', () => {
  const files = packList()
  const forbidden = [
    /^docs\/specs\//,
    /^tests\//,
    /^scripts\//,
    /^prompts\//,
    /^\.github\//,
    /\.tgz$/,
    /^package-lock\.json$/,
    /^node_modules\//,
    /^\.worktrees\//,
  ]
  for (const file of files) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(file, pattern, `发布包不得包含 ${file}`)
    }
  }
  assert.equal(files.some((file) => file.endsWith('10-28-better-plugins-master-design.md')), false)
})

test('npm pack --dry-run：迁移后仍然交付集成所需的运行时文件', () => {
  const files = packList()
  for (const file of [
    'package.json',
    'cordis.patch.yml',
    'presets/eng.patch.yml',
    'presets/eng-ptc.patch.yml',
    'presets/eng/plugins/exit-guard/lib/index.js',
    'presets/eng/plugins/mode-instructions/lib/index.js',
    'lib/index.js',
    'lib/config.js',
    'lib/settings.js',
    'lib/migrate.js',
    'lib/owns-host.js',
    'lib/client.js',
    'docs/DEVELOPMENT.md',
    'README.md',
    'LICENSE',
  ]) {
    assert.ok(files.includes(file), `发布包缺少 ${file}`)
  }
  for (const removed of [
    'lib/panel.js',
    'lib/subagents.js',
    'lib/cli-adapter.js',
    'lib/cli-sessions.js',
    'presets/eng/plugins/wait-subagent/lib/index.js',
    'lib/client.cjs',
  ]) {
    assert.equal(files.includes(removed), false, `已迁移实现不得留在发布包：${removed}`)
  }
  assert.equal(files.some((file) => file.startsWith('src/')), false, 'TS source/tests must not ship')
  assert.equal(files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false, 'TS source must not ship')
  assert.equal(files.some((file) => file.endsWith('.tsbuildinfo')), false, 'tsbuildinfo must not ship')
})
