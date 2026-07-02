// Build config for pleco-xa v1.0.5

import fs from 'fs';
if (!fs.existsSync('src/index.js')) {
  throw new Error('Missing src/index.js — cannot bundle package.');
}

import { nodeResolve } from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import { minify } from 'terser';

const basePlugins = [nodeResolve(), esbuild({ include: /\.[jt]s$/ })];

// Custom Terser plugin using the bundled 'terser' package
const terserPlugin = {
  name: 'custom-terser',
  async renderChunk(code) {
    const result = await minify(code, { sourceMap: true });
    return { code: result.code || '', map: result.map };
  }
};

export default [
  {
    input: 'src/index.js',
    output: {
      file: 'dist/pleco-xa.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [...basePlugins],
  },
  {
    input: 'src/index.js',
    output: {
      file: 'dist/pleco-xa.min.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [...basePlugins, terserPlugin],
  },
];

// Confirm build input exists
if (!fs.existsSync('src/index.js')) {
  throw new Error('Build input src/index.js does not exist.');
}
