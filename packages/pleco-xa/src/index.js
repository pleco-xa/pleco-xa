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

// Transient snap: kick+snare hit finder for beat-driven material (returns
// null honestly when no strong transient is found).
export { findKickSnareHit } from './scripts/kick-snare-detector.js'

// Musical timing: loop-length vs BPM alignment scoring (pure function).
export { calculateBeatAlignment } from './scripts/musical-timing.js'

// Pitch: YIN fundamental-frequency estimator (verified on known tones).
// pyin is intentionally NOT exported until it is a real pYIN (HMM/Viterbi).
export { yin } from './scripts/xa-pitch.js'

// Streaming analyzers (worker-safe, incremental push API)
export { createRmsMeter, createFluxAnalyzer } from './streaming/analyzers.js'

// IO (universal: Node + browser + workers)
export { encodeWav, decodeWav } from './io/wav.js'

// Conversions (fixture-validated vs librosa 0.11.0)
export * as convert from './scripts/xa-convert.js'

// Spectral features — Wave 4 consolidated namespace (fixture-gated:
// spectral_features.json, mfcc.json, chroma.json). ONE implementation per
// feature; the legacy xa-spectral/xa-features/xa-audio-features/xa-chroma
// modules are shims that delegate here.
export * as feature from './feature/index.js'

// Filter banks (filters.chroma port + re-exported parity-gated
// get_window / mel_filterbank)
export * as filters from './filters/index.js'

// Music notation & scale theory — librosa.core.notation port. Tier-1
// proof-of-work repairs (2026-07-02): slot-aware mela_to_svara, circle-of-
// fifths key_to_notes (unknown keys throw), kafi thaat, exact fifths_to_note.
// Proof: examples/node/notation.mjs.
export * as notation from './scripts/xa-notation.js'

// Time compression — record-speed (pitch-changing resample) vs phase-vocoder
// (pitch-preserving) tiers, measured against each other in
// examples/node/compression.mjs + examples/web/compression.html.
export { pitchBasedCompress, tempoBasedCompress } from './scripts/compression.js'

// Framing utilities promoted for ML patch pipelines (librosa.util.frame /
// sync / fix_frames). NOTE divergence: frame() COPIES each frame — librosa's
// zero-copy stride view does not transfer to JS. Proof: examples/node/patch-generation.mjs.
export { frame, sync, fix_frames } from './scripts/xa-util.js'

// Loop detection (flagship — Wave 3 consolidated namespace).
// loop.detect(buffer, { strategy }) is THE public API; the top-level
// fastLoopAnalysis export is kept (delegating) for demo compatibility.
export * as loop from './loop/index.js'
export { fastLoopAnalysis } from './loop/fast.js'

// Sequence analysis — Wave 3+5 (fixture-gated: rqa.json, dtw_segment.json —
// dtw cumulative cost bit-exact, paths exact)
export * as sequence from './sequence/index.js'
export { rqa } from './sequence/rqa.js'

// Structural segmentation — Wave 5 (fixture-gated: dtw_segment.json —
// recurrence/lag/agglomerative exact)
export * as segment from './segment/index.js'

// Effects — Wave 5 (fixture-gated: effects.json, phase_vocoder.json).
// Real phase vocoder; time_stretch/pitch_shift honor their contracts or throw.
export * as effects from './effects/index.js'

// Decompose — Wave 5 (fixture-gated: hpss.json; H+P≈S at margin=1).
// Includes the pleco-unique vocal-separation flagship via its module.
export * as decompose from './decompose/index.js'

// ─── Wave 6: playback / display / play layer ────────────────────────────────

// Playback ops: loop-speed / gap / reverse buffer operations hoisted from the
// demo's AudioAnalyzer. Pure functions on AudioBuffer-shaped objects with an
// injectable createBuffer factory (no DOM, no AudioContext).
export * as playback from './playback/ops.js'

// Playback engines: loop-aware players and the demo audio processor.
// AudioPlayer/LoopPlayer construct an AudioContext lazily (browser-only at
// call time, import-safe everywhere).
export { LoopPlayer } from './scripts/LoopPlayer.js'
export { AudioPlayer } from './scripts/analysis/AudioPlayer.ts'
export {
  initAudioProcessor, loadAudioFile, drawWaveform,
} from './scripts/xa-audio-core.js'

// Live speed control (playbackRate crossfade / resample tiers). Dependencies
// (audioContext, buffer, audioProcessor) are injected explicitly — no global
// bus reads.
export {
  applyLiveHalfSpeed, applyLiveDoubleSpeed, resetLiveSpeed, liveSpeedController,
} from './scripts/live-speed-control.js'

// Display: canvas-native spectrogram rendering (librosa.display replacement
// tier — see PARITY.md exceptions ledger).
export {
  createSpectrogram, renderStaticSpectrum, RealtimeSpectrumAnalyzer,
} from './scripts/SpectrumAnalyzer.js'

// Waveform visualization: env-blind data extraction (duck-typed
// { getChannelData, length, sampleRate, duration } buffers — no Web Audio
// required) plus the canvas renderers that consume it.
export {
  getWaveformPeaks, getStereoWaveformPeaks, getTimebasedWaveform,
  getWaveformRange, analyzeWaveform,
} from './scripts/analysis/WaveformData.ts'
export {
  renderWaveform, renderStereoWaveform, addLoopRegions,
  createInteractiveRenderer,
} from './scripts/WaveformRenderer.js'

// Browser WAV Blob helper (wraps the WAV encode tier for <audio> playback).
export { createAudioBlob } from './scripts/xa-wav-encoder.js'

// Play layer — loop choreography + glitch toys (spec §6 play/).
// NOTE: core's detectLoop is the deprecated full-buffer stub kept for
// play-layer compatibility; real detection is loop.detect().
export {
  signatureDemo, detectLoop, fullBufferLoop, halfLoop, doubleLoop,
  moveForward, resetLoop, randomSequence, randomLocal, glitchBurst,
  startBeatGlitch, GibClock,
} from './core/index.js'
export {
  generateChaotic, generateFibonacci, generatePrimeRhythm, generateWaveform,
  executeOperation,
} from './scripts/algorithmic-sequences.js'
export {
  buildQuantumOpList, buildQuantumSequence, playQuantumOps,
} from './scripts/quantum-sequencer.js'
export { allPresets, randomPreset } from './scripts/beat-presets.js'
export { applyQuantumOp } from './lib/effects/xa-fx.js'

// Enhanced buffer ops: safety-checked, progress-reporting reverse for large
// buffers (used by the demo's Enhanced Reverse control).
export {
  applyOperationEnhanced, checkBufferSafety, isLargeOperation,
} from './scripts/enhanced-audio-ops.js'

// Quick-tier BPM helpers consumed by the demo. Explicitly quick (see the
// rhythm section above): the parity tier remains tempo()/beat_track();
// detectBPM/fastBPMDetect are fast estimators that report failure honestly.
export { detectBPM } from './scripts/xa-bpm-detection.js'
export { fastBPMDetect } from './scripts/xa-beat.js'

// Browser file loading (decodeAudioData path from the xa-file registry) and
// downbeat-aware musical loop search (loop/ taxonomy; already powers the
// 'fast' strategy internally). MP3-support advisory from util.
export { loadFile } from './scripts/xa-file.js'
export { findMusicalLoop } from './scripts/xa-downbeat.js'
export { warnIfNoMp3Support } from './scripts/xa-util.js'
