#!/usr/bin/env node
/**
 * Demo-coverage gate: every public API member demonstrated in examples/ or
 * explicitly ledgered. Exits 1 if any callable export is neither.
 *
 * Run:    npm run check:coverage
 *         (requires packages/pleco-xa/dist — run `npm run build:lib` first)
 * Report: coverage/demo-coverage.json (gitignored build artifact)
 *
 * Ledger escape hatch: examples/coverage-ledger.json (optional, tracked) maps
 * a member name to a short reason it is deliberately not demonstrated, e.g.
 *   { "playback.pause": "exercised implicitly by every playback demo" }
 * Ledgered members count as covered.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const mod = await import(join(root, 'packages/pleco-xa/dist/pleco-xa.js'))

// A public member worth "demonstrating" is a CALLABLE export (function/class).
// Namespace sub-members: only enumerate function values — skip `default`
// (re-exported module default object) and non-function state/constants, which
// are not "called" and were previously credited by coincidental name matches.
const members = []
const nonCallable = []
for (const [k, v] of Object.entries(mod)) {
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Float32Array)) {
    for (const [sub, sv] of Object.entries(v)) {
      if (sub === 'default') continue
      if (typeof sv === 'function') members.push(`${k}.${sub}`)
      else nonCallable.push(`${k}.${sub}`)
    }
  } else if (typeof v === 'function') {
    members.push(k)
  } else {
    nonCallable.push(k)
  }
}

let corpus = ''
for (const dir of ['examples/node', 'examples/web']) {
  const p = join(root, dir)
  if (!existsSync(p)) continue
  for (const f of readdirSync(p, { withFileTypes: true })) {
    if (f.name.startsWith('_') || !f.isFile()) continue
    if (!/\.(mjs|js|html)$/.test(f.name)) continue
    corpus += readFileSync(join(p, f.name), 'utf8') + '\n'
  }
}

const ledgerPath = join(root, 'examples/coverage-ledger.json')
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : {}

// "Demonstrated" now requires a genuine CALL-SITE — `foo(` (bare, incl.
// `new foo(` and destructured-then-called) or `ns.foo(` (namespaced/method).
// The old bare property-ref and destructure-ref branches were name-presence
// checks that credited prose/`<code>` mentions and coincidental locals.
const rows = members.map((m) => {
  const short = m.includes('.') ? m.split('.')[1] : m
  const esc = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const used = new RegExp(
    `(^|[^\\w.])${esc}\\s*\\(` +   // call: foo(   (also `new foo(`, destructured foo())
    `|\\.${esc}\\s*\\(`,          // namespaced/method call: ns.foo(
  ).test(corpus)
  const ledgered = ledger[m] || null
  return { member: m, covered: used, ledgered }
})
const uncovered = rows.filter(r => !r.covered && !r.ledgered)
const pct = (100 * (rows.length - uncovered.length) / rows.length).toFixed(1)

mkdirSync(join(root, 'coverage'), { recursive: true })
writeFileSync(join(root, 'coverage/demo-coverage.json'), JSON.stringify({ generated: new Date().toISOString(), total: rows.length, coveredOrLedgered: rows.length - uncovered.length, pct, uncovered: uncovered.map(r => r.member), nonCallable, rows }, null, 1))
console.log(`coverage: ${rows.length - uncovered.length}/${rows.length} (${pct}%) demonstrated-or-ledgered [call-site check]`)
console.log(`(non-callable exports excluded from the gate: ${nonCallable.length})`)
if (uncovered.length) {
  console.log('uncovered:'); for (const r of uncovered) console.log('  -', r.member)
}
process.exit(uncovered.length ? 1 : 0)
