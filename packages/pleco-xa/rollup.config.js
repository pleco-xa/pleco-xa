import { nodeResolve } from '@rollup/plugin-node-resolve'
import esbuild, { minify } from 'rollup-plugin-esbuild'
import { tsExtensionResolve } from './ts-extension-resolve.mjs'

export default {
  input: 'src/index.js',
  output: [
    { file: 'dist/pleco-xa.js', format: 'es', sourcemap: true },
    { file: 'dist/pleco-xa.min.js', format: 'es', sourcemap: true, plugins: [minify()] },
  ],
  plugins: [tsExtensionResolve(), nodeResolve(), esbuild({ target: 'es2020' })],
}
