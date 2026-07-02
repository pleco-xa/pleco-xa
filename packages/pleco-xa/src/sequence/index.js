/**
 * Sequence analysis — librosa.sequence parity surface.
 * rqa: fixture-gated (rqa.json). dtw: fixture-gated (dtw_segment.json, bit-exact).
 * matching: fractional-time-safe interval/event matching.
 */
export { rqa } from './rqa.js'
export { dtw, dtwBacktracking } from './dtw.js'
export { matchIntervals, matchEvents } from './matching.js'
