import { describe, it, expect } from 'vitest'
import { laplacianSegmentation } from '../src/segment/laplacian-segmentation.js'

/**
 * UNIT test, NOT a parity fixture — deliberately.
 *
 * librosa's Laplacian-segmentation example (docs/examples/plot_segmentation.py)
 * derives its feature matrix from a log-power CQT + beat-synchronous median
 * aggregation. pleco only *approximates* the CQT stage, so an end-to-end
 * comparison against a librosa fixture would test the CQT approximation, not the
 * spectral-clustering recipe this module implements. Every numeric primitive the
 * recipe is built from is already parity-gated on its own (linalg.json for
 * eigh/laplacian, cluster.json for kmeans, dtw_segment.json for the recurrence /
 * lag pipeline). What remains to prove is that the *composition* recovers known
 * structure — so we feed it a synthetic matrix whose segmentation is unambiguous
 * and assert the boundaries land where they must.
 */

/** mulberry32 — deterministic PRNG so the synthetic noise is reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Build a (d × n) feature matrix (librosa layout) with `blocks` contiguous
 * segments of `perBlock` frames each. Every block gets a distinct constant
 * feature vector plus small deterministic Gaussian-ish noise so the recurrence
 * graph is well-defined (no zero-distance degeneracy) but the block structure
 * dominates.
 */
function makeBlocks({ d = 12, perBlock = 20, blocks = 3, noise = 0.01, seed = 1 } = {}) {
  const rng = mulberry32(seed)
  const n = perBlock * blocks
  // Distinct constant vectors: block b activates feature (b * step).
  const step = Math.floor(d / blocks)
  const feats = Array.from({ length: d }, () => new Float64Array(n))
  for (let t = 0; t < n; t++) {
    const b = Math.floor(t / perBlock)
    const active = b * step
    for (let f = 0; f < d; f++) {
      const base = f === active ? 1 : 0
      // Box-Muller-free small perturbation: (rng-0.5) is fine for separation.
      feats[f][t] = base + noise * (rng() - 0.5)
    }
  }
  return { feats, n, perBlock, blocks }
}

describe('laplacianSegmentation (McFee-Ellis spectral clustering) on synthetic structure', () => {
  it('recovers exactly 3 segments with boundaries at [20, 40] within ±2 frames', () => {
    const { feats, perBlock } = makeBlocks({ blocks: 3, perBlock: 20 })
    const { segmentIds, boundaries } = laplacianSegmentation(feats, { k: 3 })

    // Return-shape contract.
    expect(segmentIds).toBeInstanceOf(Int32Array)
    expect(segmentIds.length).toBe(60)
    expect(Array.isArray(boundaries)).toBe(true)

    // Exactly 3 contiguous segments ⇒ exactly 2 internal boundaries.
    expect(boundaries.length).toBe(2)

    // Boundaries within ±2 frames of the true onsets [20, 40].
    const expected = [perBlock, 2 * perBlock] // [20, 40]
    for (let i = 0; i < expected.length; i++) {
      expect(Math.abs(boundaries[i] - expected[i])).toBeLessThanOrEqual(2)
    }

    // Three distinct labels, and each label owns one contiguous block.
    const distinct = new Set(Array.from(segmentIds))
    expect(distinct.size).toBe(3)
    // Segment interiors (away from the ±2 slack) must be internally constant.
    for (const [lo, hi] of [[2, 18], [22, 38], [42, 58]]) {
      const label = segmentIds[lo]
      for (let t = lo; t <= hi; t++) expect(segmentIds[t]).toBe(label)
    }
    // The three interior labels are mutually distinct.
    expect(new Set([segmentIds[10], segmentIds[30], segmentIds[50]]).size).toBe(3)
  })

  it('is deterministic across repeated calls (seeded kmeans + fixed pipeline)', () => {
    const { feats } = makeBlocks({ seed: 42 })
    const a = laplacianSegmentation(feats, { k: 3 })
    const b = laplacianSegmentation(feats, { k: 3 })
    expect(Array.from(a.segmentIds)).toEqual(Array.from(b.segmentIds))
    expect(a.boundaries).toEqual(b.boundaries)
  })

  it('accepts typed-array feature rows', () => {
    const { feats } = makeBlocks({ seed: 7 })
    const typed = feats.map((row) => Float32Array.from(row))
    const { boundaries } = laplacianSegmentation(typed, { k: 3 })
    expect(boundaries.length).toBe(2)
    expect(Math.abs(boundaries[0] - 20)).toBeLessThanOrEqual(2)
    expect(Math.abs(boundaries[1] - 40)).toBeLessThanOrEqual(2)
  })

  it('throws with diagnostics on invalid inputs', () => {
    const { feats } = makeBlocks()
    expect(() => laplacianSegmentation([], { k: 3 })).toThrow(/non-empty 2D matrix/)
    expect(() => laplacianSegmentation(feats, { k: 0 })).toThrow(/positive integer/)
    expect(() => laplacianSegmentation(feats, { k: 999 })).toThrow(/cannot exceed/)
    expect(() => laplacianSegmentation(feats, { k: 3, mu: 1.5 })).toThrow(/mu=.*\[0, 1\]/)
    // Ragged rows (unequal frame counts) must be rejected, not guessed.
    const ragged = [new Float64Array(5), new Float64Array(4)]
    expect(() => laplacianSegmentation(ragged, { k: 2 })).toThrow(/equal length/)
  })
})
