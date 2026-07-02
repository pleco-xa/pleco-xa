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

// Delta features (librosa.feature.delta tier), promoted for the tutorial's
// beat-synchronous mfcc+delta stacking demo (2026-07-02). Interior frames
// match librosa's width-9 Savitzky-Golay slope (polyorder-1 regression is the
// same formula); edges use clamp-replication, NOT librosa's mode='interp'.
// Proof: examples/node/tutorial.mjs.
export { delta_features } from './scripts/xa-mel.js'

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
// Quantum-op vocabulary (core/vector-rhythm.js). Promoted for the tier-2
// proof-of-work vocab-closure badge: every op buildQuantumOpList emits must
// be a member (proof: examples/web/quantum-sequencer.html).
export { RHYTHM_VOCAB } from './core/vector-rhythm.js'

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

// Harmonic analysis (librosa.core.harmonics tier): f0-conditioned harmonic
// energy extraction + HPS pitch helper. Tier-2 repair (2026-07-02): salience
// now follows librosa semantics (weighted-average aggregate, frequency-axis
// peak filter on the original S). Proof: examples/node/xa-harmonic.mjs.
export {
  f0_harmonics, salience, harmonic_product_spectrum,
} from './scripts/xa-harmonic.js'

// Display (librosa.display canvas tier): specshow/waveshow + axis formatters.
// Tier-2 repair (2026-07-02): typed-array-aware flatten — cmap/specshow now
// accept the Array<Float32Array> matrices every xa feature module returns.
// Proof: examples/web/mfcc-specshow.html.
export {
  specshow, waveshow, cmap, NoteFormatter, ChromaFormatter, TimeFormatter,
} from './scripts/xa-display.js'

// Inverse transforms (librosa.feature.inverse tier). mel_to_stft is a
// documented transpose APPROXIMATION (librosa uses NNLS); mel_to_audio /
// mfcc_to_audio reconstruct via Griffin-Lim (istft arg-order repaired
// 2026-07-02); mfcc_to_mel is a proper zero-padded DCT-III inverse.
// Proof: examples/node/xa-inverse.mjs.
export {
  mel_to_stft, mel_to_audio, mfcc_to_mel, mfcc_to_audio,
} from './scripts/xa-inverse.js'

// ─── Tier-2 proof-of-work promotions: core IO/util corner (2026-07-02) ──────

// util: librosa peak picking, PCM→float buffer conversion, audio validation
// (proof: examples/node/xa-util.mjs). frame/sync/fix_frames already above.
// Repair: softmask here now delegates to the librosa-correct xa-normalize
// implementation; show_versions no longer reports fictional parity numbers.
export { peakPick, buf_to_float, valid_audio } from './scripts/xa-util.js'

// Audio IO & synthesis: tone/chirp/clicks generators, zero-crossing analysis,
// mu-law companding, linear resample, LPC, and the module's own Web Audio
// load/play path (proof: examples/web/audio-io.html — numeric halves
// node-verified, playback browser-verified).
export * as audioio from './scripts/xa-audioio.js'

// Tuning systems: equal / pythagorean / p-limit just intonation interval
// construction via Tenney crystal growth (proof: examples/node/intervals.mjs
// — the pure 3:2 fifth and 5/4 just third come out EXACT).
export * as intervals from './scripts/xa-intervals.js'

// Browser file IO: chunked reader (decode-then-chunk, NOT librosa.stream
// semantics — see module JSDoc), live-mic block processor, find_files, cite
// (proof: examples/web/file-io.html; chunk math node-verified via injected
// decoder).
export * as fileio from './scripts/xa-fileio.js'

// Example registry + AudioCache + WAV save/load. Repair: saveAudio now
// delegates to the canonical io/wav encoder and returns the Blob.
// NOTE: the remote librosa.org AUDIO_REGISTRY entries remain unverified —
// the proof page exercises example()/exampleBuffer() against a local fixture
// via the baseUrl parameter (proof: examples/web/file-io.html).
export * as file from './scripts/xa-file.js'

// ─── Tier-2 proof-of-work promotions: rhythm corner (2026-07-02) ────────────

// Fast-tier beat engine + beat-time tempo extraction. beatTrack is the
// heuristic engine behind fastBPMDetect (distinct name from the canonical
// beat_track); at matched hopLength it is ~2x faster than the parity tier on
// a 10s click train while landing in the same lag bin
// (proof: examples/node/beat-tiers.mjs).
export { beatTrack, extractTempo } from './scripts/xa-beat.js'

// Downbeat phase detection (accent scoring over onsetDetect times). Repairs:
// phase rounding now wraps 4→0 instead of discarding, and accent strength is
// measured forward from the (uncentered, frame-start) onset time so sparse
// material no longer scores silence (proof: examples/web/downbeat.html).
export { findDownbeatPhase, findFirstDownbeat } from './scripts/xa-downbeat.js'

// DJ tempo-candidate helpers: autocorrelation tempogram, candidate ranking,
// tempo-multiple detection, groove/swing analysis
// (proof: examples/node/tempo-candidates.mjs — straight groove golden
// {swing:0, variance:0}, swung grid swing=1).
export {
  compute_tempogram, find_tempo_candidates, detect_tempo_multiples,
  analyze_groove,
} from './scripts/xa-tempo.js'

// Pulse strength + beat-synchronous aggregation. NOTE: plp here is a
// windowed-autocorrelation pulse-strength approximation, NOT librosa's
// Fourier-tempogram PLP (proof: examples/node/rhythm-plp.mjs — beat_sync
// goldens [2.5, 6.5] / [4, 8] exact).
export { plp, beat_sync } from './scripts/xa-rhythm.js'
