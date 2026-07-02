# Wave 0: Monorepo Restructure + Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert pleco-xa into an npm-workspaces monorepo (`packages/pleco-xa` + `apps/demo`) with green tests, working CI, a buildable/import-safe library artifact, and licensing hygiene — the demo keeps working throughout.

**Architecture:** Library source moves as-is (no namespace reorganization yet — that's Waves 1–5) into `packages/pleco-xa`; the Astro demo moves to `apps/demo` and reaches library source through a `@pleco` Vite alias until it becomes a true package consumer in Wave 6. A new minimal curated barrel exports only import-safe, test-passing modules.

**Tech Stack:** npm workspaces, Astro 5, Rollup 4 + rollup-plugin-esbuild (minify — replaces the missing terser), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-07-02-pleco-xa-v2-shippable-design.md`

---

### Task 1: Branch + preserve untracked flagship files

**Files:**
- Create branch `v2-wave-0`
- Add: `src/pages/spectrogram-test.astro`, `src/pages/vocal-separation.astro`, `src/scripts/xa-vocal-separation.js`, `src/scripts/xa-wav-encoder.js`, `public/scripts/{SpectrumAnalyzer,xa-fft,xa-util,xa-vocal-separation,xa-wav-encoder}.js`, `.astro/settings.json`
- Delete: `scripts/SpectrumAnalyzer.js` (byte-identical third copy; verified: only `src/scripts/` and `public/scripts/` copies are referenced)

- [ ] **Step 1: Branch**

```bash
git checkout -b v2-wave-0
```

- [ ] **Step 2: Verify the root copy is unreferenced, then delete it**

Run: `grep -rn "scripts/SpectrumAnalyzer" src astro public --include="*.js" --include="*.astro" | grep -v "src/scripts/SpectrumAnalyzer" | grep -v "/scripts/SpectrumAnalyzer"`
Expected: no output referencing the repo-root `scripts/SpectrumAnalyzer.js` (page refs use `./scripts/` = src copy and `/scripts/` = public copy).

```bash
rm scripts/SpectrumAnalyzer.js
```

- [ ] **Step 3: Commit the flagship files (they are currently one hard-reset from gone)**

```bash
git add src/pages/spectrogram-test.astro src/pages/vocal-separation.astro \
  src/scripts/xa-vocal-separation.js src/scripts/xa-wav-encoder.js \
  public/scripts/ .astro/settings.json scripts/
git commit -m "Track untracked flagship demo pages and vocal-separation modules; drop stray SpectrumAnalyzer copy"
```

- [ ] **Step 4: Ignore local-only dirs**

Append to `.gitignore`:

```
# local-only
.amp/
.oracle/
LibrosaDemo-PR1/
.DS_Store
```

```bash
git rm -r --cached .amp 2>/dev/null; git add .gitignore && git commit -m "Ignore local tool state and reference projects"
```

### Task 2: Fix the 3 librosa-semantics bugs in audio-utils (TDD — tests already exist and fail)

**Files:**
- Modify: `src/scripts/audio-utils.js:171-192` (computeZeroCrossingRate), `:210-217` (findZeroCrossing)
- Tests (existing): `tests/audio-utils.test.js`, `tests/utils-audio-utils.test.js`

- [ ] **Step 1: Run the failing tests**

Run: `npx vitest run tests/audio-utils.test.js tests/utils-audio-utils.test.js`
Expected: 3 FAIL (computeZeroCrossingRate 0.75≠1.0; findZeroCrossing 1≠2; findAudioStart 3≠4)

- [ ] **Step 2: Fix `findZeroCrossing` to return the librosa-style *later* index of the sign change**

Replace the function body (`return i - 1` → `return i`):

```javascript
export function findZeroCrossing(data, startIndex) {
  for (let i = startIndex + 1; i < data.length; i++) {
    if ((data[i - 1] >= 0 && data[i] < 0) || (data[i - 1] < 0 && data[i] >= 0)) {
      return i
    }
  }
  return startIndex
}
```

(`findAudioStart` calls `findZeroCrossing` and passes transitively: silence ends at index 3, crossing 0.05→-0.05 marks index 4.)

- [ ] **Step 3: Fix `computeZeroCrossingRate` to librosa `pad=True` semantics** (first sample counts as a crossing; alternating ±1 → rate 1.0):

```javascript
export function computeZeroCrossingRate(audioBuffer) {
  const channels = audioBuffer.numberOfChannels || 1
  let totalRate = 0

  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch)
    if (data.length === 0) continue
    // librosa zero_crossings pad=True: index 0 always counts as a crossing
    let crossings = 1
    for (let i = 1; i < data.length; i++) {
      if (
        (data[i - 1] >= 0 && data[i] < 0) ||
        (data[i - 1] < 0 && data[i] >= 0)
      ) {
        crossings++
      }
    }
    totalRate += crossings / data.length
  }

  return channels ? totalRate / channels : 0
}
```

- [ ] **Step 4: Re-run those two files — expect the 3 to pass.** Then check no other assertions in the same files regressed (the zcr file has other cases).

Run: `npx vitest run tests/audio-utils.test.js tests/utils-audio-utils.test.js`
Expected: PASS (all)

- [ ] **Step 5: Check callers of `findZeroCrossing` for off-by-one sensitivity**

Run: `grep -rn "findZeroCrossing(" src --include="*.js" | grep -v "audio-utils.js" | grep -v findAllZeroCrossings`
For each caller: the returned index moved +1 sample (onto the first sample after the crossing) — this is a *boundary snap*, callers use it as a loop/trim point; one sample later is equally valid and now consistent. No caller changes expected; note any that do arithmetic like `index - 1` in the commit message.

- [ ] **Step 6: Commit**

```bash
git add src/scripts/audio-utils.js
git commit -m "Fix zero-crossing semantics to match librosa (later index; pad=True rate)"
```

### Task 3: Make randomSequence deterministic (injectable rng) and fix its test

**Files:**
- Modify: `src/core/loopPlayground.js` (randomSequence, lines ~11-90)
- Modify: `tests/random-sequence.test.js`

- [ ] **Step 1: Add an injectable `rng` option and single-draw cumulative-weight selection.** In `randomSequence`, change the options signature and the action-selection code:

```javascript
export function randomSequence(
  buffer,
  { durationMs = buffer.duration * 1000, minMs = 10, maxMs = buffer.duration * 1000, steps = 4, rng = Math.random } = {},
) {
```

Inside the step loop, replace whatever currently draws randomness for action selection with exactly one `rng()` draw per step through this helper (add above `randomSequence`):

```javascript
function pickWeighted(actions, rng) {
  const totalW = actions.reduce((s, { w }) => s + w, 0)
  let r = rng() * totalW
  for (const a of actions) {
    r -= a.w
    if (r < 0) return a.op
  }
  return actions[actions.length - 1].op
}
```

Keep the right-side-drift guard logic but make it draw-free (it may *override* the picked op to 'reset'/'move'; it must not consume rng draws). All other `Math.random()` calls inside `randomSequence` (if any — e.g., duration jitter) must switch to `rng()`.

- [ ] **Step 2: Rewrite the test to inject rng directly (no Math.random spying).** With weights `move:32, half:20, double:16, reverse:12, reset:20` (cumulative 32/52/68/80/100), draws 0.10→move, 0.40→half, 0.60→double, 0.75→reverse:

```javascript
import { describe, it, expect } from 'vitest'
import { AudioContext } from '../web-audio-test-api/index.js'
import { randomSequence } from '../src/core/loopPlayground.js'

describe('randomSequence', () => {
  it('uses weighted actions deterministically via injected rng and respects durationMs', () => {
    const ctx = new AudioContext({ sampleRate: 44100 })
    const buffer = ctx.createBuffer(1, 44100, 44100)
    const randVals = [0.10, 0.40, 0.60, 0.75]
    const rng = () => randVals.shift() ?? 0
    const seq = randomSequence(buffer, { durationMs: 500, steps: 4, rng })
    expect(seq.length).toBe(4)
    const ops = seq.map(fn => fn.op)
    expect(ops).toEqual(['move', 'half', 'double', 'reverse'])
    const res = seq[0]()
    const len = (res.loop.endSample - res.loop.startSample) / buffer.sampleRate
    expect(len).toBeLessThanOrEqual(0.5)
  })
})
```

If the right-side guard overrides any of these four picks, adjust the guard so it only activates when `startSample > buffer.length * 0.7` (a fresh full-buffer loop starts at 0 — no override should fire; debug until ops match, changing the *implementation*, not the expectations).

- [ ] **Step 3: Run and verify**

Run: `npx vitest run tests/random-sequence.test.js` — Expected: PASS.
Also: `grep -n "Math.random" src/core/loopPlayground.js` inside `randomSequence` — Expected: no hits (only the `rng` default).

- [ ] **Step 4: Commit**

```bash
git add src/core/loopPlayground.js tests/random-sequence.test.js
git commit -m "Make randomSequence deterministic via injectable rng; single-draw weighted selection"
```

### Task 4: Re-golden the signatureDemo test against current choreography

The implementation (`src/core/demoSequences.js`) is the current artistic intent; the test encodes an older 60-step choreography ('move×3' labels, length 60). Snapshot the real sequence and assert it exactly (self-golden).

**Files:**
- Modify: `tests/signature-demo.test.js`

- [ ] **Step 1: Snapshot actual ops**

```bash
node --input-type=module -e "
import { AudioContext } from './web-audio-test-api/index.js'
globalThis.window = { AudioContext }
const { signatureDemo } = await import('./src/core/index.js')
const ctx = new AudioContext({ sampleRate: 44100 })
const buffer = ctx.createBuffer(1, 44100, 44100)
const steps = signatureDemo(buffer)
console.log(JSON.stringify(steps.map(s => s.op)), steps.length)
"
```

(If the import chain trips on browser globals, run the same snippet as a temporary vitest test instead.)

- [ ] **Step 2: Replace the stale expectations** with the snapshot (keep structure checks):

```javascript
describe('signatureDemo', () => {
  it('produces the canonical signature choreography', () => {
    const ctx = new AudioContext({ sampleRate: 44100 })
    const buffer = ctx.createBuffer(1, 44100, 44100)
    const steps = signatureDemo(buffer)
    const ops = steps.map(s => s.op)
    expect(ops).toEqual(PASTE_SNAPSHOT_ARRAY_HERE)  // literal array from Step 1
    for (const s of steps) expect(typeof s.fn).toBe('function')
  })
})
```

`PASTE_SNAPSHOT_ARRAY_HERE` is replaced with the literal printed array during execution — it is ground truth captured in Step 1, not a design choice.

- [ ] **Step 3: Run full suite — expect 28/28 green (all five original failures fixed)**

Run: `npx vitest run` — Expected: `Tests  28 passed`.

- [ ] **Step 4: Commit**

```bash
git add tests/signature-demo.test.js
git commit -m "Re-golden signatureDemo test against current choreography"
```

### Task 5: Monorepo restructure — move the library

**Files:** (all `git mv` — preserve history)
- `src/scripts/` → `packages/pleco-xa/src/scripts/`
- `src/core/` → `packages/pleco-xa/src/core/`
- `src/lib/` → `packages/pleco-xa/src/lib/`
- `src/utils/` → `packages/pleco-xa/src/utils/`
- `src/index.js` → `packages/pleco-xa/src/index.js` (replaced in Task 7)
- `tests/` → `packages/pleco-xa/tests/`; `vitest.config.js` → `packages/pleco-xa/vitest.config.js`; `web-audio-test-api/` → `packages/pleco-xa/web-audio-test-api/`
- `rollup.config.js` → `packages/pleco-xa/rollup.config.js` (fixed in Task 7)
- Delete: `src/workers/analysisWorker.js` (zero consumers — spec §6), `astro/` (broken-from-npm astro entry; Astro components return as a proper subpackage in Wave 6), `.npmignore` (superseded by `files` whitelist), `babel.config.cjs`, `test-worker.cjs` (both unreferenced), `src/scripts/index.js` + `src/scripts/xa-complete.js` (redundant/broken barrels — canonical barrel is `src/index.js`)

- [ ] **Step 1: Moves**

```bash
mkdir -p packages/pleco-xa apps/demo
git mv src/scripts packages/pleco-xa/src-scripts-tmp
mkdir -p packages/pleco-xa/src
git mv packages/pleco-xa/src-scripts-tmp packages/pleco-xa/src/scripts
git mv src/core packages/pleco-xa/src/core
git mv src/lib packages/pleco-xa/src/lib
git mv src/utils packages/pleco-xa/src/utils
git mv src/index.js packages/pleco-xa/src/index.js
git mv tests packages/pleco-xa/tests
git mv vitest.config.js packages/pleco-xa/vitest.config.js
git mv web-audio-test-api packages/pleco-xa/web-audio-test-api
git mv rollup.config.js packages/pleco-xa/rollup.config.js
git rm -r src/workers astro .npmignore babel.config.cjs test-worker.cjs
git rm packages/pleco-xa/src/scripts/index.js packages/pleco-xa/src/scripts/xa-complete.js
```

- [ ] **Step 2: Verify no library file references the deleted barrels**

Run: `grep -rn "scripts/index.js\|xa-complete" packages/pleco-xa/src apps 2>/dev/null`
Expected: no hits (fix any by importing the concrete module instead).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Move library into packages/pleco-xa (npm workspaces layout)"
```

### Task 6: Monorepo restructure — move the demo app

**Files:** (git mv)
- `src/pages|components|styles|assets`, `src/env.d.ts` → `apps/demo/src/...`
- `public/` → `apps/demo/public/`
- `astro.config.mjs`, `postcss.config.cjs`, `tsconfig.json`, `Procfile`, `railway.json`, `railway.toml`, `nixpacks.toml`, `deploying/` → `apps/demo/`
- `scripts/sync-public-deps.js` → `apps/demo/scripts/sync-public-deps.js` (source path updated)
- Root notes → `docs/notes/`

- [ ] **Step 1: Moves**

```bash
mkdir -p apps/demo/src docs/notes
git mv src/pages src/components src/styles src/assets src/env.d.ts apps/demo/src/ 2>/dev/null || true
git mv public apps/demo/public
git mv astro.config.mjs postcss.config.cjs tsconfig.json Procfile railway.json railway.toml nixpacks.toml deploying apps/demo/
git mv scripts/sync-public-deps.js apps/demo/scripts/sync-public-deps.js
rmdir scripts src 2>/dev/null || true
git mv circular.md "circular copy.md" think.md BPM_MIGRATION_PLAN.md LB_COMPLETE_UNDERSTANDING.md LB_OUTPUT_LINE_BY_LINE_TRACE.md "Performing long-running tasks on iOS and iPadOS  Apple Developer Documentation.md" docs/notes/ 2>/dev/null || true
```

(`src/assets` holds ~28 MB audio — it moves to the demo where it's used; it never enters the npm package.)

- [ ] **Step 2: Update `sync-public-deps.js` source root** — edit its source-directory constant from `src/scripts` (or equivalent) to `../../packages/pleco-xa/src/scripts` relative to its new location; read the file and update the path constants at the top accordingly (mechanical; keep the whitelist as-is — the rip dies in Wave 6).

- [ ] **Step 3: Rewire demo imports to the `@pleco` alias**

```bash
cd apps/demo && grep -rl "\.\./scripts/\|\.\./core/\|/src/scripts/" src --include="*.astro" --include="*.js" | while read f; do
  sed -i '' -e "s|from '\.\./scripts/|from '@pleco/scripts/|g" \
            -e "s|from '\.\./core/|from '@pleco/core/|g" \
            -e "s|from '/src/scripts/|from '@pleco/scripts/|g" \
            -e "s|import('\.\./scripts/|import('@pleco/scripts/|g" "$f"
done && cd ../..
```

Then: `grep -rn "\.\./scripts/\|\.\./core/\|/src/scripts/" apps/demo/src | grep -v node_modules` — Expected: no import hits remain (runtime `/scripts/...` public URLs in `is:inline` scripts are fine and expected).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Move Astro demo into apps/demo"
```

### Task 7: Workspace wiring — three package.json files, alias, fixed build, curated barrel

**Files:**
- Rewrite: `package.json` (root), Create: `apps/demo/package.json`, `packages/pleco-xa/package.json`
- Modify: `apps/demo/astro.config.mjs` (alias), `packages/pleco-xa/rollup.config.js`
- Rewrite: `packages/pleco-xa/src/index.js` (curated barrel)

- [ ] **Step 1: Root `package.json`** (replace entirely):

```json
{
  "name": "pleco-xa-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev": "npm run dev -w @pleco-xa/demo",
    "build": "npm run build -w pleco-xa && npm run build -w @pleco-xa/demo",
    "build:lib": "npm run build -w pleco-xa",
    "test": "npm run test -w pleco-xa",
    "start": "node apps/demo/dist/server/entry.mjs"
  }
}
```

- [ ] **Step 2: `packages/pleco-xa/package.json`:**

```json
{
  "name": "pleco-xa",
  "version": "2.0.0-alpha.0",
  "type": "module",
  "description": "Browser-native audio analysis engine: musical timing, BPM/beat tracking, spectral features, and intelligent loop detection",
  "license": "MIT",
  "author": "Cameron Brooks",
  "repository": { "type": "git", "url": "git+https://github.com/brookcs3/pleco-xa.git" },
  "homepage": "https://github.com/brookcs3/pleco-xa#readme",
  "bugs": { "url": "https://github.com/brookcs3/pleco-xa/issues" },
  "keywords": ["audio", "audio-analysis", "web-audio", "bpm", "beat-tracking", "loop-detection", "mir", "music", "dsp", "spectrogram"],
  "engines": { "node": ">=18" },
  "sideEffects": false,
  "main": "./dist/pleco-xa.js",
  "module": "./dist/pleco-xa.js",
  "exports": { ".": "./dist/pleco-xa.js" },
  "files": ["dist/", "README.md", "LICENSE", "NOTICE"],
  "scripts": {
    "build": "rollup -c",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build && npm run test"
  },
  "devDependencies": {
    "@rollup/plugin-node-resolve": "^16.0.1",
    "jsdom": "^26.1.0",
    "rollup": "^4.24.0",
    "rollup-plugin-esbuild": "^6.2.1",
    "vitest": "^3.1.4"
  }
}
```

- [ ] **Step 3: `apps/demo/package.json`:**

```json
{
  "name": "@pleco-xa/demo",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "presync": "node scripts/sync-public-deps.js",
    "start": "node dist/server/entry.mjs"
  },
  "dependencies": {
    "@astrojs/node": "^9.5.0",
    "astro": "^5.15.3",
    "autoprefixer": "^10.4.21",
    "gsap": "^3.13.0",
    "lenis": "^1.3.3",
    "modern-normalize": "^3.0.1",
    "pleco-xa": "*",
    "sass": "^1.89.0"
  }
}
```

- [ ] **Step 4: `@pleco` alias in `apps/demo/astro.config.mjs`** — read the existing config and merge into its export:

```javascript
import { fileURLToPath } from 'node:url'
// inside defineConfig({ ... }):
  vite: {
    resolve: {
      alias: {
        '@pleco': fileURLToPath(new URL('../../packages/pleco-xa/src', import.meta.url)),
      },
    },
  },
```

(If a `vite` block already exists, merge — don't duplicate keys.)

- [ ] **Step 5: Fixed `packages/pleco-xa/rollup.config.js`** (terser dependency removed):

```javascript
import { nodeResolve } from '@rollup/plugin-node-resolve'
import esbuild, { minify } from 'rollup-plugin-esbuild'

export default {
  input: 'src/index.js',
  output: [
    { file: 'dist/pleco-xa.js', format: 'es', sourcemap: true },
    { file: 'dist/pleco-xa.min.js', format: 'es', sourcemap: true, plugins: [minify()] },
  ],
  plugins: [nodeResolve(), esbuild({ target: 'es2020' })],
}
```

- [ ] **Step 6: Curated barrel `packages/pleco-xa/src/index.js`** (replace entirely — only import-safe, audit-verified modules; grows per wave):

```javascript
/**
 * Pleco-Xa — browser-native audio analysis engine.
 * Wave-0 curated surface: every export here is import-safe in Node and browser.
 * The surface grows namespace-by-namespace as each wave lands (see docs/superpowers/specs/).
 */

// Debug gate
export { setDebug, debugLog, isDebugEnabled } from './scripts/debug.js'

// Audio utilities
export {
  createLoopBuffer, exportBufferAsWav, computeRMS, computePeak,
  computeZeroCrossingRate, defineMultipleLoopPoints, reverseBufferSection,
  findZeroCrossing, findAllZeroCrossings, findAudioStart, applyHannWindow,
} from './scripts/audio-utils.js'

// Spectral core (numerical-parity repairs land in Wave 1)
export {
  fft, ifft, stft, istft, get_window, hann_window, hamming_window,
  blackman_window, magnitude, phase, power, polar_to_complex,
  fft_frequencies, spectrogram,
} from './scripts/xa-fft.js'

// Rhythm (canonical engines per CLAUDE.md: lb-migrated path + Ellis DP tracker)
export { BeatTracker, beat_track, tempo, quickBeatTrack, dynamicBeatTrack } from './scripts/xa-beat-tracker.js'
export * as bpm from './scripts/xa-bpm-algorithm.js'

// Loop detection (flagship — consolidation lands in Wave 3)
export { fastLoopAnalysis } from './scripts/xa-loop.js'
```

- [ ] **Step 7: Install + full verification.** Delete stale root `node_modules` and `package-lock.json` first (workspaces re-resolve):

```bash
rm -rf node_modules package-lock.json && npm install
npm run test          # expect: 28 passed
npm run build:lib     # expect: dist/pleco-xa.js + .min.js written
node --input-type=module -e "import('./packages/pleco-xa/dist/pleco-xa.js').then(m => { console.log('exports:', Object.keys(m).length); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })"
                      # expect: exports: <N>, exit 0 — THE Node import-smoke (catches top-level DOM access)
npm run build         # expect: astro build succeeds for apps/demo
```

If the import-smoke fails on a module in the barrel's import chain (e.g., a transitive DOM access), remove that export from the barrel, note it in the commit message, and file it for its wave.

- [ ] **Step 8: Dev-server spot check**

Run: `npm run dev` — open the demo, load a sample loop on the index page, confirm BPM detection and loop playback still work. (Manual gate — the demo working is Wave 0's do-not-break invariant.)

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Wire npm workspaces: library package, demo app, fixed rollup build, curated barrel"
```

### Task 8: Licensing hygiene

**Files:**
- Create: `NOTICE` (root) and `packages/pleco-xa/NOTICE` (copy); Modify: `LICENSE` (unchanged MIT — NOTICE handles attribution)

- [ ] **Step 1: Create `NOTICE`:**

```
Pleco-Xa
Copyright (c) 2025-2026 Cameron Brooks

This library includes implementations of audio-analysis algorithms from
librosa (https://github.com/librosa/librosa), used under the ISC License:

  Copyright (c) 2013--2023, librosa development team.

  Permission to use, copy, modify, and/or distribute this software for any
  purpose with or without fee is hereby granted, provided that the above
  copyright notice and this permission notice appear in all copies.

  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
  WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
  MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
  ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
  WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
  ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
  OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

```bash
cp NOTICE packages/pleco-xa/NOTICE
git add NOTICE packages/pleco-xa/NOTICE && git commit -m "Add librosa ISC attribution NOTICE"
```

### Task 9: Fix CI — vitest instead of jest, lib build + import smoke + demo build, preserve Pages deploy

**Files:**
- Rewrite: `.github/workflows/test.yml`

- [ ] **Step 1: Replace the workflow** (jest install/run removed; codecov removed — no coverage provider installed; Pages deploy preserved, now shipping `apps/demo/dist`):

```yaml
name: CI and Deploy

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Test (vitest)
        run: npm run test

      - name: Build library
        run: npm run build:lib

      - name: Node import smoke (catches top-level DOM access)
        run: node --input-type=module -e "import('./packages/pleco-xa/dist/pleco-xa.js').then(m => console.log('exports:', Object.keys(m).length))"

      - name: Build demo (consumer e2e)
        run: npm run build -w @pleco-xa/demo

      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/demo/dist

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - id: deployment
        uses: actions/deploy-pages@v2
```

Note: the demo currently builds in SSR mode (`@astrojs/node`) for Railway — if `apps/demo/dist` isn't a static site, the Pages upload keeps prior behavior (it uploaded the same dist before). Do not change the Astro output mode in Wave 0.

- [ ] **Step 2: Commit and push the branch; verify Actions runs green**

```bash
git add .github/workflows/test.yml && git commit -m "CI: run vitest, build library with Node import smoke, build demo, keep Pages deploy"
git push -u origin v2-wave-0
gh run watch --exit-status || gh run view --log-failed
```

Expected: build job green (deploy job skipped on non-main branch).

### Task 10: Merge Wave 0

- [ ] **Step 1:** `npx vitest run` in `packages/pleco-xa` one final time (green), `npm run build` (both artifacts), demo spot-check if not already done.
- [ ] **Step 2:** Merge to main:

```bash
git checkout main && git merge --no-ff v2-wave-0 -m "Wave 0: monorepo restructure, green tests, working CI, buildable library"
git push
```

---

## Self-Review Notes

- **Spec coverage (Wave 0 items):** untracked files ✓ (T1), CI jest→vitest ✓ (T9), monorepo ✓ (T5–7), packaging skeleton ✓ (T7), NOTICE ✓ (T8), 5 failing tests ✓ (T2–4). Generated `.d.ts` types are deferred to Wave 1 (tsconfig.build lands with the parity harness) — deliberate, noted against spec §4.2.
- **Placeholder scan:** `PASTE_SNAPSHOT_ARRAY_HERE` in Task 4 is a capture-then-paste of ground truth with the exact capture command provided — not a design placeholder.
- **Consistency:** workspace names (`pleco-xa`, `@pleco-xa/demo`) match across root scripts, CI, and package files; alias `@pleco` matches the sed rewrites.
