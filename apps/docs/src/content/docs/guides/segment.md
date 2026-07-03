---
title: Segment — recurrence, lag, and Laplacian structure
description: pleco-xa's segment namespace — recurrence and cross-similarity matrices, the time-lag shear, agglomerative boundaries, and McFee-Ellis Laplacian segmentation.
---

`segment` turns a feature matrix into structure: self-similarity (recurrence) and
cross-similarity graphs, the recurrence↔lag shear, temporally-constrained agglomerative
boundaries, and the full **McFee-Ellis Laplacian spectral segmentation** built on top of
them. It is the structural-analysis layer that the segmentation demo surfaced, and it is
where pleco-xa's [`linalg`](/api/pleco-xa/namespaces/linalg/readme/) and
[`cluster`](/api/pleco-xa/namespaces/cluster/readme/) primitives earn their keep.

Recurrence, the recurrence↔lag conversions, and agglomerative boundaries are fixture-gated
against librosa 0.11 (`dtw_segment.json`, case 2): connectivity exact, affinity toleranced,
lag exact, boundary frames exact.

## Key functions

Verified against the built barrel (`segment` namespace):

- **`recurrenceMatrix(data, opts)`** → `(t, t)` self-similarity. Modes `'connectivity'` /
  `'distance'` / `'affinity'`; `sym: true` keeps **mutual** nearest neighbours.
- **`crossSimilarity(data, dataRef, opts)`** → `(n_ref, n)` graph from one sequence into a
  reference.
- **`recurrenceToLag(rec, opts)`** / **`lagToRecurrence(lag)`** — the real time-lag shear
  (`lag[i][j] = rec[(i + j) mod H][j]`) and its inverse.
- **`agglomerative(data, k, opts)`** → `Uint32Array` of left-boundary frame indices (always
  starts with 0); greedy Ward merges of adjacent segments.
- **`laplacianSegmentation(features, opts)`** → `{ segmentIds, boundaries }`; McFee-Ellis
  (2014) spectral clustering: recurrence → time-lag median filter → normalized Laplacian →
  `eigh` → `kmeans`.

## Example

```js
import { segment } from 'pleco-xa'

// features: 2D matrix, rows = feature dims, columns = frames (librosa d×n layout)
const R = segment.recurrenceMatrix(features, {
  mode: 'affinity',
  width: 3,
  sym: true,
})

// Structural segmentation into k sections:
const { segmentIds, boundaries } = segment.laplacianSegmentation(features, { k: 5 })
// segmentIds[i] is frame i's section; boundaries are the internal onset frames

// Exact librosa parity uses two feature streams (repetition vs. local continuity):
const seg2 = segment.laplacianSegmentation(
  { recurrenceFeatures: chroma, pathFeatures: mfcc },
  { k: 5, mu: 0.5 },
)
```

## Notes

- **Input is never shape-guessed.** Pass a 2D matrix (rows = features, columns = frames) or
  a flat typed array with explicit `{ nFeatures, nFrames }`. Ambiguous flat input throws.
- **`width` must satisfy `1 <= width <= (n - 1) // 2`** — tiny sequences need an explicit
  `width`, since the default band can exceed the bound.
- **`sym` is mutual-NN**, i.e. the element-wise minimum with the transpose (not union/max).
  The returned matrix is in librosa's transposed orientation: `rec[i][j]` non-zero means
  frame `i` is a k-NN of frame `j`.
- **`laplacianSegmentation` has two input forms:** a single feature stack (the same matrix
  drives both the recurrence and path graphs) or the two-feature object form
  `{ recurrenceFeatures, pathFeatures }`, which matches the librosa example's CQT-for-repetition
  / MFCC-for-continuity split. Both matrices must share the same number of frames.
- `boundaries` from `laplacianSegmentation` are the internal label transitions
  (`1 + where(seg[:-1] ≠ seg[1:])`); `agglomerative` instead returns left edges starting at 0.

## API reference

Full signatures: [segment namespace](/api/pleco-xa/namespaces/segment/readme/) — e.g.
[`recurrenceMatrix`](/api/pleco-xa/namespaces/segment/functions/recurrenceMatrix/),
[`laplacianSegmentation`](/api/pleco-xa/namespaces/segment/functions/laplacianSegmentation/),
[`agglomerative`](/api/pleco-xa/namespaces/segment/functions/agglomerative/).
