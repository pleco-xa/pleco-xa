# Pleco-XA vs librosa — Parity Report: structure-sequence

**Domain:** DTW, recurrence matrices, segmentation/agglomerative clustering, sequence alignment (RQA/Viterbi), interval utilities.
**Pleco files examined (full reads):**
- `/Users/cameronbrooks/Developer/pleco-xa/src/scripts/xa-dtw.js` (389 loc)
- `/Users/cameronbrooks/Developer/pleco-xa/src/scripts/xa-temporal.js` (759 loc)
- `/Users/cameronbrooks/Developer/pleco-xa/src/scripts/xa-recurrence.js` (466 loc)
- `/Users/cameronbrooks/Developer/pleco-xa/src/scripts/xa-matching.js` (580 loc)
- `/Users/cameronbrooks/Developer/pleco-xa/src/scripts/xa-intervals.js` (596 loc)

**Librosa sources examined (full reads):**
- `librosa/sequence.py` (dtw, dtw_backtracking, rqa, viterbi family, transition_*)
- `librosa/segment.py` (cross_similarity, recurrence_matrix, recurrence_to_lag, lag_to_recurrence, timelag_filter, agglomerative, subsegment, path_enhance)
- `librosa/util/matching.py` (match_intervals, match_events)
- `librosa/core/intervals.py` (interval_frequencies, pythagorean_intervals, plimit_intervals)
- `librosa/filters.py::diagonal_filter`, `librosa/util/utils.py::shear` (helpers for path_enhance / lag conversion)

All runtime-behavior claims below (typed-array truncation, missing `splice`, `Array.isArray` on Float32Array) were verified with Node one-liners, not just read.

---

## 1. Function-by-function parity table

### librosa.sequence

| librosa fn | pleco equivalent | status | fidelity notes |
|---|---|---|---|
| `dtw` | `xa-dtw.js::dtw` | **partial** | Core DP + default steps [[1,1],[1,0],[0,1]] + additive weights present. Missing: `weights_mul` (param `_weights_mul` accepted, ignored), `subseq` (param `_subseq` ignored — no subsequence matching function `D[-1,:]`), precomputed-`C` input, `return_steps`. Custom `step_sizes_sigma` *replaces* the defaults; librosa *appends* customs to defaults with inf-weighted defaults. Sakoe-Chiba band uses normalized `|i/n − j/m| ≤ band_rad` vs librosa's absolute `int(band_rad·min(C.shape))` via `fill_off_diagonal` — different band geometry for non-square C. No NaN validation, no "no valid path" errors (returns `Infinity` silently). Returns padded `(n+1)×(m+1)` D (librosa returns N×M). Extra return: `normalized_distance = D[n][m]/(n+m)`. Perf: cost matrix builds a fresh `X.map(row => row[i])` array per cell — O(n·m·d) allocations. |
| `dtw_backtracking` | `xa-dtw.js::findPath` | **partial** | librosa backtracks the recorded **step matrix** from the forward pass. Pleco greedily re-derives the path from D by picking the min-cost predecessor. For the default (unweighted) step set this reconstructs an optimal path; with nonzero `weights_add` it is **wrong** because the comparison omits the weights. No `subseq`/`start` support. |
| `rqa` | — | **missing** | No RQA (Serrà L/S/Q modes, knight moves, gap penalties). `loop-smart.js` hand-rolls a weaker cousin (longest strict-diagonal run in a lag matrix), essentially L-mode RQA without the DP or backtracking. |
| `viterbi` | — | **missing** | `xa-rhythm.js::viterbiBeats` builds a Viterbi-shaped DP table and then *ignores it* (beats emitted by modular arithmetic). There is no general HMM decoder in pleco. |
| `viterbi_discriminative` | — | **missing** | — |
| `viterbi_binary` | — | **missing** | — |
| `transition_uniform` / `transition_loop` / `transition_cycle` / `transition_local` | — | **missing** (grouped) | No transition-matrix constructors anywhere in pleco (nothing would consume them without a viterbi). |

### librosa.segment

| librosa fn | pleco equivalent | status | fidelity notes |
|---|---|---|---|
| `cross_similarity` | `xa-temporal.js::crossSimilarity` | **partial** | Same intent (kNN graph between two sequences; default `k = min(n_ref, 2·ceil(sqrt(n_ref)))` matches). Three divergences: (1) **dimension inference is broken** — `Math.floor(data.length / (data.length / data.length))` is identically `data.length`, so `d` is always 1 and any multi-feature matrix is treated as a stream of scalar frames; (2) `mode='connectivity'` returns the raw kNN **distances**, not a binary matrix (librosa returns bool); (3) affinity kernel is Gaussian `exp(−d²/(2·bw²))` vs librosa's `exp(−d/bw)`. Only scalar median-of-kth-NN bandwidth (≈`med_k_scalar`); librosa has 6 named estimators + array/scalar. Custom `{sparse:true, indices, values}` format vs scipy CSC. No `full` option. |
| `recurrence_matrix` | `xa-temporal.js::recurrenceMatrix` **and** `xa-recurrence.js::recurrenceMatrix` (name collision, incompatible layouts) | **partial** | *xa-temporal version* (closer to librosa): self-distances + diagonal band exclusion (`_setDiagonal(∞)` over `−width+1..width−1`, matching librosa's `setdiag(0)`) + kNN + optional `self` diagonal. Default `k = min(t−1, 2·ceil(sqrt(t−2·width+1)))` matches. But `sym` uses element-wise **max** of `(i,j)`/`(j,i)` — the *union* of directed links — while librosa's `rec.minimum(rec.T)` keeps only **mutual** nearest neighbors: opposite semantics. Same affinity-kernel and d=1 dimension bugs as crossSimilarity. No `full`, no width-vs-t validation. *xa-recurrence version*: no kNN at all — dense cosine similarity thresholded at 0.5 (connectivity), plus a `S·0.5 + min(S)·0.5` bias step that exists nowhere in librosa; width filter zeroes `|i−j| ≤ width` only when `width > 1`; operates on 2-D `Array<Float32Array>`. Additionally its input features are garbage: `computeFFT` is a stub that packs the raw time-domain frame into interleaved complex format **without performing any FFT**, so "chroma" is folded waveform samples. |
| `recurrence_to_lag` | `xa-temporal.js::recurrenceToLag` (+ snake_case alias) and `xa-recurrence.js::recurrenceToLag` | **partial** (effectively missing in xa-temporal) | librosa: zero-pad (optional) then `shear(rec, factor=-1)` so `lag[i, j] = rec[i+j, j]` (signed lag, preserves direction). *xa-temporal*: `_shear`, `_padMatrix`, `_padSparseMatrix` are documented **no-op stubs** returning a copy — the function returns the input unchanged. *xa-recurrence*: computes an **unsigned**-lag accumulation `lag[|i−j|][min(i,j)] += R[i][j]` over a 2n-padded matrix — double-counts symmetric pairs and destroys direction; usable for its own peak-picking (`findLoopCandidates`) but not librosa-equivalent. |
| `lag_to_recurrence` | `xa-temporal.js::lagToRecurrence` (+ alias) | **missing** (in effect) | `_shear(+1)` stub returns a copy; `_sliceMatrix` truncates the flat array. Round-tripping `recurrenceToLag → lagToRecurrence` does not reproduce librosa behavior; it's an identity-ish copy. |
| `timelag_filter` | — | **missing** | Decorator wrapping a filter in lag space; trivially blocked by the missing shear. |
| `agglomerative` | `xa-temporal.js::agglomerative` | **partial** (runtime-broken) | Intent matches (temporally-constrained bottom-up merge to k contiguous segments; adjacent-only merging correctly mirrors librosa's grid-connectivity constraint; returns left boundaries starting with 0). But: (1) **`distances` is a `Float32Array` and line 294 calls `distances.splice(...)` — typed arrays have no `splice`, so the first merge throws `TypeError`**; i.e. it crashes for every `k < n` (verified: `typeof Float32Array.prototype.splice === 'undefined'`). (2) default `linkage='ward'` silently falls through to *average* linkage (only single/complete/average implemented; librosa uses sklearn Ward). (3) same `d=1` dimension-inference bug — multi-feature data is misread. (4) `k >= n` returns *all* frame indices instead of erroring/no-op. |
| `subsegment` | — | **missing** | No per-interval constrained re-clustering (would need a working `agglomerative` first). |
| `path_enhance` | `xa-temporal.js::pathEnhance` | **partial** | Structure matches librosa: ratios log-spaced base-2 between `minRatio=1/maxRatio` and `maxRatio` (`_logspace` ≡ `np.logspace(..., base=2)`), one 2-D convolution per ratio, element-wise max aggregation, optional clip-at-0. Divergences: kernel construction — librosa `diagonal_filter` places a 1-D window *along* the diagonal (`np.diag(get_window(...))` rotated by `arctan(slope)` with spline interpolation, normalized to sum 1); pleco builds a stripe where the window tapers *across* the stripe via `weight = 0.5 + 0.5·cos(2π·d/n)` on `d = |i − j·slope|` — a different (wider, blockier) filter with different frequency response. `zeroMean` subtracts the *global* mean; librosa subtracts a constant only from the *off-diagonal* coordinates. Assumes flat square `Float32Array` (`size = sqrt(R.length)`); no multi-channel. Extra: `n` is optional with a size/8 heuristic (librosa requires `n`). |

### librosa.util (interval/event matching — in-scope "sequence alignment utilities")

| librosa fn | pleco equivalent | status | fidelity notes |
|---|---|---|---|
| `match_intervals` | `xa-matching.js::Matcher.matchIntervals` (+ `quickMatchIntervals`) | **partial** | The algorithm is a genuinely faithful port: Jaccard scoring, argsort of starts/ends, `searchsorted` pruning (`right` on starts vs query end, `left` on ends vs query start), set-intersection of candidates, strict-mode error, non-strict closest-disjoint fallback. **But it is numerically corrupted for real inputs:** `startIndex`/`endIndex` are `Uint32Array`, and `startIndex.map(i => intervalsTo[i][0])` returns a **`Uint32Array`** (TypedArray `map` preserves type — verified: `[0.5, 1.75, 3.25] → [3, 0, 1]` when mapped through), so all interval boundaries are floored to unsigned integers before the binary search. Any intervals expressed in fractional seconds (the normal case) get wrong candidate sets and wrong non-strict distances. Minor divergences: pleco's `_jaccard` returns 1.0 for two identical zero-length intervals (librosa returns 0); pleco's non-strict "after" candidate uses `startIndex[searchEnds[i]]` while librosa uses `start_index[search_ends[i] + 1]` (librosa's own off-by-one quirk — pleco's is arguably more correct, but it's a behavioral difference). |
| `match_events` | `xa-matching.js::Matcher.matchEvents` (+ `quickMatchEvents`) | **partial** | Left/right constraint validation and the middle/left/right selection logic are ported line-for-line (including librosa's asymmetric tie handling). **Same `Uint32Array.map` truncation bug** on `sortedFrom`/`sortedTo` — event times in seconds are floored to integers before matching, so e.g. beats at 1.4 s and 1.9 s both match as "1". Also negative event times would wrap (Uint32). `matchBeatsToOnsets` (extra, see below) inherits this: its per-match `error` is computed from the *un*truncated values against a mapping computed from truncated ones. |

### librosa.core.intervals

| librosa fn | pleco equivalent | status | fidelity notes |
|---|---|---|---|
| `interval_frequencies` | `xa-intervals.js::IntervalConstructor.intervalFrequencies` | **partial** | `'equal'` (with tuning), `'pythagorean'`, `'ji3'/'ji5'/'ji7'` dispatch, octave tiling, sort-then-scale all match. Bug for custom interval arrays: librosa sets `bins_per_octave = len(ratios)`; pleco keeps the caller's `binsPerOctave` (default 12) for `nOctaves = ceil(nBins/binsPerOctave)`, so e.g. `nBins=9, intervals=[1, 4/3, 3/2]` yields only 3 filled entries and **6 trailing zeros** (librosa returns 3 octaves). Float32 output vs float64. |
| `pythagorean_intervals` | `pythagoreanIntervals` | **partial** | librosa stacks only **non-negative** powers of 3 (`pow3 = arange(bins_per_octave)`, ascending fifths — the docstring explicitly distinguishes this from 3-limit). Pleco centers powers around zero (`start = −floor(binsPerOctave/2)`, i.e. −6..5 for 12 bins), which is a symmetric ascending+descending-fifths set — numerically **different interval values** from librosa for the same `bins_per_octave` (pleco's set contains 4/3; librosa's contains the 3¹¹ fold instead). `sort=false` order also differs (librosa: circle-of-fifths order; pleco: centered-power order). Octave folding itself (round + normalize into [1,2)) is fine. |
| `plimit_intervals` | `plimitIntervals` | **full** | Faithful crystal-growth port: seeds = primes ± reciprocals, frontier expansion, greedy min-total-harmonic-distance selection, Tenney-height tie-break. Pleco's `_harmonicDistance = Σ logs·|a−b|` is **mathematically identical** to librosa's `logs·(a + b − 2·gcd)` formulation (verified componentwise for all sign combinations). Octave folding via `floor` ≡ librosa's `modf` + negative-fraction fix. Remaining nits: float32 ratios, HD not rounded to 6 decimals (occasional tie-order differences possible), `JSON.stringify` cache keys per pair (slow but correct). |

### Pleco extras (no librosa counterpart in this domain)

| pleco export | file | status | notes |
|---|---|---|---|
| `fastDTW` | xa-dtw.js | **extra** | Advertised FastDTW, but `constrainedDTW` is a stub that ignores the projected path/radius and calls full `dtw()` — so it is full DTW plus recursion overhead at every level. No speedup, strictly slower. |
| `dtwDistanceMatrix`, `dtwKMeans` | xa-dtw.js | **extra** | Pairwise DTW matrix + k-medoid-ish clustering for the DJ analyzer. Unseeded `Math.random` centers, possible duplicate initial centers. |
| `computeCostMatrix`, `euclideanDistance`, `manhattanDistance`, `cosineSimilarity`, `isWithinBand` | xa-dtw.js | **extra** | Exported internals (librosa delegates to `scipy.cdist`). |
| `recurrenceLoopDetection`, `findLoopCandidates`, `computeChroma`, `framesToTime` | xa-recurrence.js | **extra** | Pleco-unique loop-detection pipeline. Currently a dead end: `computeChroma` returns `Array<Float32Array>`; `stackMemory` validates rows with `Array.isArray(chroma[0])` which is `false` for `Float32Array` (verified), so it returns `[]` and `recurrenceLoopDetection` **always** takes the early fallback `{loopStart: 0, loopEnd: duration, confidence: 50, isFullTrack: true}` — fabricated output on every call. Even if fixed, the stub `computeFFT` means the chroma is analytically meaningless. `framesToTime` duplicates `librosa.core.frames_to_time` (out of this domain, correct formula). |
| `stackMemory` | xa-recurrence.js | **extra**/partial vs `librosa.feature.stack_memory` | Direction is inverted: librosa stacks *history* (`data[:, t − step·delay]`, zero-padded, output keeps n frames); pleco stacks the *future* (`frame + step·delay`) and truncates to `n − (nSteps−1)·delay` frames. Plus the Array.isArray validation bug above. |
| `Matcher.intervalOverlap/findEventsInWindow/calculateMatchingAccuracy`, `matchBeatsToOnsets` | xa-matching.js | **extra** | Convenience layer; `matchBeatsToOnsets` swallows errors → `{mapping: [], matchRate: 0}`. |
| `wellTemperedIntervals`, `analyzeInterval`, `ratiosToCents`, `centsToRatios`, `getNoteNames`, `compareTuningSystems`, `generateFrequencies`, `COMMON_INTERVALS` | xa-intervals.js | **extra** | Historical temperaments (Werckmeister/Kirnberger/Young), consonance analysis. Note `wellTemperedIntervals` is unreachable through `intervalFrequencies`' switch — semi-dead API. |

---

## 2. Confirmed runtime bugs (highest severity first)

1. **`xa-temporal.js` `agglomerative` throws on first merge** (line ~294): `distances` is `Float32Array`; `Float32Array.prototype.splice` is `undefined` → `TypeError` whenever `clusters.length > k`. The librosa-parity segmentation entry point cannot complete for any nontrivial input.
2. **`xa-matching.js` typed-array truncation** (lines 167-168, 364-365): `Uint32Array.map` preserves the element type, flooring all fractional interval boundaries / event times before search. All matching in seconds is silently integer-quantized. Node-verified.
3. **`xa-recurrence.js` pipeline dead-end**: `stackMemory`'s `Array.isArray(chroma[0])` check rejects `computeChroma`'s `Float32Array` rows → `recurrenceLoopDetection` always returns the fabricated fallback. Independently, `computeFFT` performs no FFT (packs time-domain samples as "spectrum") and the real butterfly `_fft` recurses into an undefined global `fft`.
4. **`xa-temporal.js` lag conversion is a no-op**: `_shear`/`_padMatrix`/`_padSparseMatrix`/`_sliceMatrix` are stubs; `recurrenceToLag`/`lagToRecurrence` return copies of the input. Any consumer (e.g. `loop-smart.js` "converts to lag space") is actually operating on the raw recurrence matrix.
5. **Dimension inference `Math.floor(data.length / (data.length / data.length)) === data.length`** in 4 places in xa-temporal (`crossSimilarity`, `recurrenceMatrix`, `agglomerative`, `_computeDistances`/`_clusterDistance`): `d` is always 1, so multi-feature matrices (chroma 12×n, stacked 120×n) are misinterpreted as `12n` scalar frames. Distance geometry is wrong for exactly the inputs librosa's segment module is designed for.
6. **`xa-dtw.js` weighted backtracking**: `findPath` compares bare `D` values, omitting `weights_add`, so paths can be non-optimal when custom weights are supplied; `weights_mul`/`subseq` accepted but ignored; `constrainedDTW` stub defeats `fastDTW`.

## 3. Semantics divergences worth documenting even after bug fixes

- `sym` in recurrenceMatrix: pleco = union of directed kNN links (max), librosa = mutual links only (min). Opposite filtering direction.
- Affinity kernel: pleco `exp(−d²/2bw²)` vs librosa `exp(−d/bw)` — different decay; downstream thresholds tuned on one will not transfer.
- `mode='connectivity'` in pleco returns distances, not binary.
- `pythagoreanIntervals` is a symmetric fifths set, not librosa's ascending-only definition.
- `stackMemory` embeds forward in time and shortens the sequence; librosa embeds backward and pads.
- Sakoe-Chiba band is normalized-coordinate in pleco, absolute-radius in librosa.

## 4. Consolidation suggestions

- Two exported `recurrenceMatrix`/`recurrenceToLag` pairs (xa-temporal flat-Float32Array vs xa-recurrence 2-D array) with the same names and incompatible layouts is an import hazard already noted for the `xa-complete.js` barrel. Keep xa-temporal's kNN skeleton (closest to librosa), give it a real shear, and reduce xa-recurrence to the loop-candidate application layer on top of it.
- `loop-smart.js`'s longest-diagonal-run search is L-mode RQA done by hand; a real `rqa` port (small DP, ~80 lines) would replace it and add gap tolerance for free.
- `ParameterError` is re-declared per-module (xa-temporal) and even per-instance (xa-matching's `this.ParameterError` — `instanceof` fails across Matcher instances). Should come from xa-util.js once.

## 5. Parity scorecard

| Category | full | partial | missing | extra |
|---|---|---|---|---|
| sequence (10 fns, transition_* grouped) | 0 | 2 (dtw, dtw_backtracking) | 5 groups (rqa, viterbi ×3, transition_* ×4) | 3 (fastDTW, dtwDistanceMatrix, dtwKMeans) |
| segment (8 fns) | 0 | 4 (cross_similarity, recurrence_matrix, recurrence_to_lag, path_enhance) | 4 (lag_to_recurrence*, timelag_filter, subsegment; agglomerative counted partial-broken) | 2 (recurrenceLoopDetection pipeline, stackMemory variant) |
| util.matching (2 fns) | 0 | 2 | 0 | 4 helper exports |
| core.intervals (3 fns) | 1 (plimit_intervals) | 2 | 0 | 6+ (well-tempered, consonance, cents utils) |

*lag_to_recurrence nominally exists but is a stub-copy; counted missing-in-effect.

**Bottom line:** the interval-construction module is the only near-faithful port (plimit crystal growth is genuinely correct). The matching module is a faithful port sabotaged by one typed-array footgun. The segment module has the right skeletons but is unusable in practice (agglomerative crashes, lag conversion no-ops, d=1 geometry). DTW works for the unweighted default case only. RQA and the entire Viterbi/transition family are absent.
