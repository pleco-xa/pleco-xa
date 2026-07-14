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
// headroom. Current: 2095/2115 = 99.1% (2026-07-14). The residual ~0.9% is
// harness limitations (ScriptProcessorNode/realtime/HTMLMediaElement — not
// pleco defects), last-ULP float rounding, and a few documented edge cases.
const MIN_PASS_RATE = 99.0

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
