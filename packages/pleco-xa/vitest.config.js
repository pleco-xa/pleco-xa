import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,ts,mjs}'],
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['tests/signature-*.test.js', 'jsdom']
    ]
  }
})
