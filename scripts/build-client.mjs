/** Build the DSH client closure bundle with esbuild. */
import { build as esbuildBuild } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const PLUGIN_ID = 'dsh-better-dsh'

await mkdir('lib', { recursive: true })
await esbuildBuild({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/dsh-client-ui-primitives',
  ],
  logLevel: 'silent',
})

const cjs = await readFile('lib/client.cjs', 'utf8')
const wrapped = [
  'window.__ModuleLoader__.load({',
  "  id: '" + PLUGIN_ID + "',",
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  cjs,
  '    return module.exports;',
  '  }',
  '});',
  '',
].join('\n')
await writeFile('lib/client.js', wrapped)
