/** Build the DSH client closure bundle with esbuild. */
import { build as esbuildBuild } from 'esbuild'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'

const PLUGIN_ID = 'dsh-better-goal'

await mkdir('lib', { recursive: true })
await copyFile('src/host.d.ts', 'lib/host.d.ts')
await esbuildBuild({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  logLevel: 'info',
})

const cjs = await readFile('lib/client.cjs', 'utf8')
const wrapped = [
  'window.__ModuleLoader__.load({',
  '  id: ' + JSON.stringify(PLUGIN_ID) + ',',
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
console.log('built lib/client.js')
