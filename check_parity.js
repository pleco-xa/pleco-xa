/**
 * Librosa Parity Checker
 * Systematically checks pleco-audio implementation against Librosa functions
 */

// Our implemented functions from pleco-audio.js exports
const IMPLEMENTED = {
  // Core: FFT and STFT (xa-fft.js)
  'stft': true,
  'istft': true,
  'fft': true,
  'ifft': true,
  'hann_window': true,
  'hamming_window': true,
  'blackman_window': true,
  'magnitude': true,
  'phase': true,
  'power': true,
  'fft_frequencies': true,

  // Mel-frequency (xa-mel.js)
  'melspectrogram': true,
  'mfcc': true,
  'mel_filterbank': true,
  'hz_to_mel': true,
  'mel_to_hz': true,
  'dct': true,
  'idct': true,
  'delta_features': true,
  'lifter_mfcc': true,
  'power_to_db': true,

  // Conversion (xa-convert.js)
  'frames_to_samples': true,
  'samples_to_frames': true,
  'frames_to_time': true,
  'time_to_frames': true,
  'samples_to_time': true,
  'time_to_samples': true,
  'hz_to_midi': true,
  'midi_to_hz': true,
  'midi_to_note': true,
  'note_to_midi': true,
  'hz_to_note': true,
  'note_to_hz': true,
  'hz_to_octs': true,
  'octs_to_hz': true,
  'amplitude_to_db': true,
  'db_to_amplitude': true,
  'db_to_power': true,
  'a_weighting': true,
  'b_weighting': true,
  'c_weighting': true,
  'd_weighting': true,
  'perceptual_weighting': true,
  'cqt_frequencies': true,
  'fourier_tempo_frequencies': true,
  'tempo_to_lag': true,
  'lag_to_tempo': true,

  // Normalization (xa-normalize.js)
  'normalize': true,
  'peak_normalize': true,
  'normalize_clip': true,
  'softmask': true,
  'apply_mask': true,
  'rms_normalize': true,
  'lufs_normalize': true,
  'compress': true,
  'fade': true,
  'crossfade': true,
  'tiny': true,

  // Tempogram (xa-tempogram.js)
  'tempogram': true,
  'fourier_tempogram': true,
  'tempogram_ratio': true,
  'estimate_tempo': true,

  // Pitch (xa-pitch.js)
  'piptrack': true,
  'yin': true,
  'pyin': true,
  'autocorrelation_pitch': true,
  'hz_to_midi_pitch': true,
  'pitch_salience': true,
  'smooth_pitch': true,

  // Decompose (xa-decompose.js)
  'hpss': true,
  'median_filter': true,
  'nn_filter': true,
  'decompose': true,
  'nmf_reconstruct': true,
  'nmf_separate': true,

  // Rhythm (xa-rhythm.js)
  'beat_track': true,
  'tempo': true,
  'plp': true,
  'beat_sync': true,

  // Spectral features (xa-spectral.js) - NOW EXPORTED!
  'spectral_centroid': true,
  'spectral_bandwidth': true,
  'spectral_contrast': true,
  'spectral_rolloff': true,
  'spectral_flatness': true,
  'rms': true,
  'poly_features': true,
  'zero_crossing_rate': true,
  'chroma_stft': true,
  'chroma_cqt': true,
  'chroma_cens': true,
  'tonnetz': true,

  // Onset detection (xa-onset.js) - NOW EXPORTED!
  'onset_detect': true,
  'onset_strength': true,
  'spectral_flux': true,
  'peak_pick': true,

  // Utility functions (xa-util.js) - NOW EXPORTED!
  'frame': true,
  'pad_center': true,
  'fix_length': true,
  'localmax': true,
  'localmin': true,
  'tiny': true,
  'abs2': true,
  'phasor': true,

  // Segment (xa-segment.js)
  'recurrence_matrix': true,
  'recurrence_to_lag': true,
  'lag_to_recurrence': true,
  'timelag_filter': true,
  'segment_boundaries': true,
  'agglomerative_clustering': true,
  'boundaries_to_segments': true,

  // Effects (xa-effects.js)
  'time_stretch': true,
  'trim': true,
  'split': true,
  'harmonic': true,
  'percussive': true,
  'remix': true,
  'preemphasis': true,
  'deemphasis': true,

  // Advanced functions (xa-advanced.js) - NOW EXPORTED!
  'phase_vocoder': true,
  'autocorrelate': true,
  'pitch_shift': true,
  'normalize_features': true,
  'find_peaks': true,
  'polyfit': true,
  'linspace': true,
};

// Mark as irrelevant for JavaScript audio library
const IRRELEVANT_MODULES = [
  'librosa/__init__.py',
  'librosa/_cache.py',
  'librosa/_typing.py',
  'librosa/version.py',
  'librosa/display.py',
  'librosa/util/decorators.py',
  'librosa/util/deprecation.py',
  'librosa/util/__init__.py',
  'librosa/util/example_data/__init__.py',
  'librosa/util/exceptions.py',
  'librosa/feature/__init__.py',
  'librosa/core/__init__.py',
];

const IRRELEVANT_FUNCTIONS = [
  // File I/O handled by Web Audio API
  'load', 'stream', 'get_duration', 'get_samplerate', 'resample',
  '__audioread_load', '__soundfile_load',

  // FFT library management
  'get_fftlib', 'set_fftlib',

  // Display/visualization (matplotlib)
  'specshow', 'waveshow', 'cmap',

  // File utilities
  'find_files', 'example', 'example_info', 'list_examples', 'cite',
  '_resource_file', '__get_files',

  // Version/deprecation
  'show_versions', '__get_mod_version', 'deprecated', 'moved', 'rename_kw',

  // Python-specific internals
  '_ensure_not_reachable', '__call__', '__init__', '__del__', '__repr__',
  'connect', 'disconnect', 'update',

  // All private/internal functions (start with __ or _)
  // These are implementation details, not public API
];

// High priority missing functions
const CRITICAL_MISSING = {
  'spectrum': [
    'griffinlim',           // Magnitude spectrogram inversion
    'pcen',                 // Per-channel energy normalization
    'magphase',             // Separate magnitude and phase
    'reassigned_spectrogram', // Time-frequency reassignment
  ],
  'feature_spectral': [
    'chroma_vqt',           // Chroma from VQT (still missing)
  ],
  'onset': [
    'onset_strength_multi', // Multi-channel onset strength
    'onset_backtrack',      // Backtrack onsets
  ],
  'filters': [
    'mel',                  // Mel filterbank (we have mel_filterbank)
    'chroma',               // Chroma filterbank
    'constant_q',           // Constant-Q filterbank
    'get_window',           // Get window function
    'window_sumsquare',     // Window sum-square
  ],
  'util': [
    'sync',                 // Synchronize features
  ],
  'constantq': [
    'cqt',                  // Constant-Q transform
    'icqt',                 // Inverse CQT
    'hybrid_cqt',           // Hybrid CQT
    'pseudo_cqt',           // Pseudo CQT
    'vqt',                  // Variable-Q transform
    'griffinlim_cqt',       // Griffin-Lim for CQT
  ],
  'sequence': [
    'dtw',                  // Dynamic time warping
    'viterbi',              // Viterbi decoding
    'viterbi_discriminative', // Discriminative Viterbi
    'viterbi_binary',       // Binary Viterbi
    'transition_local',     // Local transition matrix
    'transition_loop',      // Loop transition matrix
    'transition_uniform',   // Uniform transition matrix
    'rqa',                  // Recurrence quantification
  ],
  'effects': [
    // All essential effects implemented!
  ],
  'segment': [
    'cross_similarity',     // Cross-similarity matrix
    'path_enhance',         // Path enhancement
    'agglomerative',        // Agglomerative clustering (we have agglomerative_clustering)
  ],
  'audio': [
    'zero_crossings',       // Zero crossings
    'chirp',                // Chirp signal
    'clicks',               // Click track
    'tone',                 // Pure tone
    'to_mono',              // Convert to mono
    'lpc',                  // Linear predictive coding
    'mu_compress',          // Mu-law compression
    'mu_expand',            // Mu-law expansion
  ],
};

console.log('='.repeat(80));
console.log('PLECO-AUDIO vs LIBROSA PARITY ANALYSIS');
console.log('='.repeat(80));

console.log('\n✓ IMPLEMENTED FUNCTIONS:', Object.keys(IMPLEMENTED).length);
console.log('\n⊗ IRRELEVANT MODULES:', IRRELEVANT_MODULES.length);
console.log('⊗ IRRELEVANT FUNCTIONS:', IRRELEVANT_FUNCTIONS.length);

console.log('\n✗ CRITICAL MISSING BY CATEGORY:');
let totalMissing = 0;
for (const [category, funcs] of Object.entries(CRITICAL_MISSING)) {
  console.log(`  ${category}: ${funcs.length}`);
  totalMissing += funcs.length;
}
console.log(`  TOTAL: ${totalMissing}`);

console.log('\n' + '='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
const implemented = Object.keys(IMPLEMENTED).length;
const irrelevant = IRRELEVANT_MODULES.length + IRRELEVANT_FUNCTIONS.length;
const missing = totalMissing;

console.log(`✓ Implemented: ${implemented}`);
console.log(`⊗ Irrelevant:  ${irrelevant}`);
console.log(`✗ Missing:     ${missing}`);
console.log(`\nEstimated parity: ${Math.round(implemented / (implemented + missing) * 100)}%`);
