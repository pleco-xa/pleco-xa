/**
 * @deprecated Wave 3: this module is a compatibility shim.
 * Precise loop detection now lives in src/loop/precise.js and is exposed via
 * `loop.detect(buffer, { strategy: 'precise' })` (src/loop/index.js).
 */
export { findPreciseLoop } from '../loop/precise.js'
