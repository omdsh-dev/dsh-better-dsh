/** Build the browser client and preserve the DSH module-loader closure contract. */
import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const PLUGIN_ID = '@oh-my-dsh/dsh-better-subagent'

await mkdir('lib', { recursive: true })
await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.cjs',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
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
  '  },',
  '});',
  '',
].join('\n')
await writeFile('lib/client.js', wrapped)
console.log('built lib/client.js')
