/**
 * Pleco-Xa `loop` namespace — the flagship loop-detection surface (Wave 3).
 *
 * Public API:
 *   detect(buffer, { strategy })  — the ONE entry point (see ./detect.js)
 *   STRATEGIES                    — available strategy names
 *
 * Strategy implementations (importable for advanced use):
 *   fastLoopAnalysis, findPreciseLoop, musicalLoopAnalysis, recurrenceLoop
 *
 * Primitives:
 *   DynamicZeroCrossing, LoopController, snapToZeroCrossings,
 *   calculateBeatAlignment
 *
 * Scoring helpers (unified 0..1 confidence convention):
 *   clamp01, normalizedCrossCorrelation, measureLoopConfidence
 */

export { detect, STRATEGIES } from './detect.js'

// Strategies
export { fastLoopAnalysis } from './fast.js'
export { findPreciseLoop } from './precise.js'
export { musicalLoopAnalysis } from './musical.js'
export { recurrenceLoop } from './recurrence.js'

// Legacy wrappers (deprecated — prefer detect())
export {
  loopAnalysis,
  fastOnsetLoopAnalysis,
  analyzeLoopPoints,
  xaLoopAnalysis,
} from './legacy.js'

// Primitives
export {
  DynamicZeroCrossing,
  LoopController,
  snapToZeroCrossings,
  calculateBeatAlignment,
} from './primitives.js'

// Scoring
export { clamp01, normalizedCrossCorrelation, measureLoopConfidence } from './score.js'
