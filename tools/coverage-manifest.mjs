#!/usr/bin/env node
/** Demo-coverage gate: every public API member demonstrated in examples/ or explicitly ledgered. */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const mod = await import(join(root, 'packages/pleco-xa/dist/pleco-xa.js'))

const members = []
for (const [k, v] of Object.entries(mod)) {
  if (typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Float32Array)) {
    for (const sub of Object.keys(v)) members.push(`${k}.${sub}`)
  } else {
    members.push(k)
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

const rows = members.map((m) => {
  const short = m.includes('.') ? m.split('.')[1] : m
  const esc = short.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const used = new RegExp(
    `(^|[^\\w.])${esc}\\s*\\(` +   // bare call:        foo(
    `|\\.${esc}\\s*\\(` +          // namespaced call:  ns.foo(
    `|\\.${esc}\\b` +             // namespaced ref:   ns.foo
    `|[{,\\s]${esc}[,}\\s:]`,     // destructure/ref:  { foo }  , foo
  ).test(corpus)
  const ledgered = ledger[m] || null
  return { member: m, covered: used, ledgered }
})
const uncovered = rows.filter(r => !r.covered && !r.ledgered)
const pct = (100 * (rows.length - uncovered.length) / rows.length).toFixed(1)

writeFileSync(join(root, 'docs/notes/demo-coverage.json'), JSON.stringify({ generated: new Date().toISOString(), total: rows.length, coveredOrLedgered: rows.length - uncovered.length, pct, uncovered: uncovered.map(r => r.member), rows }, null, 1))
console.log(`coverage: ${rows.length - uncovered.length}/${rows.length} (${pct}%) demonstrated-or-ledgered`)
if (uncovered.length) {
  console.log('uncovered:'); for (const r of uncovered.slice(0, 40)) console.log('  -', r.member)
  if (uncovered.length > 40) console.log(`  ... +${uncovered.length - 40} more`)
}
process.exit(uncovered.length ? 1 : 0)
