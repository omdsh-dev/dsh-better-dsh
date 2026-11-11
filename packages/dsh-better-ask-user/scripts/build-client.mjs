/** Build the DSH client closure bundle with esbuild + real CSS Modules. */
import { build as esbuildBuild } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { appendFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

const PLUGIN_ID = 'dsh-better-ask-user'

const cssModules = {
  name: 'dsh-css-modules',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, async (args) => {
      // Delegate to esbuild's native local-css loader so class scoping uses a
      // real CSS parser (file-scoped names like QuestionComposer_card) instead
      // of a dot-regex that also rewrites text inside url(...) data URIs.
      const result = await esbuildBuild({
        stdin: {
          contents: 'import styles from ' + JSON.stringify(args.path) + '; export default styles;',
          resolveDir: dirname(args.path),
          loader: 'js',
          sourcefile: 'css-modules-entry.js',
        },
        bundle: true,
        format: 'esm',
        write: false,
        outfile: 'css-modules-entry.js',
        loader: { '.css': 'local-css' },
        target: 'es2022',
        platform: 'browser',
        logLevel: 'silent',
      })
      const cssOut = result.outputFiles.find((file) => file.path.endsWith('.css'))
      const jsOut = result.outputFiles.find((file) => file.path.endsWith('.js'))
      if (cssOut === undefined || jsOut === undefined) {
        throw new Error('css-modules entry produced no css/js output for ' + args.path)
      }
      // Stable across checkout paths so the published bundle carries no absolute
      // machine paths and style de-duplication survives a move.
      const id = PLUGIN_ID + '/' + basename(args.path)
      const contents = [
        'const css = ' + JSON.stringify(cssOut.text) + ';',
        'const id = ' + JSON.stringify(id) + ';',
        "if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(id) + ']') === null) {",
        "  const tag = document.createElement('style');",
        "  tag.dataset.plugin = " + JSON.stringify(PLUGIN_ID) + ';',
        '  tag.dataset.pluginCss = id;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        jsOut.text,
      ].join('\n')
      return { contents, loader: 'js' }
    })
  },
}

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
    '@deepseek-ai/dsh-client-store',
  ],
  plugins: [cssModules],
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
await appendFile('lib/client.js', '')
console.log('built lib/client.js')
