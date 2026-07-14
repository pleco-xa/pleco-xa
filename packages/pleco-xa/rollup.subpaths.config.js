// Per-namespace subpath entry points (import { mfcc } from 'pleco-xa/feature').
// Multi-entry + code-splitting: shared DSP lives in dist/internal/ chunks so it
// is not duplicated across namespace bundles. The self-contained barrel
// (dist/pleco-xa.js) is built separately by rollup.config.js for the default
// `import ... from 'pleco-xa'` entry.
import { nodeResolve } from '@rollup/plugin-node-resolve'
import esbuild from 'rollup-plugin-esbuild'
import { tsExtensionResolve } from './ts-extension-resolve.mjs'

// subpath -> source entry (mirrors the `export * as <ns>` lines in src/index.js)
const entries = {
  engine: 'src/engine/index.js',
  feature: 'src/feature/index.js',
  loop: 'src/loop/index.js',
  segment: 'src/segment/index.js',
  sequence: 'src/sequence/index.js',
  filters: 'src/filters/index.js',
  effects: 'src/effects/index.js',
  decompose: 'src/decompose/index.js',
  linalg: 'src/linalg/index.js',
  cluster: 'src/cluster/index.js',
  playback: 'src/playback/ops.js',
  convert: 'src/scripts/xa-convert.js',
  bpm: 'src/scripts/xa-bpm-algorithm.js',
  notation: 'src/scripts/xa-notation.js',
  recurrence: 'src/scripts/xa-recurrence.js',
  audioio: 'src/scripts/xa-audioio.js',
  intervals: 'src/scripts/xa-intervals.js',
  fileio: 'src/scripts/xa-fileio.js',
  file: 'src/scripts/xa-file.js',
  io: 'src/io/wav.js',
}

export default {
  input: entries,
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: true,
    entryFileNames: '[name].js',
    chunkFileNames: 'internal/[name]-[hash].js',
  },
  plugins: [tsExtensionResolve(), nodeResolve(), esbuild({ target: 'es2020' })],
}
