/**
 * Sequence analysis — librosa.sequence parity surface.
 * rqa: fixture-gated (rqa.json). dtw: fixture-gated (dtw_segment.json, bit-exact).
 * matching: fractional-time-safe interval/event matching.
 */
export { rqa } from './rqa.js'
export { dtw, dtwBacktracking } from './dtw.js'
export { matchIntervals, matchEvents } from './matching.js'

// Viterbi decoding — librosa.sequence parity (viterbi.py). Discriminative
// decode applies Bayes' rule the way librosa does: likelihood ∝
// P(state|obs) / p_state (DIVIDE by the prior; a legacy copy multiplied it).
// viterbi_binary is intentionally NOT promoted: it is not librosa's per-label
// binary decode. Proof: examples/node/viterbi.mjs.
export { viterbi, viterbi_discriminative } from './viterbi.js'

// Transition-matrix constructors — librosa.sequence parity (sequence.py).
// Fixture-gated: sequence_extra.json (exact within 1e-6). transition_cycle
// puts the SELF-transition prob on the diagonal (a legacy copy inverted it);
// transition_local reproduces librosa's get_window→pad_center→roll pipeline.
export {
  transition_uniform,
  transition_loop,
  transition_cycle,
  transition_local,
} from './transition.js'
