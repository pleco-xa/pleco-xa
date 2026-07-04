import { defineConfig } from 'vitest/config'
import { tsExtensionResolve } from './ts-extension-resolve.mjs'

export default defineConfig({
  plugins: [tsExtensionResolve()],
  test: {
    include: ['tests/**/*.test.{js,ts,mjs}'],
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/signature-*.test.js', 'jsdom']
    ]
  }
})
