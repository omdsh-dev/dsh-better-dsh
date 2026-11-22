/** Build the two preset-local plugins as standalone ESM bundles. */
import { build as esbuildBuild } from 'esbuild'
import { mkdir } from 'node:fs/promises'

const plugins = ['exit-guard', 'mode-instructions']
for (const name of plugins) {
  const outdir = 'presets/eng/plugins/' + name + '/lib'
  await mkdir(outdir, { recursive: true })
  await esbuildBuild({
    entryPoints: ['presets/eng/plugins/' + name + '/src/index.ts'],
    outfile: outdir + '/index.js',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    sourcemap: true,
    sourcesContent: true,
    logLevel: 'silent',
  })
}
