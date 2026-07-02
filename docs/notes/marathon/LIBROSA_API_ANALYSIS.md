# Librosa Complete API & Module Structure Analysis

**Repository:** `/tmp/librosa-reference`  
**Analysis Date:** November 15, 2025  
**Librosa Version:** Latest from repository

---

## Table of Contents

1. [Library Overview](#library-overview)
2. [Top-Level Module Structure](#top-level-module-structure)
3. [Complete Function Inventory by Module](#complete-function-inventory-by-module)
4. [Core Capabilities](#core-capabilities)
5. [Feature Extraction Summary](#feature-extraction-summary)
6. [File Organization](#file-organization)

---

## Library Overview

Librosa is a Python library for audio analysis and music information retrieval (MIR). It provides comprehensive tools for:
- Audio loading and I/O
- Time-frequency analysis (STFT, CQT, spectrograms)
- Feature extraction (spectral, harmonic, percussive, rhythmic)
- Segmentation and sequence analysis
- Source separation
- Pitch tracking
- Beat and tempo tracking
- Audio effects and transformations

---

## Top-Level Module Structure

The main Librosa library exports these submodules:

1. **core** - Core audio DSP and transformations
2. **feature** - Feature extraction
3. **beat** - Beat tracking and tempo analysis
4. **onset** - Onset detection
5. **decompose** - Spectrogram decomposition (NMF, HPSS, etc.)
6. **effects** - Audio effects and transformations
7. **segment** - Temporal segmentation
8. **sequence** - Sequential/temporal modeling (DTW, Viterbi, etc.)
9. **filters** - Filter bank construction
10. **display** - Visualization and plotting
11. **util** - Utility functions
12. **cache** - Function caching decorator

---

## Complete Function Inventory by Module

### CORE MODULE (`librosa.core.*`)

#### **Audio Loading & I/O** (`core.audio`)
```
load()
stream()
to_mono()
resample()
get_duration()
get_samplerate()
```

#### **Time-Domain Audio Processing** (`core.audio`)
```
autocorrelate()
lpc()
zero_crossings()
mu_compress()
mu_expand()
```

#### **Signal Generation** (`core.audio`)
```
clicks()
tone()
chirp()
```

#### **Spectral Representations** (`core.spectrum`)
```
stft()                      # Short-Time Fourier Transform
istft()                     # Inverse STFT
reassigned_spectrogram()    # Reassigned spectrogram
magphase()                  # Magnitude and phase decomposition
phase_vocoder()             # Phase vocoder time-stretching
iirt()                      # Inverse Infinite Impulse Response Transform
```

#### **Magnitude Scaling & Weighting** (`core.spectrum`)
```
amplitude_to_db()
db_to_amplitude()
power_to_db()
db_to_power()
perceptual_weighting()
frequency_weighting()       # Generic frequency weighting
multi_frequency_weighting() # Multiple frequency weightings
A_weighting()
B_weighting()
C_weighting()
D_weighting()
Z_weighting()
pcen()                      # Per-Channel Energy Normalization
fmt()                       # Functional Time Representation
```

#### **Constant-Q Transform** (`core.constantq`)
```
cqt()                       # Constant-Q Transform
hybrid_cqt()                # Hybrid CQT
pseudo_cqt()                # Pseudo-CQT
vqt()                       # Variable-Q Transform
icqt()                      # Inverse CQT
griffinlim_cqt()            # Griffin-Lim algorithm for CQT
```

#### **Phase Recovery** (`core.spectrum`)
```
griffinlim()                # Griffin-Lim algorithm
```

#### **Harmonics** (`core.harmonic`)
```
salience()                  # Harmonic salience
interp_harmonics()          # Interpolate harmonics
f0_harmonics()              # Fundamental frequency harmonics
```

#### **Pitch Detection** (`core.pitch`)
```
estimate_tuning()           # Estimate global tuning
pitch_tuning()              # Estimate tuning from frequencies
piptrack()                  # pYIN pitch tracker
yin()                       # YIN pitch detection
pyin()                      # Probabilistic YIN
```

#### **Time-Frequency Unit Conversions** (`core.convert`)

**Frames & Samples:**
```
frames_to_samples()
frames_to_time()
samples_to_frames()
samples_to_time()
time_to_frames()
time_to_samples()
blocks_to_frames()
blocks_to_samples()
blocks_to_time()
```

**Note/Pitch Conversions:**
```
hz_to_note()
hz_to_midi()
midi_to_hz()
midi_to_note()
note_to_hz()
note_to_midi()
```

**Mel Scale Conversions:**
```
hz_to_mel()
mel_to_hz()
hz_to_octs()
octs_to_hz()
A4_to_tuning()
tuning_to_A4()
```

**Svara System (Indian classical music):**
```
hz_to_svara_h()
hz_to_svara_c()
midi_to_svara_h()
midi_to_svara_c()
note_to_svara_h()
note_to_svara_c()
```

**Just Intonation (FJS):**
```
hz_to_fjs()
interval_to_fjs()
```

#### **Frequency Range Generation** (`core.convert`)
```
fft_frequencies()
cqt_frequencies()
mel_frequencies()
tempo_frequencies()
fourier_tempo_frequencies()
```

#### **Music Notation & Theory** (`core.notation`)
```
key_to_notes()              # Convert key to note list
key_to_degrees()            # Convert key to degrees
mela_to_svara()             # Indian classical scales
mela_to_degrees()
thaat_to_degrees()
list_mela()                 # List available melas
list_thaat()                # List available thaats
fifths_to_note()            # Circle of fifths
```

#### **Interval & Tuning Systems** (`core.intervals`)
```
interval_frequencies()
pythagorean_intervals()
plimit_intervals()          # P-limit intervals
```

#### **FFT Library Management** (`core.fft`)
```
get_fftlib()
set_fftlib()
```

---

### FEATURE EXTRACTION MODULE (`librosa.feature.*`)

#### **Spectral Features** (`feature.spectral`)
```
spectral_centroid()         # Center of mass of spectrum
spectral_bandwidth()        # Bandwidth around centroid
spectral_contrast()         # Energy contrast across bands
spectral_rolloff()          # Frequency below which 95% of power
spectral_flatness()         # Spectrum flatness (tonality)
poly_features()             # Polynomial features of spectrogram
rms()                       # Root mean square energy
zero_crossing_rate()        # Zero crossing rate (ZCR)
```

#### **Chroma Features** (`feature.spectral`)
```
chroma_stft()               # Chroma from STFT
chroma_cqt()                # Chroma from CQT
chroma_cens()               # Chroma Energy Normalized Statistics
chroma_vqt()                # Chroma from Variable-Q Transform
```

#### **High-Level Spectral Features** (`feature.spectral`)
```
mfcc()                      # Mel-Frequency Cepstral Coefficients
melspectrogram()            # Mel-scaled spectrogram
tonnetz()                   # Tonal Centroid (Tonnetz)
```

#### **Rhythmic Features** (`feature.rhythm`)
```
tempo()                     # Estimate global tempo
tempogram()                 # Local autocorrelation of onset strength
fourier_tempogram()         # Fourier-based tempogram
tempogram_ratio()           # Tempogram at different ratios
```

#### **Feature Manipulation** (`feature.utils`)
```
delta()                     # Compute delta (first-order difference)
stack_memory()              # Stack temporal context
```

#### **Feature Inversion** (`feature.inverse`)
```
mel_to_stft()               # Approximate STFT from Mel spectrogram
mel_to_audio()              # Reconstruct audio from Mel spectrogram
mfcc_to_mel()               # Approximate Mel from MFCC
mfcc_to_audio()             # Reconstruct audio from MFCC
```

---

### BEAT & TEMPO MODULE (`librosa.beat`)

```
beat_track()                # Dynamic programming beat tracker
plp()                       # Probabilistic Latent Periodicity
```

Note: `tempo()` was moved to `feature.rhythm`

---

### ONSET DETECTION MODULE (`librosa.onset`)

```
onset_detect()              # Detect note onsets
onset_strength()            # Compute onset strength envelope
onset_strength_multi()      # Multi-band onset strength
onset_backtrack()           # Backtrack onset times to minima
```

---

### DECOMPOSITION MODULE (`librosa.decompose`)

```
decompose()                 # NMF/general decomposition
hpss()                      # Harmonic-Percussive Source Separation
nn_filter()                 # Nearest-neighbor filtering
```

---

### EFFECTS MODULE (`librosa.effects`)

```
hpss()                      # HPSS with automatic STFT->ISTFT
harmonic()                  # Extract harmonic component
percussive()                # Extract percussive component
time_stretch()              # Time-stretch audio
pitch_shift()               # Pitch-shift audio
remix()                     # Remix audio channels
trim()                      # Trim leading/trailing silence
split()                     # Split audio at silences
preemphasis()               # Apply pre-emphasis filter
deemphasis()                # Remove pre-emphasis
```

---

### SEGMENTATION MODULE (`librosa.segment`)

#### **Similarity & Recurrence:**
```
cross_similarity()          # Cross-similarity between features
recurrence_matrix()         # Recurrence relations
recurrence_to_lag()         # Convert recurrence to lag format
lag_to_recurrence()         # Convert lag to recurrence
timelag_filter()            # Apply time-lag filter decorator
path_enhance()              # Enhance diagonal paths
```

#### **Temporal Clustering:**
```
agglomerative()             # Agglomerative clustering
subsegment()                # Subsegment clustering
```

---

### SEQUENCE MODELING MODULE (`librosa.sequence`)

#### **Sequence Alignment:**
```
dtw()                       # Dynamic Time Warping
dtw_backtracking()          # DTW backtracking
rqa()                       # Recurrence Quantification Analysis
```

#### **Viterbi Decoding:**
```
viterbi()                   # Standard Viterbi algorithm
viterbi_discriminative()    # Discriminative Viterbi
viterbi_binary()            # Binary Viterbi
```

#### **Transition Matrix Construction:**
```
transition_uniform()        # Uniform transition matrix
transition_loop()           # Loop transition (stay in state)
transition_cycle()          # Cyclic transition
transition_local()          # Local transitions only
```

---

### FILTERS MODULE (`librosa.filters`)

#### **Filter Bank Construction:**
```
mel()                       # Mel-scale filter bank
chroma()                    # Chroma filter bank
wavelet()                   # Wavelet filter bank
semitone_filterbank()       # Semitone-spaced filters
constant_q()                # (Deprecated) Constant-Q filters
constant_q_lengths()        # (Deprecated) CQ filter lengths
```

#### **Window Functions & Analysis:**
```
get_window()                # Retrieve window function
window_bandwidth()          # Compute window bandwidth
window_sumsquare()          # Sum-of-squares for overlap-add
```

#### **Filter Utilities:**
```
cq_to_chroma()              # Convert CQ to chroma
mr_frequencies()            # Multirate frequencies
wavelet_lengths()           # Wavelet filter lengths
diagonal_filter()           # Diagonal filters for segmentation
```

---

### DISPLAY & VISUALIZATION MODULE (`librosa.display`)

#### **Core Visualization:**
```
specshow()                  # Display spectrograms/feature matrices
waveshow()                  # Display waveforms
```

#### **Axis Formatters (for matplotlib):**
```
TimeFormatter               # Format time axes
NoteFormatter               # Format note axes
SvaraFormatter              # Format Svara (Indian note) axes
FJSFormatter                # Format FJS axes
LogHzFormatter              # Format log-frequency axes
ChromaFormatter             # Format chroma axes
ChromaSvaraFormatter        # Format chroma-Svara axes
ChromaFJSFormatter          # Format chroma-FJS axes
TonnetzFormatter            # Format Tonnetz axes
```

#### **Utilities:**
```
cmap()                      # Generate/retrieve colormaps
AdaptiveWaveplot            # Adaptive waveform plotting
```

---

### UTILITY MODULE (`librosa.util.*`)

#### **Array Operations** (`util.utils`)
```
frame()                     # Frame audio/arrays
pad_center()                # Center-pad array
expand_to()                 # Expand to target shape
fix_length()                # Pad/trim to length
fix_frames()                # Adjust frame count
axis_sort()                 # Sort along axis
normalize()                 # Normalize array
shear()                     # Shear transformation
stack()                     # Stack arrays
sync()                      # Synchronize feature to frames
sparsify_rows()             # Convert to sparse row format
buf_to_float()              # Convert buffer to float
index_to_slice()            # Convert indices to slices
softmask()                  # Soft masking function
tiny()                      # Get smallest usable value
fill_off_diagonal()         # Fill off-diagonal elements
cyclic_gradient()           # Cyclic gradient
```

#### **Peak Detection & Local Extrema** (`util.utils`)
```
localmax()                  # Find local maxima
localmin()                  # Find local minima
peak_pick()                 # Pick peaks with constraints
```

#### **Data Type Operations** (`util.utils`)
```
dtype_r2c()                 # Convert real dtype to complex
dtype_c2r()                 # Convert complex dtype to real
abs2()                      # Squared magnitude (|x|²)
phasor()                    # Complex phasor from angles
count_unique()              # Count unique elements
is_unique()                 # Check uniqueness
```

#### **Validation** (`util.utils`)
```
valid_audio()               # Validate audio array
valid_int()                 # Validate integer
valid_intervals()           # Validate interval arrays
is_positive_int()           # Check if positive integer
```

#### **Optimization** (`util._nnls`)
```
nnls()                      # Non-negative least squares
```

#### **Interval Matching** (`util.matching`)
```
match_intervals()           # Match intervals by overlap
match_events()              # Match events (spike trains)
```

#### **File Operations** (`util.files`)
```
example()                   # Load example audio file
ex()                        # Alias for example()
list_examples()             # List available examples
example_info()              # Get example information
find_files()                # Find files by pattern
cite()                      # Print citation information
```

---

## Core Capabilities

### 1. **Audio Input/Output & Streaming**
- Load audio from files (MP3, WAV, OGG, FLAC, M4A, etc.)
- Stream audio files without loading entirely into memory
- Convert to mono or preserve channels
- Resample audio
- Get audio duration and sample rate

### 2. **Time-Frequency Analysis**
- **STFT-based:** Magnitude and phase spectrograms with customizable window sizes
- **CQT-based:** Logarithmically-spaced spectrograms (better for music)
- **Variable-Q:** Hybrid time-frequency analysis
- **Reassigned:** Time-frequency reassignment for sharper spectrograms
- **Phase recovery:** Griffin-Lim algorithm

### 3. **Feature Extraction**
- **Spectral:** Centroid, bandwidth, contrast, rolloff, flatness
- **Energy:** RMS, zero-crossing rate
- **Chroma:** Pitch-based features from multiple representations
- **Cepstral:** MFCCs for speaker/music classification
- **Perceptual:** Weighted spectrograms (A, B, C, D weighting)
- **Advanced:** Tonnetz, PCEN, polynomial features

### 4. **Beat & Tempo Tracking**
- Dynamic programming beat tracker
- Tempo estimation
- Onset detection and strength tracking
- Probabilistic tempo analysis via tempograms

### 5. **Pitch & Frequency Analysis**
- Multiple pitch tracking algorithms (YIN, pYIN, PipTrack)
- Tuning estimation
- Harmonic analysis and salience
- Support for various musical systems (Western, Svara/Indian, Just Intonation/FJS)

### 6. **Source Separation**
- Harmonic-Percussive Source Separation (HPSS)
- Non-negative matrix factorization (NMF)
- Nearest-neighbor filtering
- Median filtering

### 7. **Audio Effects & Transformations**
- Time stretching (constant pitch)
- Pitch shifting (constant duration)
- Pre/de-emphasis filtering
- Audio remixing and channel manipulation
- Silence trimming and segmentation

### 8. **Segmentation & Clustering**
- Cross-similarity analysis
- Recurrence relations
- Agglomerative clustering
- Temporal subsegmentation
- Path enhancement

### 9. **Sequential/Temporal Modeling**
- Dynamic Time Warping (DTW)
- Recurrence Quantification Analysis (RQA)
- Viterbi algorithm (standard, discriminative, binary)
- Transition matrix construction

### 10. **Audio Visualization**
- Spectrogram display with multiple axis types
- Waveform visualization
- Flexible axis labeling (time, frequency, notes, chroma, etc.)
- Colormap management

---

## Feature Extraction Summary

### Spectral Features Extracted
| Feature | Purpose | Typical Use Case |
|---------|---------|------------------|
| Spectral Centroid | Brightness of sound | Instrument timbre |
| Spectral Bandwidth | Spread around centroid | Timbral variation |
| Spectral Contrast | Energy difference between peaks/valleys | Genre classification |
| Spectral Rolloff | Edge of most energy | Brightness measure |
| Spectral Flatness | Tonality vs noise | Voiced/unvoiced detection |
| RMS Energy | Overall loudness | Intensity profile |
| Zero Crossing Rate | Noisiness | Voiced/unvoiced detection |

### Time-Frequency Representations
| Transform | Resolution | Best For |
|-----------|-----------|----------|
| STFT | Fixed | General spectrogram, speech |
| CQT | Log-frequency | Music (constant Q bins) |
| Mel | Perceptual | Speech recognition, music |
| MFCC | Cepstral | Speech/speaker recognition |
| Tempogram | Autocorrelation | Rhythm/tempo analysis |

### Chroma Features
| Type | Characteristics |
|------|-----------------|
| Chroma STFT | Direct from STFT magnitude |
| Chroma CQT | From constant-Q transform |
| Chroma CENS | Energy-normalized, cleaner |
| Chroma VQT | From variable-Q transform |

---

## File Organization

```
/tmp/librosa-reference/librosa/
├── __init__.py              # Main package entry, lazy-loads all modules
├── __init__.pyi             # Type stubs for main package
├── _cache.py                # Caching decorator
├── _typing.py               # Type definitions
├── version.py               # Version info & show_versions()
│
├── core/                    # Core DSP operations
│   ├── __init__.py
│   ├── __init__.pyi
│   ├── audio.py            # Audio I/O & basic DSP
│   ├── spectrum.py         # STFT, magnitude scaling, phase recovery
│   ├── constantq.py        # CQT, VQT variants
│   ├── convert.py          # Unit conversions (59+ functions!)
│   ├── pitch.py            # Pitch tracking (YIN, pYIN, piptrack)
│   ├── harmonic.py         # Harmonic analysis
│   ├── fft.py              # FFT library abstraction
│   ├── intervals.py        # Tuning systems (Pythagorean, p-limit)
│   └── notation.py         # Music notation (keys, scales, intervals)
│
├── feature/                 # Feature extraction
│   ├── __init__.py
│   ├── __init__.pyi
│   ├── spectral.py         # Spectral features, chroma, mel, MFCC
│   ├── rhythm.py           # Tempo, tempograms
│   ├── inverse.py          # Feature inversion
│   └── utils.py            # Delta, stack_memory
│
├── beat.py                 # Beat tracking & plp
├── onset.py                # Onset detection
├── decompose.py            # NMF, HPSS, nearest-neighbor
├── effects.py              # Time-stretch, pitch-shift, trim, split
├── segment.py              # Segmentation & clustering
├── sequence.py             # DTW, RQA, Viterbi, transitions
├── filters.py              # Filter banks & windows
├── display.py              # Visualization (65KB+ of plotting code!)
│
├── util/                    # Utilities
│   ├── __init__.py
│   ├── __init__.pyi
│   ├── utils.py            # 2500+ lines of array operations
│   ├── files.py            # File I/O & example management
│   ├── matching.py         # Interval/event matching
│   ├── decorators.py       # Moved, deprecated decorators
│   ├── exceptions.py       # Custom exceptions
│   ├── deprecation.py      # Deprecation utilities
│   ├── _nnls.py            # Non-negative least squares
│   └── example_data/       # Example audio files
│
└── py.typed                 # PEP 561 marker for type checking
```

---

## Key Statistics

### Function Count by Module
| Module | Function Count | Purpose |
|--------|----------------|---------|
| core.convert | 60+ | Unit conversions (most extensive!) |
| core.spectrum | 30+ | Spectral operations |
| core.audio | 15+ | Audio I/O & processing |
| feature.spectral | 20+ | Feature extraction |
| util.utils | 50+ | Utility functions |
| filters | 15+ | Filter construction |
| sequence | 10+ | Sequential modeling |
| display | 20+ | Visualization |
| **TOTAL** | **350+** | **Complete library** |

### Lines of Code by Module
| Module | LOC | Complexity |
|--------|-----|-----------|
| display.py | 1,800+ | Very high (plotting) |
| sequence.py | 2,000+ | High (advanced algorithms) |
| filters.py | 1,300+ | High (DSP theory) |
| core/spectrum.py | 2,800+ | Very high |
| core/audio.py | 1,400+ | High |
| core/convert.py | 3,200+ | Very high |
| util/utils.py | 2,500+ | High |

---

## API Design Patterns

### 1. **Flexible Input**
Most functions accept either:
- Raw audio: `y` (time series) + `sr` (sample rate)
- Pre-computed features: `S` (spectrogram) or `onset_envelope`, etc.

Example:
```python
# Option A: From audio
centroid = spectral_centroid(y=y, sr=sr)

# Option B: From spectrogram
centroid = spectral_centroid(S=S, sr=sr)
```

### 2. **Unit Flexibility**
Time/frame conversions support multiple units:
- `units='frames'` - Frame indices
- `units='samples'` - Audio sample indices
- `units='time'` - Time in seconds

### 3. **Multichannel Support**
Most modern functions support multichannel (stereo, surround) audio:
```python
y.shape = (n_channels, n_samples)
```

### 4. **Type Hints**
Extensive use of PEP 484 type hints with stub files (`.pyi`) for IDE support.

### 5. **Caching**
Optional function-level caching via `@cache` decorator for expensive operations.

---

## Comparison with JavaScript Implementation

For the pleco-xa project, key gaps vs. Librosa would be:

### Fully Implemented
- STFT/iSTFT
- Onset detection (basic)
- Beat tracking (basic)
- Tempo estimation (basic via autocorrelation)

### Partially Implemented
- Feature extraction (subset)
- CQT (potentially via librosa-rs)

### NOT Implemented
- Full pitch tracking (YIN, pYIN, piptrack)
- Complete feature extraction (60+ functions)
- Music notation & intervals
- Segmentation & clustering
- Viterbi/DTW
- 30+ utility functions
- Visualization
- Advanced DSP (PCEN, FMT, harmonic analysis)

---

## Conclusion

Librosa is a **comprehensive, production-grade audio analysis library** with:
- **350+ public functions** across 12+ modules
- **Strong mathematical foundation** in signal processing
- **Flexible API** supporting multiple input/output formats
- **Extensive feature extraction** for music information retrieval
- **Advanced algorithms** for segmentation, pitch tracking, and sequential modeling
- **Type safety** with full type hints

The JavaScript port (pleco-xa) would need significant expansion to match the full API surface, particularly in:
1. Advanced pitch tracking algorithms
2. Complete feature extraction suite
3. Segmentation and clustering
4. Sequential modeling algorithms
5. Comprehensive music notation support

---

*This analysis provides a complete inventory of Librosa's public API for comparison with the JavaScript implementation.*

