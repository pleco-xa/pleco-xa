/**
 * @deprecated Wave 3: this module is a compatibility shim.
 * The fast loop pipeline now lives in src/loop/fast.js and is exposed via
 * `loop.detect(buffer, { strategy: 'fast' })` (src/loop/index.js).
 *
 * The legacy file's ~420 lines of commented-out dead code and the broken
 * analyzeLoopCandidate → analyzeMusicalStructure ReferenceError trap were
 * removed during the consolidation.
 */
export { fastLoopAnalysis } from '../loop/fast.js'
