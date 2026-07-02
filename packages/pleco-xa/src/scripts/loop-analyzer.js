/**
 * @deprecated Wave 3: this module is a compatibility shim.
 * - musicalLoopAnalysis lives in src/loop/musical.js
 *   (exposed via `loop.detect(buffer, { strategy: 'musical' })`)
 * - loopAnalysis / fastOnsetLoopAnalysis / analyzeLoopPoints / xaLoopAnalysis
 *   live in src/loop/legacy.js
 *
 * Wave 3 fixes carried by the new modules: unified 0..1 confidence,
 * the dBFS-vs-linear RMS bug (negative confidences) is repaired, and the
 * fabricated `{confidence: 50, bpm: 120}` fallbacks are gone.
 */
export { musicalLoopAnalysis } from '../loop/musical.js'
export {
  loopAnalysis,
  fastOnsetLoopAnalysis,
  analyzeLoopPoints,
  xaLoopAnalysis,
} from '../loop/legacy.js'
