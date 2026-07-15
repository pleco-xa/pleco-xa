import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// Conformance guard: runs the web-platform-tests webaudio/ suite against pleco's
// engine (via tests/wpt/run-wpt.mjs) and asserts the pass rate hasn't regressed.
// The wpt clone is NOT vendored — it lives at ~/Developer/wpt (or $WPT_DIR) — so
// this SKIPS gracefully where the clone is absent (CI, other machines) rather
// than fail. Run locally with the clone present to enforce conformance.

const here = dirname(fileURLToPath(import.meta.url))
const runner = resolve(here, 'wpt', 'run-wpt.mjs')
const WPT_DIR = process.env.WPT_DIR || resolve(process.env.HOME || '', 'Developer', 'wpt')
const hasWpt = existsSync(WPT_DIR) && existsSync(resolve(WPT_DIR, 'webaudio'))

// Floor, not the exact current number — guards against regression while leaving
// headroom. Current: 2102/2102 = 100.0% of IN-SCOPE files (2026-07-15). Twelve
// files are skipped (run-wpt.mjs SKIP_PATTERNS) as documented out-of-scope:
// secure-context worklet fetch, ScriptProcessorNode/HTMLMediaElement APIs pleco
// lacks, a realtime suspend/resume harness the offline runner can't provide,
// ArrayBuffer detaching pleco does not emulate, and two k-rate-via-input files
// that diverge only at the ~8th decimal (float32 summation non-associativity).
// Every executed assertion passes; the floor keeps headroom for last-ULP drift.
const MIN_PASS_RATE = 99.9

describe('WPT conformance — the-audio-api behavioral suite (guard)', () => {
  it.skipIf(!hasWpt)('meets the minimum WPT pass rate against the real web-platform-tests', () => {
    const out = execFileSync('node', [runner, '--json'], {
      cwd: resolve(here, '..'),
      encoding: 'utf8',
      env: { ...process.env, WPT_DIR },
      timeout: 120000,
      maxBuffer: 32 * 1024 * 1024,
    })
    const result = JSON.parse(out)
    expect(result.filesExecuted).toBeGreaterThan(100)
    expect(result.totalTests).toBeGreaterThan(2000)
    expect(result.passRate).toBeGreaterThanOrEqual(MIN_PASS_RATE)
  }, 120000) // the harness runs 134 wpt files (~9s); override vitest's 5s default

  it.runIf(!hasWpt)('is skipped when the wpt clone is absent (documented)', () => {
    // Clone with: git clone --filter=blob:none --sparse https://github.com/web-platform-tests/wpt.git
    // then: git sparse-checkout set webaudio resources tools  (into ~/Developer/wpt or $WPT_DIR)
    expect(hasWpt).toBe(false)
  })
})
