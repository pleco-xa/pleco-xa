/**
 * tests/wpt/run-wpt.mjs — headless WPT conformance harness for pleco's engine.
 *
 * Runs a curated set of web-platform-tests `webaudio/the-audio-api/**`
 * behavioral tests against the Pleco Web Audio engine and reports the real
 * conformance delta. It does NOT cherry-pick passing tests: it runs every file
 * in the curated (offline-renderable) directories and tallies whatever falls
 * out — pass, fail, error, or timeout.
 *
 * How it works:
 *   1. Install the spec-named engine globals (shim.js) + a minimal testharness
 *      surface (testharness-shim.js) onto the host realm's globalThis. Running
 *      in the host realm (not a vm sandbox) means the Float32Arrays the engine
 *      produces and the ones the tests instanceof-check are the same intrinsic
 *      — no cross-realm mismatch.
 *   2. For each test HTML: extract its <script> chunks (external wpt resource
 *      helpers — audit.js / audit-util.js / etc. loaded verbatim — plus the
 *      inline test body), concatenate, and run them in one indirect eval so the
 *      browser's shared top-level-lexical model is reproduced.
 *   3. Drain every promise_test / async_test to settlement (bounded by a
 *      per-file timeout), collect {name,status,message}, tally.
 *
 * Usage:
 *   node tests/wpt/run-wpt.mjs                # run the whole curated set
 *   node tests/wpt/run-wpt.mjs gain biquad    # only files whose path matches
 *   WPT_DIR=/path/to/wpt node tests/wpt/run-wpt.mjs
 *   node tests/wpt/run-wpt.mjs --json         # machine-readable summary
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { installEngineGlobals } from './shim.js'
import { installTestharness, Harness } from './testharness-shim.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WPT_DIR = process.env.WPT_DIR || '/Users/cameronbrooks/Developer/wpt'
const AUDIO_API = path.join(WPT_DIR, 'webaudio', 'the-audio-api')

const PER_FILE_TIMEOUT_MS = Number(process.env.WPT_TIMEOUT_MS || 8000)

// The curated set: offline-renderable behavioral interfaces. Everything here is
// exercised; nothing inside is skipped except by the SKIP_PATTERNS below (which
// remove files that structurally require a browser: worklet-module fetch over a
// secure context, realtime-only robustness harnesses, or crashtests).
const CURATED_DIRS = [
  'the-audiobuffer-interface',
  'the-audiobuffersourcenode-interface',
  'the-gainnode-interface',
  'the-oscillatornode-interface',
  'the-audioparam-interface',
  'the-delaynode-interface',
  'the-biquadfilternode-interface',
  'the-channelmergernode-interface',
  'the-channelsplitternode-interface',
  'the-stereopanner-interface',
  'the-constantsourcenode-interface',
  'the-analysernode-interface',
]

// Structurally un-runnable in a headless offline harness (documented as skips).
const SKIP_PATTERNS = [
  /\.https\./, // secure-context: worklet module fetch / realtime robustness
  /crashtests/, // browser crash reproductions, not behavioral assertions
  /rendersizehint/, // render-size-hint robustness needs the realtime driver
  /active-processing/, // observes realtime "active processing" lifecycle
]

// ---------------------------------------------------------------------------
// Host-realm environment: window/self, timers, a local-file XHR, fetch stub.
// ---------------------------------------------------------------------------

function installEnvironment() {
  const g = globalThis
  g.window = g
  g.self = g

  if (typeof g.requestAnimationFrame !== 'function')
    g.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16)
  if (typeof g.cancelAnimationFrame !== 'function')
    g.cancelAnimationFrame = (id) => clearTimeout(id)

  // Minimal XMLHttpRequest that reads local wpt files (used by
  // Audit.loadFileFromUrl to pull reference .wav fixtures off disk).
  g.XMLHttpRequest = class XMLHttpRequest {
    constructor() {
      this.responseType = ''
      this.status = 0
      this.response = null
      this.onload = null
      this.onerror = null
      this._url = null
    }
    open(_method, url) {
      this._url = url
    }
    setRequestHeader() {}
    send() {
      queueMicrotask(() => {
        try {
          const fsPath = resolveResourceUrl(this._url, g.__currentTestDir)
          const buf = readFileSync(fsPath)
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
          this.status = 200
          this.response =
            this.responseType === 'arraybuffer' ? ab : buf.toString('utf8')
          if (this.onload) this.onload()
        } catch (e) {
          this.status = 0
          if (this.onerror) this.onerror(e)
          else if (this.onload) this.onload()
        }
      })
    }
  }

  // Always override: Node's native global fetch rejects the relative URLs
  // (e.g. "resources/foo.wav") that the tests use to load reference fixtures.
  g.fetch = async (url) => {
    const fsPath = resolveResourceUrl(url, g.__currentTestDir)
    const buf = readFileSync(fsPath)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => ab,
      text: async () => buf.toString('utf8'),
    }
  }
}

function resolveResourceUrl(url, testDir) {
  if (!url) throw new Error('empty url')
  if (url.startsWith('/')) return path.join(WPT_DIR, url.slice(1))
  return path.resolve(testDir || AUDIO_API, url)
}

// ---------------------------------------------------------------------------
// HTML <script> extraction
// ---------------------------------------------------------------------------

const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
const SRC_RE = /\bsrc\s*=\s*["']([^"']+)["']/i

function extractScripts(html, testDir) {
  // Returns ordered array of { kind: 'external'|'inline', src?, code } chunks,
  // plus a list of missing/unresolved external refs.
  const chunks = []
  const missing = []
  let m
  SCRIPT_RE.lastIndex = 0
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const attrs = m[1] || ''
    const body = m[2] || ''
    const srcMatch = SRC_RE.exec(attrs)
    if (srcMatch) {
      const src = srcMatch[1]
      // Our own testharness reimplementation replaces these.
      if (/testharness(report)?\.js$/.test(src)) continue
      let fsPath
      try {
        fsPath = resolveResourceUrl(src, testDir)
      } catch {
        missing.push(src)
        continue
      }
      if (!existsSync(fsPath)) {
        missing.push(src)
        continue
      }
      chunks.push({ kind: 'external', src, code: readFileSync(fsPath, 'utf8') })
    } else {
      if (body.trim().length) chunks.push({ kind: 'inline', code: body })
    }
  }
  return { chunks, missing }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function listTestFiles(filters) {
  const files = []
  for (const dir of CURATED_DIRS) {
    const abs = path.join(AUDIO_API, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) {
      if (!name.endsWith('.html')) continue
      const rel = `${dir}/${name}`
      const full = path.join(abs, name)
      if (!statSync(full).isFile()) continue
      if (SKIP_PATTERNS.some((re) => re.test(rel))) continue
      if (filters.length && !filters.some((f) => rel.includes(f))) continue
      files.push({ rel, full, dir })
    }
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel))
  return files
}

function listSkipped(filters) {
  const skipped = []
  for (const dir of CURATED_DIRS) {
    const abs = path.join(AUDIO_API, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs)) {
      if (!name.endsWith('.html')) continue
      const rel = `${dir}/${name}`
      if (filters.length && !filters.some((f) => rel.includes(f))) continue
      const hit = SKIP_PATTERNS.find((re) => re.test(rel))
      if (hit) skipped.push({ rel, reason: hit.source })
    }
  }
  return skipped
}

// ---------------------------------------------------------------------------
// Run a single file
// ---------------------------------------------------------------------------

const runSource = eval

async function runFile(file) {
  const html = readFileSync(file.full, 'utf8')
  const testDir = path.dirname(file.full)
  const { chunks, missing } = extractScripts(html, testDir)

  const harness = new Harness()
  globalThis.__activeHarness = harness
  globalThis.__currentTestDir = testDir
  // Reset window.done — audit.js overwrites it with a throwing stub each run.
  globalThis.done = (...a) => globalThis.__activeHarness.done(...a)

  const source = chunks.map((c) => c.code).join('\n;\n')

  const record = { rel: file.rel, dir: file.dir, missing, harness, error: null, timedOut: false }

  let evalError = null
  try {
    runSource(source)
  } catch (e) {
    evalError = e
  }

  if (evalError) {
    record.error = evalError
    // Surface the load-time crash as a single synthetic failure so it counts.
    harness._fail(`${file.rel} [load]`, evalError && evalError.message ? evalError.message : String(evalError))
    return record
  }

  let timedOut = false
  await Promise.race([
    harness.waitForCompletion(),
    new Promise((r) =>
      setTimeout(() => {
        timedOut = true
        r()
      }, PER_FILE_TIMEOUT_MS),
    ),
  ])
  record.timedOut = timedOut
  if (timedOut && harness.results.length === 0) {
    harness._fail(`${file.rel} [timeout]`, `no result within ${PER_FILE_TIMEOUT_MS}ms (likely needs realtime driver)`)
  }
  return record
}

// ---------------------------------------------------------------------------
// Failure clustering for the report
// ---------------------------------------------------------------------------

function normalizeMessage(msg) {
  return (msg || '(no message)')
    .replace(/-?\d+\.?\d*e[+-]?\d+/gi, 'N') // exponentials
    .replace(/-?\d+\.\d+/g, 'N') // decimals
    .replace(/\bindex \d+/g, 'index K')
    .replace(/\b\d+\b/g, 'N') // bare ints
    .replace(/0x[0-9a-f]+/gi, 'H')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const asJson = args.includes('--json')
  const dumpFailures = args.includes('--failures')
  const filters = args.filter((a) => !a.startsWith('--'))

  const bound = installEngineGlobals(globalThis)
  installTestharness(globalThis)
  installEnvironment()

  const files = listTestFiles(filters)
  const skipped = listSkipped(filters)

  const records = []
  for (const file of files) {
    const rec = await runFile(file)
    records.push(rec)
  }

  // Tally
  let totalTests = 0
  let passedTests = 0
  const perFile = []
  const failureClusters = new Map()

  for (const rec of records) {
    const s = rec.harness.summary()
    totalTests += s.total
    passedTests += s.passed
    perFile.push({
      rel: rec.rel,
      passed: s.passed,
      total: s.total,
      timedOut: rec.timedOut,
      loadError: !!rec.error,
    })
    for (const r of rec.harness.results) {
      if (r.status !== 'fail') continue
      const key = normalizeMessage(r.message)
      if (!failureClusters.has(key)) failureClusters.set(key, [])
      failureClusters.get(key).push({ file: rec.rel, name: r.name, message: r.message })
    }
  }

  const failedTests = totalTests - passedTests
  const rate = totalTests ? ((passedTests / totalTests) * 100).toFixed(1) : '0.0'

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          bound,
          filesExecuted: files.length,
          filesSkipped: skipped.length,
          totalTests,
          passedTests,
          failedTests,
          passRate: Number(rate),
          perFile,
          skipped,
        },
        null,
        2,
      ),
    )
    finish()
    return
  }

  // ---- human report ----
  const line = '─'.repeat(78)
  console.log(line)
  console.log('WPT the-audio-api conformance harness — pleco engine')
  console.log(line)
  console.log(`Engine globals bound : ${bound.length}`)
  console.log(`Files executed       : ${files.length}`)
  console.log(`Files skipped        : ${skipped.length} (structurally un-runnable headless)`)
  console.log(`Per-file timeout     : ${PER_FILE_TIMEOUT_MS} ms`)
  console.log(line)
  console.log('FILE'.padEnd(58) + 'PASS/TOTAL'.padStart(12) + '   FLAG')
  console.log(line)
  for (const f of perFile) {
    const ratio = `${f.passed}/${f.total}`
    const flag = f.loadError
      ? 'LOAD-ERR'
      : f.timedOut
        ? 'TIMEOUT'
        : f.passed === f.total && f.total > 0
          ? 'ok'
          : f.total === 0
            ? 'empty'
            : ''
    console.log(f.rel.padEnd(58) + ratio.padStart(12) + '   ' + flag)
  }
  console.log(line)
  console.log(
    `OVERALL: ${passedTests}/${totalTests} assertions passed  (${rate}%)  across ${files.length} files`,
  )
  console.log(line)

  // Top failure clusters
  const clusters = [...failureClusters.entries()].sort((a, b) => b[1].length - a[1].length)
  console.log(`TOP FAILURE REASONS (${failedTests} failing assertions in ${clusters.length} clusters):`)
  console.log(line)
  for (const [key, items] of clusters.slice(0, 20)) {
    const filesForKey = [...new Set(items.map((i) => i.file.split('/').pop()))]
    console.log(`[${String(items.length).padStart(4)}]  ${key}`)
    console.log(
      `        files: ${filesForKey.slice(0, 5).join(', ')}${filesForKey.length > 5 ? ` (+${filesForKey.length - 5} more)` : ''}`,
    )
    console.log(`        e.g.:  ${items[0].file} :: ${truncate(items[0].name, 70)}`)
  }
  console.log(line)

  if (dumpFailures) {
    console.log('ALL FAILING ASSERTIONS (for triage):')
    console.log(line)
    for (const rec of records) {
      const fails = rec.harness.results.filter((r) => r.status === 'fail')
      if (!fails.length) continue
      console.log(`\n### ${rec.rel}`)
      for (const f of fails) {
        console.log(`  - ${truncate(f.name, 90)}`)
        if (f.message) console.log(`      ${truncate(f.message, 160)}`)
      }
    }
    console.log(line)
  }

  finish()
}

function truncate(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n) + '…' : s
}

function finish() {
  // Abandoned realtime/timeout tests may keep timers alive; exit cleanly.
  process.exit(0)
}

process.on('unhandledRejection', () => {})
process.on('uncaughtException', (e) => {
  // A test body throwing asynchronously post-timeout must not kill the run.
  if (String(e && e.message).includes('no active harness')) return
})

main()
