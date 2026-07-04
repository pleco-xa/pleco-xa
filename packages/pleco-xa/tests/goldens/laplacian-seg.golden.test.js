import { describe, it, expect } from 'vitest'
import { loadFixture } from './helpers.js'
import { laplacianSegmentation } from '../../src/segment/laplacian-segmentation.js'

// The full structure-segmentation pipeline chains a CQT that pleco only
// approximates, so we cross-check the SPECTRAL-CLUSTERING HALF against the
// reference implementation's own primitives (recurrence matrix + time-lag
// filter + normalized graph Laplacian eigendecomposition + k-means) on
// CONTROLLED two-feature input. Boundaries are permutation- and
// eigenvector-sign-invariant, so exact boundary agreement is a real check.
function reshape(flat, [rows, cols]) {
  const m = []
  for (let r = 0; r < rows; r++) m.push(flat.slice(r * cols, (r + 1) * cols))
  return m
}

describe('golden: laplacianSegmentation two-feature form (McFee-Ellis)', () => {
  const c = loadFixture('laplacian_seg').cases[0]
  const rec = reshape(c.input.recurrenceFeatures, c.input.rec_shape)
  const pth = reshape(c.input.pathFeatures, c.input.path_shape)

  it('recovers reference boundaries exactly from separate recurrence/path features', () => {
    const { segmentIds, boundaries } = laplacianSegmentation(
      { recurrenceFeatures: rec, pathFeatures: pth },
      { k: c.input.k, width: c.input.width, mu: c.input.mu },
    )
    expect(boundaries).toEqual(c.expected_boundaries)
    expect(new Set(segmentIds).size).toBe(c.expected_nsegments)
  })

  it('is deterministic across runs (same seed → identical boundaries)', () => {
    const a = laplacianSegmentation({ recurrenceFeatures: rec, pathFeatures: pth }, { k: 3 })
    const b = laplacianSegmentation({ recurrenceFeatures: rec, pathFeatures: pth }, { k: 3 })
    expect(a.boundaries).toEqual(b.boundaries)
  })

  it('both feature streams genuinely affect the result (path features are not ignored)', () => {
    // Same recurrence features, but a flat path stream removes local continuity;
    // the segmentation must change (proves pathFeatures is actually consumed).
    const flatPath = pth.map((row) => row.map(() => 1))
    // A constant path stream makes successive-distance σ degenerate → honest throw.
    expect(() =>
      laplacianSegmentation({ recurrenceFeatures: rec, pathFeatures: flatPath }, { k: 3 }),
    ).toThrow(/bandwidth/)
  })

  it('single-feature form (one matrix for both graphs) still works', () => {
    const { segmentIds } = laplacianSegmentation(rec, { k: 3 })
    expect(new Set(segmentIds).size).toBe(3)
  })

  it('rejects a half-specified two-feature object', () => {
    expect(() => laplacianSegmentation({ recurrenceFeatures: rec }, { k: 3 })).toThrow(/BOTH/)
  })

  it('rejects mismatched frame counts between the two feature matrices', () => {
    const shortPath = pth.map((row) => row.slice(0, 40))
    expect(() =>
      laplacianSegmentation({ recurrenceFeatures: rec, pathFeatures: shortPath }, { k: 3 }),
    ).toThrow(/same number of frames/)
  })
})
