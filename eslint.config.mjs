// Flat ESLint config (ESLint 9) for the pleco-xa monorepo.
//
// Lint target = the published library source + repo tooling ONLY:
//   - packages/pleco-xa/src/**/*.js   (the library)
//   - tools/**/*.mjs                  (build/serve tooling)
//   - root-level *.mjs / *.js         (config files, incl. this one)
//
// The recommended ruleset below is scoped to those `files` globs, so running
// `eslint .` does NOT sweep in framework apps, proof demos, local vendor or
// reference code, scratch notes, or the vitest suite — each of which has its
// own (looser/framework-specific) linting story.
//
// Formatting is owned by Prettier (.prettierrc: no-semi, single-quote), NOT
// ESLint. This config adds no stylistic/formatting rules; ESLint 9's
// `@eslint/js` recommended set no longer ships formatting rules, so there is
// nothing to disable on that front.

import js from '@eslint/js'
import globals from 'globals'

export default [
  // Global ignores (a config object with only `ignores` applies run-wide):
  // build output, deps, framework apps, intentionally-loose demos, Astro
  // single-file components, the vendored web-audio test shim, and any
  // local-only scratch directories that aren't part of the library.
  {
    ignores: [
      '**/dist/**',
      'node_modules/**',
      '**/node_modules/**',
      'apps/**',
      'examples/**',
      'packages/pleco-xa/dist/**',
      '**/*.astro',
      'packages/pleco-xa/web-audio-test-api/**',
      'lb/**',
    ],
  },

  {
    files: [
      'packages/pleco-xa/src/**/*.js',
      'tools/**/*.mjs',
      '*.mjs',
      '*.js',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      // Library code runs in the browser, in Node, and inside Web/Audio
      // Workers, so union all three global sets for correct `no-undef`.
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
      },
    },
    // Start from the ESLint core recommended set, scoped to the target files.
    rules: {
      ...js.configs.recommended.rules,

      // Ignore intentionally-unused bindings prefixed with `_`, and stop
      // flagging unused function ARGUMENTS entirely: the src modules mirror
      // established DSP function signatures (positional + named kwargs such as
      // `dtype`, `axis`, `sparsity`, `ref_power`, `tightness`, ...). Those
      // trailing accepted-but-unapplied parameters are intentional API surface,
      // not dead code. Unused local vars/imports are STILL flagged.
      'no-unused-vars': [
        'error',
        {
          args: 'none',
          vars: 'all',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // The library intentionally swallows errors from best-effort teardown
      // (e.g. AudioBufferSourceNode.stop() on an already-stopped node), so an
      // empty `catch {}` is deliberate. Empty blocks elsewhere are still errors.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Several DSP modules embed full-precision reference math constants
      // (e.g. Lanczos gamma coefficients, the C1 pitch frequency
      // 32.703195662574829). JS parses each to the nearest IEEE-754 double —
      // which IS the intended value — so the "loses precision" report is noise
      // here, not a bug. (Reviewed each site; all are deliberate constants.)
      'no-loss-of-precision': 'off',
    },
  },

  // A library must be silent by default. Every diagnostic in the library
  // source is routed through the PLECO_DEBUG-gated helpers in
  // src/scripts/debug.js (debugLog/debugWarn/debugError/debugTime/
  // debugTimeEnd) — direct console.* calls are a lint ERROR so the
  // console sweep (2026-07-04) cannot regress.
  {
    files: ['packages/pleco-xa/src/**/*.js'],
    rules: {
      'no-console': 'error',
    },
  },

  // ...with exactly ONE sanctioned sink: the debug helpers themselves.
  {
    files: ['packages/pleco-xa/src/scripts/debug.js'],
    rules: {
      'no-console': 'off',
    },
  },
]
