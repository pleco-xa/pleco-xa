---
title: Sequence — DTW, RQA, Viterbi, and transitions
description: pleco-xa's sequence namespace — bit-exact dynamic time warping, recurrence quantification, interval/event matching, Viterbi decoding, and transition-matrix constructors.
---

`sequence` is pleco-xa's alignment and decoding layer: dynamic time warping (DTW),
recurrence quantification analysis (RQA), interval/event matching, Viterbi decoding, and the
transition-matrix constructors that feed it. DTW is the headline — its cumulative cost is
numerically exact and its warping path is fixture-gated (`dtw_segment.json`,
case 1). RQA is fixture-gated too (`rqa.json`), and the Viterbi family plus transition
constructors are gated by `sequence_extra.json`.

## Key functions

Verified against the built barrel (`sequence` namespace):

- **`dtw(X, Y, opts)`** → `{ D, wp }`. `D` is the `(N, M)` accumulated cost matrix
  (`D[N-1][M-1]` is the total cost); `wp` is the warping path, end-to-start.
  Pass a precomputed cost matrix via `opts.C` instead of `X`/`Y`.
- **`dtwBacktracking(steps, opts)`** — recover a path from a recorded step matrix
  (`dtw(..., { returnSteps: true })`).
- **`rqa(sim, opts)`** → `{ score, path }`. Alignment over a **similarity** matrix
  (maximised), with optional knight moves and gap penalties.
- **`matchIntervals(...)`** / **`matchEvents(...)`** — Jaccard interval and nearest-event
  matching; constraint violations **throw** (no `-1` sentinels).
- **`viterbi(prob, transition, p_init?, return_logp?)`** — decode from observation
  likelihoods; **`viterbi_discriminative(prob, transition, p_state?, ...)`** decodes from
  posteriors, dividing by the state prior (Bayes).
- **`transition_uniform(n)`**, **`transition_loop(n, p)`**, **`transition_cycle(n, p)`**,
  **`transition_local(n, width, window?, wrap?)`** — row-stochastic transition matrices.

## Example

```js
import { sequence } from 'pleco-xa'

// X: (d, N), Y: (d, M) feature matrices — rows are features, columns are frames
const { D, wp } = sequence.dtw(X, Y, { metric: 'cosine' })
const totalCost = D[D.length - 1][D[0].length - 1]
// wp goes from the end of the alignment down to its start

// Viterbi silence/voicing smoothing over a 2-state posterior:
const trans = sequence.transition_loop(2, 0.9) // 0.9 self-transition
const path = sequence.viterbi_discriminative(prob, trans) // prob: [state][frame]
```

## Notes

- **Custom `stepSizesSigma` are appended to the built-in defaults**, not substituted — the
  defaults get infinite weights so they are never preferred. `weightsAdd`/`weightsMul` must
  match the combined step count.
- **`globalConstraints` uses an absolute-radius Sakoe-Chiba band**
  (`round(bandRad * min(N, M))`), with the offset compensated for non-square cost matrices.
- **RQA maximises alignment, so `sim` must measure similarity, not distance** — feeding a
  distance matrix silently inverts the meaning. Gap penalties are validated as `>= 0` (the
  error text says "strictly positive"; the check accepts 0), and `path` may be empty when no
  positive alignment exists.
- **`transition_cycle(n, p)` puts the self-transition `p` on the diagonal** and `1 - p` one
  step forward (a prior copy had this inverted). `transition_local` runs a
  `get_window → pad_center → roll` pipeline for both `'triangle'` and `'ones'` windows.
- **`viterbi_discriminative` divides the posterior by the marginal prior** (an older pleco
  copy multiplied, inverting the correction for any non-uniform `p_state`).

## API reference

Full signatures: [sequence namespace](/api-by-category/) — e.g.
[`dtw`](/api/pleco-xa/namespaces/sequence/functions/dtw/),
[`rqa`](/api/functions/rqa/),
[`viterbi`](/api/pleco-xa/namespaces/sequence/functions/viterbi/),
[`transition_loop`](/api/pleco-xa/namespaces/sequence/functions/transition_loop/).
