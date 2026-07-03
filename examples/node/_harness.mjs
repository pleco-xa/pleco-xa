/** Tiny proof harness for node examples: check() rows + summary + exit code. */
const rows = []
export function check(name, got, expected, tol = 0) {
  let pass
  if (typeof expected === 'number' && typeof got === 'number') {
    pass = tol > 0 ? Math.abs(got - expected) <= tol : Object.is(got, expected) || got === expected
  } else {
    pass = JSON.stringify(got) === JSON.stringify(expected)
  }
  rows.push({ name, got, expected, pass })
  return pass
}
export function checkTrue(name, cond, detail = '') {
  rows.push({ name, got: detail || cond, expected: true, pass: !!cond })
  return !!cond
}
export function summary(title) {
  const failed = rows.filter(r => !r.pass)
  console.log(`\n=== ${title} ===`)
  for (const r of rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  got=${fmt(r.got)} expected=${fmt(r.expected)}`)
  }
  console.log(`${rows.length - failed.length}/${rows.length} proofs pass`)
  process.exit(failed.length ? 1 : 0)
}
const fmt = (v) => typeof v === 'number' ? +v.toFixed(6) : JSON.stringify(v)?.slice(0, 60)
