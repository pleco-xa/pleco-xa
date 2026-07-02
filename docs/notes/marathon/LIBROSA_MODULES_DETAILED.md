# Librosa Detailed Module Guide for pleco-xa

## 1. CORE.SPECTRUM - Spectral Operations (Most Critical)

### STFT & Phase Recovery
- `stft()` - 2D STFT matrix with phase information
- `istft()` - Inverse STFT with overlap-add reconstruction
- `magphase()` - Decompose spectrogram into magnitude and phase
- `phase_vocoder()` - Time-stretch preserving phase relationships
- `griffinlim()` - Iterative phase recovery algorithm

### Magnitude Scaling
- `power_to_db()` - 10 * log10(S / ref)
- `db_to_power()` - Inverse decibel conversion
- `amplitude_to_db()` - 20 * log10(|S| / ref)
- `db_to_amplitude()` - Inverse amplitude scaling
- `perceptual_weighting()` - Apply weighting function to spectrum

### Advanced Representations
- `reassigned_spectrogram()` - Sharper spectrograms via reassignment
- `iirt()` - Inverse infinite impulse response (rarely used)
- `fmt()` - Functional time representation
- `pcen()` - Per-channel energy normalization (recent, important)

---

## 2. CORE.CONSTANTQ - Constant-Q & Variable-Q

### CQT Transforms
- `cqt()` - Logarithmically-spaced frequency representation
  - Key: Constant Q factor (bins per octave)
  - Better for music than STFT
  - Uses filter banks
  
- `hybrid_cqt()` - Combines STFT (low) + CQT (high frequencies)
- `pseudo_cqt()` - CQT from STFT (faster, less accurate)
- `vqt()` - Variable-Q: adaptive frequency resolution
- `icqt()` - Inverse CQT reconstruction
- `griffinlim_cqt()` - Phase recovery for CQT

**Why Important:** CQT more musically meaningful than STFT

---

## 3. CORE.AUDIO - Audio I/O & Time-Domain DSP

### File I/O
- `load()` - Load from file (MP3, WAV, FLAC, etc.)
- `stream()` - Stream without loading entire file
- `get_duration()`, `get_samplerate()` - Metadata

### Time-Domain Processing
- `autocorrelate()` - Compute autocorrelation (for tempo, pitch)
- `lpc()` - Linear Predictive Coding
- `zero_crossings()` - Count zero crossings (speech analysis)

### Signal Generation
- `clicks()` - Generate click track
- `tone()` - Generate sinusoidal tone
- `chirp()` - Generate frequency sweep

### Audio Compression
- `mu_compress()` - μ-law compression
- `mu_expand()` - μ-law expansion

---

## 4. CORE.PITCH - Pitch Tracking (Complex!)

### YIN Algorithm Family
- `yin()` - Basic YIN pitch tracking
- `pyin()` - Probabilistic YIN (more accurate)
- `estimate_tuning()` - Global tuning deviation

### Other Pitch Trackers
- `piptrack()` - Pipe tracker (requires many parameters)
- `pitch_tuning()` - Estimate tuning from frequencies

**Complexity:** High - requires detailed understanding of autocorrelation, YIN algorithm

---

## 5. FEATURE.SPECTRAL - Feature Extraction (Priority List)

### Tier 1 - Most Important
```
melspectrogram()        # Perceptual frequency scale
mfcc()                  # Cepstral coefficients
chroma_stft()           # Pitch-class features
spectral_centroid()     # Spectral brightness
rms()                   # Energy
```

### Tier 2 - Important
```
chroma_cqt()            # Chroma from CQT
spectral_bandwidth()    # Spread around centroid
spectral_contrast()     # Energy peaks vs valleys
zero_crossing_rate()    # Noisiness indicator
```

### Tier 3 - Advanced
```
chroma_cens()           # Normalized chroma
chroma_vqt()            # Variable-Q chroma
spectral_flatness()     # Tonality measure
spectral_rolloff()      # Energy cutoff point
poly_features()         # Polynomial features
tonnetz()               # Tonal centroid representation
```

---

## 6. FEATURE.RHYTHM - Rhythm Analysis

### Tempo Estimation
- `tempo()` - Estimate global tempo from onset strength
  - Uses autocorrelation of onset_envelope
  - Returns BPM value

### Tempogram
- `tempogram()` - Local autocorrelation (like spectrogram for tempo)
- `fourier_tempogram()` - FFT-based tempogram
- `tempogram_ratio()` - Ratio-based tempogram

**Key Insight:** Tempogram is 2D (time × tempo), similar to spectrogram

---

## 7. BEAT - Beat Tracking

### Functions
- `beat_track()` - Dynamic programming beat tracker
  - Combines onset detection + tempo estimation + peak picking
  - Returns: (tempo_bpm, beat_frames)
  - Very sophisticated algorithm
  
- `plp()` - Probabilistic Latent Periodicity
  - Alternative to beat_track()
  - Uses Markov chain

---

## 8. ONSET - Onset Detection

### Functions
- `onset_detect()` - Find note onset times
  - Uses peak picking on onset envelope
  - Returns frame indices of onsets
  
- `onset_strength()` - Compute onset detection envelope
  - Pre-processes input for onset_detect
  - Can use different spectral flux methods
  
- `onset_strength_multi()` - Multi-band onset strength
  
- `onset_backtrack()` - Adjust onsets to energy minima

---

## 9. DECOMPOSE - Source Separation

### Functions
- `decompose()` - Non-negative matrix factorization wrapper
  - Flexible transformer parameter
  - Can use NMF, PLCA, etc.
  
- `hpss()` - Harmonic-Percussive source separation
  - Median filtering on spectrograms
  - Decomposes into H + P
  
- `nn_filter()` - Nearest-neighbor filtering

---

## 10. EFFECTS - Audio Processing

### Time-Frequency Manipulation
- `time_stretch()` - Change tempo without pitch
- `pitch_shift()` - Change pitch without tempo
- `phase_vocoder()` - Underlying algorithm for above

### Audio Editing
- `trim()` - Remove silence from start/end
- `split()` - Split audio at silences
- `remix()` - Combine/separate channels

### Filtering
- `preemphasis()` - High-pass filter (boost high frequencies)
- `deemphasis()` - Inverse of preemphasis
- `hpss()` - Harmonic-percussive separation

---

## 11. FILTERS - Filter Bank Construction

### Frequency-Domain Filters
- `mel()` - Mel-scale triangular filters (40-128 bands)
  - Most common for speech/music
  - Approximately 12% bandwidth
  
- `chroma()` - Pitch-class filters (12 or 24 bands)
  
- `wavelet()` - Continuous wavelet filter bank
  
- `semitone_filterbank()` - 12 semitones per octave

### Window Functions
- `get_window()` - Retrieve scipy window function
- `window_bandwidth()` - Compute window main lobe bandwidth
- `window_sumsquare()` - Verify perfect reconstruction

### Utilities
- `cq_to_chroma()` - Project CQT to chroma
- `mr_frequencies()` - Multirate filter frequencies
- `diagonal_filter()` - For segmentation algorithms

---

## 12. SEGMENT - Temporal Segmentation

### Similarity-Based
- `cross_similarity()` - Feature distance between sequences
- `recurrence_matrix()` - Self-similarity matrix
- `recurrence_to_lag()` / `lag_to_recurrence()` - Format conversions
- `path_enhance()` - Enhance diagonal paths

### Clustering
- `agglomerative()` - Hierarchical clustering
- `subsegment()` - Temporal subsegmentation

---

## 13. SEQUENCE - Sequential Modeling

### DTW (Dynamic Time Warping)
- `dtw()` - Compute DTW distance matrix
- `dtw_backtracking()` - Get alignment path

### RQA (Recurrence Quantification Analysis)
- `rqa()` - Diagonal line statistics

### Viterbi
- `viterbi()` - Standard Viterbi decoding
- `viterbi_discriminative()` - Discriminative variant
- `viterbi_binary()` - Binary classification version

### Transition Matrices
- `transition_uniform()` - Equally likely transitions
- `transition_loop()` - Favor staying in current state
- `transition_cycle()` - Cycle through states
- `transition_local()` - Only adjacent state transitions

---

## 14. CORE.CONVERT - Unit Conversions (60+ Functions!)

### Time Conversions
- `frames_to_*()` / `*_to_frames()`
- `samples_to_*()` / `*_to_samples()`
- All combinations of: frames, samples, time

### Pitch Conversions
- `hz_to_midi()` / `midi_to_hz()`
- `hz_to_note()` / `note_to_hz()`
- `midi_to_note()` / `note_to_midi()`

### Frequency Scales
- `hz_to_mel()` / `mel_to_hz()` - Perceptual scale
- `hz_to_octs()` / `octs_to_hz()` - Octave scale

### Tuning Systems
- `hz_to_svara_*()` - Indian classical system
- `hz_to_fjs()` - Just intonation (Functional Just System)
- `A4_to_tuning()` / `tuning_to_A4()` - Tuning deviation

### Frequency Array Generation
- `fft_frequencies()` - Linear frequency grid
- `cqt_frequencies()` - CQT frequency bins
- `mel_frequencies()` - Mel-scale frequencies
- `tempo_frequencies()` - Tempo in BPM
- `fourier_tempo_frequencies()` - FFT-based tempo

---

## 15. CORE.HARMONIC - Harmonic Analysis

### Functions
- `salience()` - Harmonic salience computation
- `interp_harmonics()` - Interpolate harmonic partials
- `f0_harmonics()` - Generate harmonic series from F0

---

## 16. CORE.NOTATION - Music Theory

### Western Keys
- `key_to_notes()` - Get note list from key
- `key_to_degrees()` - Get scale degrees

### Indian Scales
- `mela_to_svara()` - Mela to Svara mapping
- `mela_to_degrees()` - Mela scale degrees
- `list_mela()` - List all 72 Melakartas
- `thaat_to_degrees()` - Hindustani thaat
- `list_thaat()` - List all thaats

### Interval Systems
- `fifths_to_note()` - Circle of fifths
- `interval_to_fjs()` - FJS notation

---

## 17. UTIL.UTILS - Essential Utilities

### Array Operations (30+ functions)
- `frame()` - Sliding window framing
- `fix_length()` - Pad or trim
- `normalize()` - L1, L2, or infinity norm
- `axis_sort()` - Sort along axis
- `pad_center()` - Center padding
- `sync()` - Align features to frames

### Peak Detection
- `peak_pick()` - Extract peaks with constraints
- `localmax()` / `localmin()` - Local extrema

### Data Type Conversions
- `dtype_r2c()` / `dtype_c2r()` - Real ↔ Complex
- `abs2()` - |x|² computation
- `phasor()` - Complex from angle + magnitude

### Validation
- `valid_audio()` - Check audio validity
- `valid_intervals()` - Validate interval matrices
- `is_positive_int()` - Positive integer check

---

## 18. UTIL.MATCHING - Interval/Event Matching

### Functions
- `match_intervals()` - Match intervals by Jaccard similarity
- `match_events()` - Match spike trains (beat tracking evaluation)

---

## 19. DISPLAY - Visualization

### Core Functions
- `specshow()` - Display spectrograms/features
  - Multiple axis types: freq, mel, cqt, chroma, time, tempo
  
- `waveshow()` - Display waveforms

### Axis Formatters (Matplotlib)
- TimeFormatter, NoteFormatter, ChromaFormatter, etc.

---

## 20. FEATURE.INVERSE - Feature Reconstruction

### Functions
- `mel_to_stft()` - Reconstruct STFT magnitude from Mel
- `mel_to_audio()` - Full audio reconstruction from Mel
- `mfcc_to_mel()` - Mel from MFCC
- `mfcc_to_audio()` - Full reconstruction from MFCC

**Note:** Requires Griffin-Lim for phase recovery

---

## Implementation Priority for pleco-xa

### Must Have (Core)
1. `stft()` / `istft()` ✓ (likely exists)
2. `onset_strength()` ✓
3. `beat_track()` or basic tempo detection
4. Basic feature extraction (melspectrogram, spectral_centroid)

### Should Have (Important)
1. `cqt()` - Better than STFT for music
2. Full pitch tracking (yin, pyin)
3. Chroma features
4. MFCC
5. Complete unit conversions

### Nice to Have (Advanced)
1. HPSS / source separation
2. DTW / sequence alignment
3. Segmentation algorithms
4. Music notation / tuning systems
5. Advanced features (PCEN, Tonnetz)

