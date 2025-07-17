/**
 * Pleco-XA: Professional Audio Analysis Toolkit
 * Complete library exports for ALL audio analysis functions
 * 
 * This handles duplicate function names by giving them descriptive aliases
 * based on their source file and purpose.
 * 
 * Usage:
 * import { detectBPM, beatTrackFromBeat, beatTrackFromTempo, fftFromFFT, fftFromOnset } from 'pleco-xa'
 */

// ==================== CORE ANALYSIS MODULES ====================

// BPM Detection and Tempo Analysis
export { detectBPM, detectBPMWindow, BPMDetector, analyzeTempoVariations } from './src/scripts/analysis/BPMDetector.ts'

// ==================== ENHANCED BEAT TRACKING (NEW) ====================

// Enhanced BeatTracker with advanced features (99 BPM bias, genre-aware scoring, etc.)
export { 
  BeatTracker as EnhancedBeatTracker,
  quickBeatTrack as quickBeatTrackEnhanced,
  quickBPMDetect as quickBPMDetectEnhanced,
  BeatTrackingUI as BeatTrackingUIEnhanced
} from './src/scripts/xa-beat-tracker.js'

// Core beat tracking classes (platform-agnostic)
export { 
  BeatTrackerCore,
  quickBPMDetect as quickBPMDetectCore,
  quickBeatTrack as quickBeatTrackCore,
  createConsoleLogger
} from './src/scripts/xa-beat-core.js'

// Web Audio integration
export { 
  WebAudioAdapter,
  createWebAudioAdapter
} from './src/scripts/xa-audio-adapter.js'

// UI components for visualization and audio playback
export { 
  BeatTrackingUI
} from './src/scripts/xa-beat-ui.js'

// Browser-ready wrapper (clean API)
export { 
  BeatTracker as BeatTrackerBrowser 
} from './src/scripts/xa-beat-browser.js'

// ==================== BACKWARD COMPATIBILITY ====================

// Basic Beat Tracking - Multiple implementations, each with unique alias
export { 
  beatTrack as beatTrackBasic, 
  beat_track as beatTrackFromBeat, 
  estimateTempo as estimateTempoBasic, 
  tempo as tempoFromBeat,
  trackBeats as trackBeatsBasic, 
  extractTempo, 
  fastBPMDetect 
} from './src/scripts/xa-beat.js'

export { 
  tempo as tempoFromTempo, 
  compute_tempogram, 
  find_tempo_candidates, 
  beat_track as beatTrackFromTempo, 
  dp_beat_track,
  analyze_groove,
  quick_tempo,
  find_peaks_with_prominence,
  apply_tempo_prior,
  detect_tempo_multiples
} from './src/scripts/xa-tempo.js'

// Enhanced versions as primary exports
export { 
  BeatTracker,           // Enhanced version becomes primary
  quickBeatTrack,        // Enhanced version 
  quickBPMDetect,        // Enhanced version
  BeatTrackingUI as BeatTrackingUIFromTracker,        // Enhanced version from tracker
  beat_track as beatTrackFromTracker,
  tempo as tempoFromTracker
} from './src/scripts/xa-beat-tracker.js'

// ==================== LOOP ANALYSIS ====================

export { LoopAnalyzer, analyzeLoop, findBestLoop, validateLoop, createSeamlessLoop } from './src/scripts/analysis/LoopAnalyzer.ts'
export { manipulateLoop } from './src/scripts/xa-loop-detection.js'
export { findPreciseLoop } from './src/scripts/xa-precise-loop.js'
export { smartLoopDetect } from './src/scripts/loop-smart.js'
export { DJLoopAnalyzer } from './src/scripts/dj-loop-analyzer.js'

// ==================== AUDIO PROCESSING ====================

// FFT and Spectral Analysis - Multiple implementations
export { 
  fft as fftFromFFT, 
  ifft, 
  stft, 
  istft, 
  get_window, 
  hann_window, 
  hamming_window, 
  blackman_window, 
  magnitude,
  phase as phaseFromSpectrum,
  power,
  polar_to_complex,
  fft_frequencies,
  spectrogram
} from './src/scripts/xa-fft.js'

export { 
  fft as fftFromOnset,
  onsetDetect,
  computeSTFT,
  computeSpectralFlux,
  onset_strength,
  onsetStrength,
  pickPeaks,
  onsetsToBeats
} from './src/scripts/xa-onset.js'

// ==================== SPECTRAL FEATURES ====================

export { 
  spectralCentroid,
  spectralBandwidth,
  spectralContrast,
  spectralRolloff,
  spectralFlatness,
  polyFeatures,
  chromaStft,
  chromaCqt,
  chromaCens,
  mfcc as mfccFromSpectral,
  melspectrogram,
  tonnetz,
  ParameterError as SpectralParameterError
} from './src/scripts/xa-spectral.js'

// Mel-frequency Features
export { 
  mel_filterbank,
  hz_to_mel,
  mel_to_hz,
  linspace as linspaceFromMel,
  mfcc,
  dct,
  idct,
  delta_features,
  lifter_mfcc,
  power_to_db,
  mel_frequencies,
  extract_mel_features
} from './src/scripts/xa-mel.js'

// Chroma Analysis
export { 
  chroma_cqt,
  chroma_stft,
  constant_q_transform,
  mapToCQTBins,
  cqt_to_chroma,
  stft_to_chroma,
  freq_to_chroma,
  spectrum_to_chroma,
  enhance_chroma,
  chroma_energy,
  NOTE_NAMES,
  chroma_to_note
} from './src/scripts/xa-chroma.js'

// ==================== ADVANCED PROCESSING ====================

// Advanced Audio Operations - Multiple implementations of overlapping functions
export { 
  normalize_features as normalizeFeaturesFromAdvanced,
  zero_crossing_rate as zeroCrossingRateFromAdvanced,
  rms as rmsFromAdvanced,
  hpss as hpssFromAdvanced,
  pitch_shift as pitchShiftFromAdvanced,
  phase_vocoder as phaseVocoderFromAdvanced,
  monophonic_pitch_detect as monophonicPitchDetectFromAdvanced,
  autocorrelate as autocorrelateFromAdvanced,
  polyfit as polyfitFromAdvanced,
  linspace as linspaceFromAdvanced,
  find_peaks as findPeaksFromAdvanced
} from './src/scripts/xa-advanced.js'

export { 
  hpss as hpssFromProcessing,
  median_filter_horizontal,
  median_filter_vertical,
  median_filter_1d,
  median,
  pitch_shift as pitchShiftFromProcessing,
  phase_vocoder as phaseVocoderFromProcessing,
  monophonic_pitch_detect as monophonicPitchDetectFromProcessing,
  autocorrelate as autocorrelateFromProcessing,
  polyfit as polyfitFromProcessing,
  polyval,
  time_stretch,
  spectral_gate,
  enhance_onsets,
  spectral_whiten
} from './src/scripts/xa-processing.js'

// ==================== AUDIO FEATURES ====================

export { 
  zero_crossing_rate as zeroCrossingRateFromFeatures,
  rms as rmsFromFeatures,
  spectral_centroid as spectralCentroidFromFeatures,
  spectral_bandwidth as spectralBandwidthFromFeatures,
  spectral_rolloff as spectralRolloffFromFeatures,
  spectral_contrast as spectralContrastFromFeatures,
  normalize_features as normalizeFeaturesFromFeatures,
  compute_feature_stats,
  smooth_features,
  detrend_feature,
  extract_comprehensive_features
} from './src/scripts/xa-features.js'

export { 
  computeRMS,
  computeZeroCrossingRate,
  computePeak
} from './src/scripts/xa-audio-features.js'

// ==================== AUDIO I/O ====================

export { 
  play,
  stop,
  toMono,
  resample,
  getDuration,
  getSamplerate,
  zeroCrossings,
  autocorrelate as autocorrelateFromAudioIO,
  lpc,
  tone,
  load,
  chirp,
  clicks,
  muCompress,
  muExpand,
  default as audioIODefaults
} from './src/scripts/xa-audioio.js'

// ==================== TEMPORAL ANALYSIS ====================

export { 
  crossSimilarity,
  recurrenceMatrix,
  recurrenceToLag,
  lagToRecurrence,
  recurrence_to_lag,
  lag_to_recurrence,
  agglomerative,
  pathEnhance
} from './src/scripts/xa-temporal.js'

export { 
  dtw,
  computeCostMatrix,
  isWithinBand,
  findPath,
  fastDTW,
  euclideanDistance,
  manhattanDistance,
  cosineSimilarity,
  dtwDistanceMatrix,
  dtwKMeans
} from './src/scripts/xa-dtw.js'

// ==================== RHYTHM ANALYSIS ====================

export { 
  predominantLocalPulse,
  onsetStrengthMulti,
  viterbiBeats,
  refineBeatsAndDownbeats
} from './src/scripts/xa-rhythm.js'

export { 
  findDownbeatPhase,
  findFirstDownbeat,
  findMusicalLoop
} from './src/scripts/xa-downbeat.js'

// ==================== AUDIO UTILITIES ====================

export { 
  normalize,
  frame,
  validAudio,
  validInt,
  isPositiveInt,
  padCenter,
  fixLength,
  MAX_MEM_BLOCK,
  ParameterError,
  cache,
  localmax,
  localmin,
  peakPick,
  tiny,
  abs2,
  phasor,
  findIndices,
  warnIfNoMp3Support
} from './src/scripts/xa-util.js'

export { 
  createLoopBuffer,
  exportBufferAsWav,
  computeRMS as computeRMSFromUtils,
  defineMultipleLoopPoints,
  computePeak as computePeakFromUtils,
  computeZeroCrossingRate as computeZCRFromUtils,
  reverseBufferSection,
  findZeroCrossing,
  findAllZeroCrossings,
  findAudioStart,
  applyHannWindow
} from './src/scripts/audio-utils.js'

// ==================== FILTERS ====================

export { 
  preemphasis,
  deemphasis,
  highpass,
  lowpass
} from './src/scripts/xa-filters.js'

// ==================== MATCHING ====================

export { 
  Matcher,
  quickMatchIntervals,
  quickMatchEvents,
  matchBeatsToOnsets
} from './src/scripts/xa-matching.js'

// ==================== INTERVALS ====================

export { 
  IntervalConstructor,
  generateFrequencies,
  compareTuningSystems
} from './src/scripts/xa-intervals.js'

// ==================== RECURRENCE ANALYSIS ====================

export { 
  computeChroma,
  stackMemory,
  recurrenceMatrix as recurrenceMatrixFromRecurrence,
  recurrenceToLag as recurrenceToLagFromRecurrence,
  framesToTime,
  findLoopCandidates
} from './src/scripts/xa-recurrence.js'

// ==================== REMIX FUNCTIONS ====================

export { 
  find_zero_crossing,
  remix,
  crossfade
} from './src/scripts/xa-remix.js'

// ==================== AUDIO SPLITTING ====================

export { 
  split,
  getNonSilentSegments
} from './src/scripts/xa-split.js'

export { 
  trim,
  autoTrimBuffer
} from './src/scripts/xa-trim.js'

// ==================== ALGORITHMIC SEQUENCES ====================

export { 
  stutterLoop,
  fractalSlice,
  phaseShift,
  generateFibonacci,
  generatePrimeRhythm,
  generateWaveform,
  generateChaotic,
  executeOperation
} from './src/scripts/algorithmic-sequences.js'

// ==================== AUDIO OPERATIONS ====================

export { 
  stutter,
  phase as phaseShiftAudio,
  fractal,
  applyQuantumOp
} from './src/scripts/audio-ops-extended.js'

export { 
  reverseBufferSectionEnhanced,
  isLargeOperation,
  checkBufferSafety
} from './src/scripts/enhanced-audio-ops.js'

// ==================== QUANTUM SEQUENCER ====================

export { 
  buildQuantumOpList,
  buildQuantumSequence
} from './src/scripts/quantum-sequencer.js'

// ==================== BEAT PRESETS ====================

export { 
  hipHop,
  regaeton,
  dubstep,
  breakbeat,
  techno,
  jungle,
  allPresets,
  randomPreset
} from './src/scripts/beat-presets.js'

// ==================== KICK/SNARE DETECTION ====================

export { 
  findKickSnareHit
} from './src/scripts/kick-snare-detector.js'

// ==================== FILE OPERATIONS ====================

export { 
  listExamples,
  exampleInfo,
  saveAudio,
  cache as cacheFromFile,
  createVisualization,
  isWebAudioSupported,
  createAudioContext
} from './src/scripts/xa-file.js'

// ==================== CORE CLASSES ====================

export { AudioPlayer } from './src/scripts/analysis/AudioPlayer.ts'
export { WaveformData } from './src/scripts/analysis/WaveformData.ts'
export { LoopController } from './src/scripts/loop-controller.js'
export { LoopPlayer } from './src/scripts/LoopPlayer.js'
export { WaveformEditor } from './src/scripts/WaveformEditor.js'
export { RealtimeSpectrumAnalyzer, SpectrumAnalyzer } from './src/scripts/SpectrumAnalyzer.js'
export { LivePeakExtractor } from './src/scripts/live-peak-extractor.js'
export { DynamicZeroCrossing } from './src/scripts/dynamic-zero-crossing.js'
export { DopplerScroll } from './src/scripts/DopplerScroll.js'

// ==================== RENDERING ====================

export { 
  renderWaveform,
  renderStereoWaveform,
  addLoopRegions,
  createInteractiveRenderer,
  WaveformRenderer
} from './src/scripts/WaveformRenderer.js'

export { 
  initAudioProcessor,
  drawWaveform
} from './src/scripts/xa-audio-core.js'

// ==================== UTILITIES ====================

export { 
  calculateBeatAlignment
} from './src/scripts/musical-timing.js'

export { 
  debugLog, 
  setDebug, 
  isDebugEnabled 
} from './src/scripts/debug.js'

export { 
  enqueueToast
} from './src/scripts/ui/toastQueue.js'

export { 
  applyLoop
} from './src/scripts/ui/applyLoop.js'

export { 
  initKeyboardController
} from './src/scripts/keyboard-controller.js'

// ==================== MAIN CLASS ====================

export { PlecoXA } from './src/scripts/pleco-xa.js'

// ==================== ENHANCED LB FUNCTIONS ====================

// Web Worker beat tracking (performance-optimized)
export {
  BeatTracker as BeatTrackerWorker,
  quickBeatTrack as quickBeatTrackWorker,
  BeatTrackingUI as BeatTrackingUIWorker,
  beat_track as beatTrackWorker,
  tempo as tempoWorker
} from './src/scripts/beat-worker.js'

// ==================== CORE SYSTEM ====================

export { startBeatGlitch, GibClock } from './src/core/index.js'

// ==================== DEFAULT EXPORT ====================

export { PlecoXA as default } from './src/scripts/pleco-xa.js'
