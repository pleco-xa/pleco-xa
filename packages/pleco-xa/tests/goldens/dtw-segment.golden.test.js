import { describe, it, expect } from 'vitest'
import { dtw, dtwBacktracking } from '../../src/sequence/dtw.js'
import {
  recurrenceMatrix,
  recurrenceToLag,
  agglomerative,
} from '../../src/segment/index.js'
import { loadFixture, expectClose } from './helpers.js'

const fixture = loadFixture('dtw_segment')
const [dtwCase, segCase] = fixture.cases

/** Reshape a flat row-major array into nested rows. */
function reshape(flat, [rows, cols]) {
  const out = []
  for (let i = 0; i < rows; i++) {
    out.push(flat.slice(i * cols, (i + 1) * cols))
  }
  return out
}

/** Flatten rows-of-arrays row-major. */
function flatten(rows) {
  const out = []
  for (const row of rows) for (const v of row) out.push(v)
  return out
}

describe('dtw golden vs committed reference fixture (default params)', () => {
  const X = reshape(dtwCase.input.X, dtwCase.input.X_shape)
  const Y = reshape(dtwCase.input.Y, dtwCase.input.Y_shape)

  it('cumulative cost D[-1][-1] within 1e-6 relative', () => {
    const { D } = dtw(X, Y)
    const got = D[D.length - 1][D[0].length - 1]
    const want = dtwCase.dtw_D_last
    expect(Math.abs(got - want) / Math.abs(want)).toBeLessThan(1e-6)
  })

  it('warping path exact (reference end-to-start order)', () => {
    const { wp } = dtw(X, Y)
    expect(wp).toEqual(dtwCase.dtw_path)
  })

  it('dtwBacktracking over the recorded step matrix reproduces the path', () => {
    const { wp, steps } = dtw(X, Y, { returnSteps: true })
    expect(dtwBacktracking(steps)).toEqual(wp)
  })
})

describe('segment golden vs committed reference fixtures', () => {
  const feats = reshape(segCase.input.feats, segCase.input.feats_shape)
  const k = segCase.input.k
  const [, t] = segCase.input.feats_shape

  it('recurrence_matrix mode=connectivity sym=true: exact 0/1 agreement', () => {
    const rec = recurrenceMatrix(feats, { k, sym: true, mode: 'connectivity' })
    expect(flatten(rec)).toEqual(segCase.recurrence_connectivity)
  })

  it('recurrence_matrix mode=affinity sym=true: toleranced agreement', () => {
    const rec = recurrenceMatrix(feats, { k, sym: true, mode: 'affinity' })
    expectClose(flatten(rec), segCase.recurrence_affinity, {
      label: 'recurrence affinity',
    })
  })

  it('recurrence_to_lag pad=false: exact vs the connectivity fixture', () => {
    const conn = reshape(segCase.recurrence_connectivity, [t, t])
    const lag = recurrenceToLag(conn, { pad: false })
    expect(flatten(lag)).toEqual(segCase.lag_nopad)
  })

  it('agglomerative(feats, 5): exact boundary frames', () => {
    const bounds = agglomerative(feats, 5)
    expect(Array.from(bounds)).toEqual(segCase.agglomerative_k5)
  })
})
