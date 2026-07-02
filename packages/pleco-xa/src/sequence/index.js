/**
 * Sequence analysis — librosa.sequence parity surface.
 * rqa: fixture-gated (rqa.json). dtw: fixture-gated (dtw_segment.json, bit-exact).
 * matching: fractional-time-safe interval/event matching.
 */
export { rqa } from './rqa.js'
export { dtw, dtwBacktracking } from './dtw.js'
export { matchIntervals, matchEvents } from './matching.js'

// Viterbi decoding + transition-matrix constructors, promoted from
// scripts/xa-sequence.js for the tier-2 proof-of-work demos (2026-07-02).
// viterbi_discriminative repaired to librosa semantics (likelihood ∝
// P(state|obs) / p_state — the legacy copy multiplied by the prior).
// viterbi_binary is intentionally NOT promoted: it is not librosa's
// per-label binary decode. Proof: examples/node/viterbi.mjs.
export {
  viterbi,
  viterbi_discriminative,
  transition_uniform,
  transition_loop,
  transition_cycle,
  transition_local,
} from '../scripts/xa-sequence.js'
