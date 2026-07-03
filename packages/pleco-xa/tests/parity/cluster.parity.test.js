import { describe, it, expect } from 'vitest'
import { kmeans } from '../../src/cluster/kmeans.js'
import { loadFixture, expectClose } from './helpers.js'

const fixture = loadFixture('cluster')

/** Reshape a flat row-major array into nested rows. */
function reshape(flat, [rows, cols]) {
  const out = []
  for (let i = 0; i < rows; i++) {
    out.push(flat.slice(i * cols, (i + 1) * cols))
  }
  return out
}

/**
 * Canonicalize a labeling the same way the fixture generator does: sort the
 * clusters by centroid (x, then y) and remap labels/centers to that order.
 * This removes the arbitrary label permutation so results are comparable.
 */
function canonicalize(labels, centers) {
  const k = centers.length
  const order = Array.from({ length: k }, (_, c) => c).sort(
    (a, b) => centers[a][0] - centers[b][0] || centers[a][1] - centers[b][1],
  )
  const remap = new Array(k)
  order.forEach((old, newIdx) => (remap[old] = newIdx))
  const canonLabels = Array.from(labels, (l) => remap[l])
  const canonCenters = order.map((old) => centers[old])
  return { canonLabels, canonCenters }
}

describe('kmeans parity vs sklearn.cluster.KMeans (separable blobs)', () => {
  for (const c of fixture.cases) {
    const { X, shape, k } = c.input
    const points = reshape(X, shape)

    it(`k=${k}, shape=${shape.join('x')}: labels/centers/inertia agree`, () => {
      const { labels, centers, inertia } = kmeans(points, k, { seed: 0 })
      const { canonLabels, canonCenters } = canonicalize(labels, centers)

      // Well-separated blobs ⇒ the partition is unique: labels match exactly.
      expect(canonLabels).toEqual(c.expected_labels)

      // Centroids within 1e-2 (fixture stores them as float32).
      expectClose(canonCenters.flat(), c.expected_centers, {
        rtol: 0,
        atol: 1e-2,
        label: 'centers',
      })

      // Inertia within 1e-3.
      expect(Math.abs(inertia - c.expected_inertia)).toBeLessThanOrEqual(1e-3)
    })

    it('is deterministic across repeated calls with the same seed', () => {
      const a = kmeans(points, k, { seed: 7 })
      const b = kmeans(points, k, { seed: 7 })
      expect(Array.from(a.labels)).toEqual(Array.from(b.labels))
      expect(a.inertia).toBe(b.inertia)
    })

    it('accepts typed-array rows and returns an Int32Array labeling', () => {
      const typed = points.map((row) => Float64Array.from(row))
      const { labels } = kmeans(typed, k, { seed: 0 })
      expect(labels).toBeInstanceOf(Int32Array)
      expect(labels.length).toBe(shape[0])
    })
  }

  it('throws with diagnostics on invalid inputs', () => {
    expect(() => kmeans([], 2)).toThrow(/non-empty 2D array/)
    expect(() => kmeans([[0, 0], [1, 1]], 0)).toThrow(/positive integer/)
    expect(() => kmeans([[0, 0], [1, 1]], 5)).toThrow(/cannot exceed nSamples/)
    expect(() => kmeans([[0, 0], [Number.NaN, 1]], 2)).toThrow(/non-finite/)
    expect(() => kmeans([[0, 0], [1]], 2)).toThrow(/length/)
  })
})
