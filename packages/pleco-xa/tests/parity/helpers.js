import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

const FIXTURES = fileURLToPath(new URL('../../../../tools/parity/fixtures/', import.meta.url))

export function loadFixture(name) {
  return JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'))
}

/**
 * Elementwise closeness against a librosa-generated expected array.
 * Reports the worst offender on failure instead of drowning in diffs.
 */
export function expectClose(actual, expected, { rtol = 1e-5, atol = 1e-8, label = '' } = {}) {
  const a = Array.from(actual)
  const e = Array.from(expected)
  expect(a.length, `${label} length`).toBe(e.length)
  let worst = { i: -1, err: 0, tol: 0 }
  for (let i = 0; i < e.length; i++) {
    const err = Math.abs(a[i] - e[i])
    const tol = atol + rtol * Math.abs(e[i])
    if (err - tol > worst.err - worst.tol) worst = { i, err, tol, got: a[i], want: e[i] }
  }
  if (worst.i >= 0 && worst.err > worst.tol) {
    expect.fail(
      `${label} max deviation at [${worst.i}]: got ${worst.got}, want ${worst.want} ` +
      `(|err|=${worst.err.toExponential(3)} > tol=${worst.tol.toExponential(3)})`,
    )
  }
}
