# Librosa Quick Reference & Implementation Gaps

## Function Count Summary

| Category | Count | Coverage |
|----------|-------|----------|
| **Core Audio I/O** | 6 | ✓ Core |
| **Time-Frequency Transforms** | 15+ | ✓ Partial (STFT exists) |
| **Magnitude Scaling** | 12 | - |
| **Spectral Features** | 20+ | ✓ Partial |
| **Chroma Features** | 4 | - |
| **Rhythmic Features** | 4 | ✓ Partial (tempo) |
| **Beat Tracking** | 2 | ✓ Partial |
| **Onset Detection** | 4 | ✓ Partial |
| **Pitch Tracking** | 5 | - |
| **Source Separation** | 3 | - |
| **Audio Effects** | 8 | - |
| **Segmentation** | 6 | - |
| **Sequential Modeling** | 9 | - |
| **Filter Construction** | 8 | - |
| **Unit Conversions** | 60+ | - |
| **Harmonics** | 3 | - |
| **Music Notation** | 8+ | - |
| **Utilities** | 50+ | - |
| **Visualization** | 20+ | - |
| **TOTAL** | **350+** | ~10% |

---

## Critical Functions for Audio Analysis

### Absolutely Essential
1. **stft() / istft()** - Spectrogram generation
   - Status: ✓ Exists in pleco-xa
   - Files: `/librosa/core/spectrum.py`
   - Lines: ~600

2. **onset_strength()** - Onset envelope
   - Status: ✓ Exists (or equivalent)
   - Files: `/librosa/onset.py`
   - Key parameters: sr, n_fft, hop_length

3. **beat_track()** - Beat detection
   - Status: ✓ Basic version exists
   - Files: `/librosa/beat.py`
   - Complexity: High (dynamic programming)

### Very Important (High Priority)
4. **melspectrogram()** - Perceptual spectrogram
5. **spectral_centroid()** - Audio brightness
6. **tempo()** - Global tempo from onset envelope
7. **cqt()** - Musical frequency representation
8. **chroma_stft()** - Pitch-class features
9. **mfcc()** - Speech-like features

### Important (Medium Priority)
10. **yin()** / **pyin()** - Pitch tracking
11. **onset_detect()** - Note onset times
12. **hpss()** - Harmonic-percussive separation
13. **rms()** - Energy computation
14. **time_stretch()** - Tempo change
15. **pitch_shift()** - Frequency shift

---

## Function Mapping to Source Files

### Core Spectral Operations (`core/spectrum.py`)
```
stft()                  - Line ~55   (394 lines total)
istft()                 - Line ~394
magphase()              - Line ~1296
phase_vocoder()         - Line ~1365
power_to_db()           - Line ~1668
db_to_power()           - Line ~1826
amplitude_to_db()       - Line ~1877
db_to_amplitude()       - Line ~1977
perceptual_weighting()  - Line ~2028
fmt()                   - Line ~2101
pcen()                  - Line ~2300
griffinlim()            - Line ~2634
```

### Feature Extraction (`feature/spectral.py`)
```
spectral_centroid()     - Line ~45   (2000+ lines total)
spectral_bandwidth()    - Line ~192
spectral_contrast()     - Line ~352
spectral_rolloff()      - Line ~533
spectral_flatness()     - Line ~681
rms()                   - Line ~801
poly_features()         - Line ~914
zero_crossing_rate()    - Line ~1058
chroma_stft()           - Line ~1132
chroma_cqt()            - Line ~1289
chroma_cens()           - Line ~1419
chroma_vqt()            - Line ~1567
tonnetz()               - Line ~1700
mfcc()                  - Line ~1834
melspectrogram()        - Line ~2013
```

### Rhythm Features (`feature/rhythm.py`)
```
tempogram()             - Line ~24   (500+ lines total)
fourier_tempogram()     - Line ~179
tempo()                 - Line ~281
tempogram_ratio()       - Line ~457
```

### Beat & Onset (`beat.py`, `onset.py`)
```
beat_track()            - beat.py, Line ~36
plp()                   - beat.py, Line ~267
onset_detect()          - onset.py, Line ~29
onset_strength()        - onset.py, Line ~216
onset_backtrack()       - onset.py, Line ~369
onset_strength_multi()  - onset.py, Line ~445
```

### Unit Conversions (`core/convert.py`)
```
Time Conversions - Line ~65-625
Pitch Conversions - Line ~679-1115
Frequency Scales - Line ~1162-1405
Frequency Generation - Line ~1586-1804
Weighting Functions - Line ~1804-2228
```

---

## Implementation Gaps Analysis

### Group A: Core Functionality (10% done)

**What Exists:**
- STFT/iSTFT
- Basic beat/tempo (may be incomplete)
- Onset envelope
- Partial feature extraction

**What's Missing:**
- CQT / VQT / Hybrid CQT (musical frequency scale)
- Phase recovery (Griffin-Lim, reassignment)
- Advanced magnitude scaling (PCEN, FMT)
- Most unit conversions (60+ functions)
- Audio file I/O (likely using different approach)

**Effort to Implement:** Medium (mathematical)

---

### Group B: Feature Extraction (20% done)

**What Likely Exists:**
- Melspectrogram (via mel filters)
- Some spectral features (centroid, etc.)

**What's Missing:**
- Chroma features (all 4 variants)
- MFCC
- Spectral contrast, flatness, rolloff
- Poly features, Tonnetz
- Zero-crossing rate
- Complete RMS implementation
- Tempogram (both variants)

**Effort to Implement:** Medium-High (formula-based)

---

### Group C: Advanced Audio Processing (5% done)

**What's Missing:**
- Pitch tracking (YIN, pYIN, piptrack) - 3 algorithms
- Source separation (HPSS) - audio effect
- Time/pitch shifting - non-trivial
- Audio effects (trim, split, remix, pre/de-emphasis)
- Audio loading/streaming

**Effort to Implement:** High (algorithmic complexity)

---

### Group D: Music Analysis (0% done)

**Completely Missing:**
- Segmentation (cross-similarity, recurrence, clustering)
- Sequential modeling (DTW, RQA, Viterbi)
- Music notation (key/scale/interval systems)
- Harmonic analysis

**Effort to Implement:** Very High (complex algorithms)

---

### Group E: Utilities (10% done)

**Completely Missing:**
- Array operations (50+ functions)
- Peak detection utilities
- Data type conversions
- Validation functions
- Interval matching
- Visualization

**Effort to Implement:** Medium (mostly straightforward)

---

## Estimated Implementation Effort

| Component | Functions | LOC Est. | Effort | Time Est. |
|-----------|-----------|----------|--------|-----------|
| CQT | 6 | 800 | High | 40h |
| Pitch Tracking | 3 | 1200 | Very High | 60h |
| Feature Extraction | 25 | 500 | Medium | 30h |
| Unit Conversions | 60+ | 300 | Low | 20h |
| Source Separation | 2 | 300 | Medium | 15h |
| Segmentation | 6 | 1000 | Very High | 50h |
| Sequential Models | 9 | 1500 | Very High | 60h |
| Effects | 8 | 400 | Medium | 20h |
| Utilities | 50+ | 400 | Low-Medium | 25h |
| **TOTAL** | **170+** | **7000+** | **High** | **320h** |

---

## Most Requested Librosa Functions

Based on common use cases for pleco-xa:

### Tier 1 (Already implemented or needed ASAP)
```python
librosa.stft()              # ✓
librosa.istft()             # ✓
librosa.beat.beat_track()   # ✓ (partial)
librosa.onset.onset_strength()  # ✓ (partial)
librosa.feature.melspectrogram()  # Likely
```

### Tier 2 (High priority for expansion)
```python
librosa.feature.mfcc()
librosa.feature.chroma_stft()
librosa.feature.spectral_centroid()
librosa.core.cqt()
librosa.effects.time_stretch()
librosa.effects.pitch_shift()
librosa.feature.tempo()
```

### Tier 3 (Nice to have)
```python
librosa.core.yin()          # Pitch tracking
librosa.feature.rms()       # Energy
librosa.feature.tonnetz()   # Tonal features
librosa.segment.cross_similarity()
librosa.sequence.dtw()
```

---

## API Design Consistency Notes

### Parameter Naming Conventions
- `y` - Audio time series
- `sr` - Sample rate
- `S` - Magnitude spectrogram
- `D` - Complex STFT matrix
- `n_fft` - FFT window size (typically 2048)
- `hop_length` - Frame hop (typically 512)
- `n_mels` - Number of Mel bands (typically 128)
- `fmin` / `fmax` - Frequency bounds

### Return Value Patterns
- Single value functions return scalar or 1D array
- Transform functions typically return 2D arrays (freq × time)
- Most features can accept either:
  - Raw audio: `y` + `sr`
  - Pre-computed: `S` + `sr`

### Multichannel Support
- Modern functions accept `(..., n_samples)` shapes
- Features computed per-channel with leading dimensions preserved
- Example: stereo audio `(2, 44100)` → features `(2, n_features, n_frames)`

---

## Key Implementation Tips

### 1. Use NumPy/SciPy Wherever Possible
Librosa heavily relies on:
- `np.fft` for FFT operations
- `scipy.signal` for filtering
- `scipy.ndimage` for morphological operations
- `numba` for performance-critical loops

### 2. Lazy Loading Pattern
Librosa uses lazy loading for submodules:
```python
# __init__.py uses lazy.attach_stub()
__getattr__, __dir__, __all__ = lazy.attach_stub(__name__, __file__)
```

### 3. Type Hints are Extensive
- PEP 484 type hints throughout
- `.pyi` stub files for IDE support
- Multiple overloads for flexible input types

### 4. Caching is Important
```python
@cache(level=30)  # Optional function-level caching
def expensive_operation(...):
    ...
```

### 5. Unit Conversions are Pervasive
Most functions handle multiple units:
- frames, samples, time (seconds)
- Hz, MIDI, notes, semitones, cents
- Linear, log, mel scales

---

## Summary for pleco-xa Integration

### Current State
- ~10% of Librosa API implemented
- Core spectral operations mostly complete
- Basic beat/tempo detection likely functional
- Missing: advanced features, pitch tracking, segmentation

### Recommended Priority
1. **Quick Wins** - Unit conversions, magnitude scaling, utilities
2. **Medium Effort** - Feature extraction suite, effects
3. **High Effort** - Pitch tracking, CQT, segmentation
4. **Future** - Music notation, sequential modeling

### Testing Strategy
- Cross-validate with Python Librosa for numerical accuracy
- Use provided test suite as reference
- Focus on common use cases first

---

*Last Updated: November 15, 2025*
*Analysis of Librosa 0.10+*

