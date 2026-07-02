/**
 * Pleco-Xa — browser-native audio analysis engine.
 * Wave-0 curated surface: every export here is import-safe in Node and browser.
 * The surface grows namespace-by-namespace as each wave lands (see docs/superpowers/specs/).
 */

// Debug gate
export { setDebug, debugLog, isDebugEnabled } from './scripts/debug.js'

// Audio utilities
export {
  createLoopBuffer, exportBufferAsWav, computeRMS, computePeak,
  computeZeroCrossingRate, defineMultipleLoopPoints, reverseBufferSection,
  findZeroCrossing, findAllZeroCrossings, findAudioStart, applyHannWindow,
} from './scripts/audio-utils.js'

// Spectral core (numerical-parity repairs land in Wave 1)
export {
  fft, ifft, stft, istft, get_window, hann_window, hamming_window,
  blackman_window, magnitude, phase, power, polar_to_complex,
  fft_frequencies, spectrogram,
} from './scripts/xa-fft.js'

// Rhythm — canonical librosa-parity engine (fixture-gated: tempo_beats.json).
// tempo()/beat_track() are the parity tier; quickTempo() is the explicit
// quick tier (windowed lb-style live estimate, never a silent fallback).
export { BeatTracker, beat_track, tempo, quickTempo } from './scripts/xa-beat-tracker.js'
export * as bpm from './scripts/xa-bpm-algorithm.js'

// Onset detection (librosa-parity onset_strength; fixture-gated: onset_strength.json)
export { onset_strength, onsetDetect } from './scripts/xa-onset.js'

// Streaming analyzers (worker-safe, incremental push API)
export { createRmsMeter, createFluxAnalyzer } from './streaming/analyzers.js'

// IO (universal: Node + browser + workers)
export { encodeWav, decodeWav } from './io/wav.js'

// Conversions (fixture-validated vs librosa 0.11.0)
export * as convert from './scripts/xa-convert.js'

// Loop detection (flagship — Wave 3 consolidated namespace).
// loop.detect(buffer, { strategy }) is THE public API; the top-level
// fastLoopAnalysis export is kept (delegating) for demo compatibility.
export * as loop from './loop/index.js'
export { fastLoopAnalysis } from './loop/fast.js'

// Sequence analysis — librosa.sequence.rqa port (fixture-gated: rqa.json)
export { rqa } from './sequence/rqa.js'
