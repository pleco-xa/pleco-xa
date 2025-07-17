// Build config for pleco-xa - builds the main library from comprehensive index

import fs from 'fs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import esbuild from 'rollup-plugin-esbuild';
import { minify } from 'terser';

// Check if main entry point exists
if (!fs.existsSync('index.js')) {
  throw new Error('Missing index.js — main library entry point not found.');
}

const basePlugins = [
  nodeResolve({ 
    preferBuiltins: false,
    browser: true 
  }), 
  esbuild({ 
    include: /\.[jt]s$/, 
    target: 'es2020',
    platform: 'browser'
  })
];

// Custom Terser plugin for minification
const terserPlugin = {
  name: 'custom-terser',
  async renderChunk(code) {
    const result = await minify(code, { 
      sourceMap: true,
      compress: {
        drop_console: false, // Keep console.log for debugging
        drop_debugger: true
      },
      mangle: {
        reserved: ['PlecoXA', 'detectBPM', 'findLoop'] // Don't mangle main exports
      }
    });
    return { code: result.code || '', map: result.map };
  }
};

export default [
  // Main library bundle
  {
    input: 'index.js',
    output: {
      file: 'dist/pleco-xa.js',
      format: 'esm',
      sourcemap: true,
      banner: '// Pleco-XA: Browser-native audio analysis library\n// https://github.com/cameronbrooks/pleco-xa'
    },
    plugins: [...basePlugins],
    external: [] // Bundle everything for browser use
  },
  // Minified version
  {
    input: 'index.js',
    output: {
      file: 'dist/pleco-xa.min.js',
      format: 'esm',
      sourcemap: true,
      banner: '// Pleco-XA: Browser-native audio analysis library (minified)\n// https://github.com/cameronbrooks/pleco-xa'
    },
    plugins: [...basePlugins, terserPlugin],
    external: [] // Bundle everything for browser use
  }
];
