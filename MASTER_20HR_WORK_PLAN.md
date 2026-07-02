# MASTER 20-HOUR AUTONOMOUS WORK PLAN
## Systematic Execution Order for Pleco Audio Library

**Created:** 2025-11-15
**Duration:** 20 hours continuous autonomous work
**Goal:** Transform pleco-xa into production-ready Librosa-equivalent library

---

## GUIDING PRINCIPLES

1. **Fix bugs first** - Don't build on broken foundations
2. **Accuracy before features** - Match Librosa behavior exactly
3. **Test as you go** - Verify each fix works
4. **Dependencies matter** - Low-level functions before high-level
5. **Commit frequently** - Save progress every 2-3 hours

---

## PHASE 1: CRITICAL BUG FIXES (3 hours)
**Why First:** Broken code can corrupt results throughout the library

### Hour 1: Fix Spectral Leakage Bug
**CRITICAL BUG:** xa-advanced.js STFT has NO WINDOWING!

**Tasks:**
- [1.1] Read xa-advanced.js lines 585-620 (15 min)
- [1.2] Verify simple_stft() is missing windowing (10 min)
- [1.3] Replace with import from xa-fft.js (20 min)
- [1.4] Update all calls to use xa-fft.stft() (15 min)

**Deliverable:** xa-advanced.js uses proper windowed STFT

---

### Hour 2: Fix Wrong Default Parameters

**Task 2.1: Fix n_mfcc defaults (30 min)**
- xa-mel.js:213 - Change n_mfcc=13 → n_mfcc=20
- Verify xa-spectral.js has n_mfcc=20 (already correct)
- Document which MFCC implementation to use (xa-spectral.js is more complete)

**Task 2.2: Fix mel_filterbank normalization (30 min)**
- Currently: norm=true (boolean)
- Librosa: norm='slaney' (string) or number or null
- Add htk parameter support
- Update mel_filterbank() signature to match Librosa

**Deliverable:** All defaults match Librosa

---

### Hour 3: Commit & Verify Fixes

**Tasks:**
- [3.1] Run quick smoke tests on fixed functions (30 min)
- [3.2] Git commit with detailed message (15 min)
- [3.3] Git push to remote (5 min)
- [3.4] Update ACCURACY_AUDIT.md with fixes (10 min)

**Deliverable:** Phase 1 committed and documented

---

## PHASE 2: COMPLETE CORE FUNCTIONS (6 hours)
**Why Second:** Need solid foundation before building advanced features

### Hour 4: Audit & Fix Core STFT/FFT

**Task 4.1: Verify xa-fft.js matches Librosa (45 min)**
- Compare stft() parameters to Librosa
- Check: center, pad_mode, window types
- Verify istft() reconstruction is accurate
- Check power parameter support

**Task 4.2: Add missing parameters (15 min)**
- Add win_length parameter if missing
- Ensure all window types supported

**Deliverable:** xa-fft.js 100% Librosa-compatible

---

### Hour 5: Complete Mel/MFCC Functions

**Task 5.1: Enhance melspectrogram() (30 min)**
- Add S parameter (accept pre-computed spectrogram)
- Add win_length, window, center, pad_mode, power parameters
- Match Librosa signature exactly

**Task 5.2: Enhance mfcc() (30 min)**
- Add S parameter
- Add dct_type parameter
- Add norm parameter
- Add mel_norm parameter
- Verify lifter implementation matches Librosa

**Deliverable:** Mel/MFCC functions feature-complete

---

### Hour 6: Create Missing Utility Functions

**Task 6.1: Create xa-convert.js (unit conversions) (30 min)**
```javascript
/**
 * Port of librosa.core unit conversion utilities
 */

// Hz ↔ MIDI
export function hz_to_midi(frequencies, a4=440.0)
export function midi_to_hz(notes, a4=440.0)

// Hz ↔ Note names
export function hz_to_note(frequencies, octave=True, cents=False)
export function note_to_hz(note)

// Frames ↔ Time
export function frames_to_time(frames, sr=22050, hop_length=512)
export function time_to_frames(times, sr=22050, hop_length=512)

// Samples ↔ Time
export function samples_to_time(samples, sr=22050)
export function time_to_samples(times, sr=22050)

// DB conversions
export function amplitude_to_db(S, ref=1.0, amin=1e-5, top_db=80.0)
export function db_to_amplitude(S_db, ref=1.0)
export function power_to_db(S, ref=1.0, amin=1e-10, top_db=80.0)
export function db_to_power(S_db, ref=1.0)
```

**Task 6.2: Create xa-normalize.js (normalization) (30 min)**
```javascript
/**
 * Port of librosa.util.normalize
 */

export function normalize(S, norm=Infinity, axis=0, threshold=null, fill=null)
```

**Deliverable:** Core utility functions available

---

### Hour 7: Create Missing Spectral Features

**Task 7.1: Verify existing spectral features (20 min)**
- Check xa-spectral.js for completeness
- List what's missing vs Librosa

**Task 7.2: Add missing spectral features (40 min)**
From Librosa feature.spectral:
- spectral_bandwidth ✓ (verify parameters)
- spectral_contrast ✓ (verify parameters)
- spectral_rolloff ✓ (verify parameters)
- spectral_flatness ✓ (verify parameters)
- zero_crossing_rate ✓ (verify parameters)
- Missing: poly_features needs verification

**Deliverable:** All basic spectral features implemented

---

### Hour 8: Create Pitch Tracking Module

**Task 8.1: Create xa-pitch.js (YIN algorithm) (45 min)**
```javascript
/**
 * Port of librosa.core.pitch (YIN/pYIN)
 * Pitch detection and tracking
 */

export function yin(y, fmin, fmax, sr=22050, frame_length=2048, win_length=null, hop_length=null, trough_threshold=0.1)

export function pyin(y, fmin, fmax, sr=22050, frame_length=2048, win_length=null, hop_length=null, n_thresholds=100, beta_parameters=[2,18], boltzmann_parameter=2, resolution=0.1, max_transition_rate=35.92, switch_prob=0.01, no_trough_prob=0.01)

export function piptrack(y=null, sr=22050, S=null, n_fft=2048, hop_length=null, fmin=150.0, fmax=4000.0, threshold=0.1, win_length=null, window='hann', center=True, pad_mode='constant', ref=None)
```

**Task 8.2: Test pitch detection (15 min)**

**Deliverable:** Basic pitch tracking available

---

### Hour 9: Commit & Document Progress

**Tasks:**
- [9.1] Commit all new functions (15 min)
- [9.2] Push to remote (5 min)
- [9.3] Update LIBROSA_QUICK_REFERENCE.md coverage (20 min)
- [9.4] Update todo list (10 min)
- [9.5] Quick verification tests (10 min)

**Deliverable:** Phase 2 complete and saved

---

## PHASE 3: ADVANCED FEATURES (4 hours)
**Why Third:** Build on solid foundation

### Hour 10: Source Separation (HPSS)

**Task 10.1: Create xa-decompose.js (60 min)**
```javascript
/**
 * Port of librosa.decompose
 * Spectral decomposition (HPSS, NMF)
 */

export function hpss(S, kernel_size=31, power=2.0, mask=False, margin=1.0)
export function harmonic(y=null, sr=22050, S=null, ...)
export function percussive(y=null, sr=22050, S=null, ...)

// Optional for later:
export function nn_filter(S, aggregate=None, metric='cosine', width=1, ...)
export function decompose(S, n_components=None, ...)
```

**Deliverable:** HPSS implemented

---

### Hour 11: Enhanced Beat Tracking

**Task 11.1: Audit existing beat tracking (30 min)**
- xa-beat.js
- xa-beat-tracker.js
- xa-bpm-algorithm.js
- Identify best implementation

**Task 11.2: Create unified xa-beat-unified.js (30 min)**
- Combine best algorithms
- Match Librosa beat.beat_track() signature
- Include pluck() function
- Include tempo() enhancements

**Deliverable:** Production-ready beat tracking

---

### Hour 12: Segmentation & Structure

**Task 12.1: Create xa-segment.js (60 min)**
```javascript
/**
 * Port of librosa.segment
 * Music structure analysis
 */

export function recurrence_matrix(data, k=None, width=1, metric='euclidean', sym=False, axis=-1)
export function recurrence_to_lag(rec, pad=True, axis=-1)
export function lag_to_recurrence(lag, axis=-1)
export function timelag_filter(function, pad=True, index=0)
export function subsegment(data, frames, ...)
export function agglomerative(data, k, ...)
export function path_enhance(R, n, ...)
```

**Deliverable:** Structure analysis available

---

### Hour 13: Audio Effects

**Task 13.1: Create xa-effects.js (60 min)**
```javascript
/**
 * Port of librosa.effects
 * Audio transformations and effects
 */

export function time_stretch(y, rate, ...)
export function pitch_shift(y, sr, n_steps, ...)
export function remix(y, intervals, ...)
export function trim(y, top_db=60, ref=1.0, frame_length=2048, hop_length=512)
export function split(y, top_db=60, ...)
export function preemphasis(y, coef=0.97, zi=None, return_zf=False)
export function deemphasis(y, coef=0.97, zi=None, return_zf=False)
export function percussive(y=None, sr=22050, S=None, ...)
export function harmonic(y=None, sr=22050, S=None, ...)
```

**Deliverable:** Common effects implemented

---

## PHASE 4: TESTING & VALIDATION (3 hours)
**Why Fourth:** Ensure everything works correctly

### Hour 14: Set Up Testing Framework

**Task 14.1: Install and configure Jest (20 min)**
```bash
npm init -y
npm install --save-dev jest
```

**Task 14.2: Create jest.config.js (10 min)**

**Task 14.3: Create test fixtures (30 min)**
- Generate sine waves
- Generate chirps
- Create simple drum patterns
- Save as test fixtures

**Deliverable:** Testing framework ready

---

### Hour 15: Write Core Tests

**Task 15.1: Test xa-fft.js (30 min)**
```javascript
// test/core/fft.test.js
- FFT of DC signal
- FFT/IFFT round trip
- STFT/ISTFT round trip
- Window function properties
- FFT frequencies
```

**Task 15.2: Test xa-mel.js (30 min)**
```javascript
// test/feature/mel.test.js
- Hz/Mel conversions (both Slaney & HTK)
- Mel filterbank shape
- Mel filterbank normalization
- Melspectrogram shape
- MFCC computation
- DCT correctness
```

**Deliverable:** Core functions tested

---

### Hour 16: Write Feature Tests

**Task 16.1: Test xa-onset.js (20 min)**
```javascript
// test/beat/onset.test.js
- Onset detection on impulse train
- STFT shape
- Spectral flux increases with onset
- Peak picking
```

**Task 16.2: Test xa-beat.js (20 min)**
```javascript
// test/beat/tracker.test.js
- Tempo estimation accuracy
- Beat tracking on regular pattern
```

**Task 16.3: Test spectral features (20 min)**
```javascript
// test/feature/spectral.test.js
- Spectral centroid
- RMS energy
- Zero crossing rate
```

**Deliverable:** Beat and spectral features tested

---

## PHASE 5: ORGANIZATION & PACKAGING (3 hours)
**Why Fifth:** Clean structure for publication

### Hour 17: Create Organized Structure

**Task 17.1: Create pleco-audio directory (15 min)**
```bash
mkdir -p pleco-audio/src/{core,beat,feature,segment,effects,util,types}
mkdir -p pleco-audio/test/{core,beat,feature,fixtures}
mkdir -p pleco-audio/{examples,docs/api}
```

**Task 17.2: Copy and organize files (45 min)**
- Move xa-fft.js → src/core/fft.js
- Move xa-onset.js → src/beat/onset.js
- Move xa-beat.js → src/beat/tracker.js
- Move xa-mel.js → src/feature/mel.js
- Move xa-chroma.js → src/feature/chroma.js
- Move xa-spectral.js → src/feature/spectral.js
- Continue for all files...

**Deliverable:** Clean directory structure

---

### Hour 18: Create Index Files & Exports

**Task 18.1: Create src/index.js (20 min)**
```javascript
export * as core from './core/index.js'
export * as beat from './beat/index.js'
export * as feature from './feature/index.js'
// ... etc
```

**Task 18.2: Create module index files (40 min)**
- src/core/index.js
- src/beat/index.js
- src/feature/index.js
- src/segment/index.js
- src/effects/index.js
- src/util/index.js

**Deliverable:** Clean import structure

---

### Hour 19: TypeScript & Documentation

**Task 19.1: Create TypeScript definitions (40 min)**
```typescript
// src/types/index.d.ts
export interface ComplexNumber { real: number; imag: number }
export namespace core { ... }
export namespace beat { ... }
export namespace feature { ... }
```

**Task 19.2: Create README.md (20 min)**
- Installation instructions
- Quick start examples
- API overview
- Link to docs

**Deliverable:** TypeScript support and basic docs

---

## PHASE 6: FINALIZATION (1 hour)

### Hour 20: Package Configuration & Final Commit

**Task 20.1: Create package.json (20 min)**
```json
{
  "name": "pleco-audio",
  "version": "1.0.0-beta.1",
  "description": "Librosa for JavaScript",
  "main": "src/index.js",
  "type": "module",
  "exports": { ... },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

**Task 20.2: Create .npmignore, LICENSE (10 min)**

**Task 20.3: Final commit and push (20 min)**
```bash
git add -A
git commit -m "feat: Complete pleco-audio library v1.0.0-beta.1"
git push
```

**Task 20.4: Celebration! (10 min)**
- Review what was accomplished
- Document next steps
- Update STATUS.md

**Deliverable:** Production-ready npm package!

---

## EXECUTION CHECKLIST

### Phase 1: Critical Bug Fixes (3h)
- [ ] Hour 1: Fix STFT windowing bug
- [ ] Hour 2: Fix wrong defaults
- [ ] Hour 3: Commit & verify

### Phase 2: Complete Core (6h)
- [ ] Hour 4: Audit/fix FFT
- [ ] Hour 5: Complete Mel/MFCC
- [ ] Hour 6: Create utilities
- [ ] Hour 7: Complete spectral features
- [ ] Hour 8: Create pitch tracking
- [ ] Hour 9: Commit & document

### Phase 3: Advanced Features (4h)
- [ ] Hour 10: HPSS
- [ ] Hour 11: Enhanced beat tracking
- [ ] Hour 12: Segmentation
- [ ] Hour 13: Audio effects

### Phase 4: Testing (3h)
- [ ] Hour 14: Setup testing
- [ ] Hour 15: Core tests
- [ ] Hour 16: Feature tests

### Phase 5: Organization (3h)
- [ ] Hour 17: Organize structure
- [ ] Hour 18: Create indexes
- [ ] Hour 19: TypeScript & docs

### Phase 6: Finalization (1h)
- [ ] Hour 20: Package & commit

---

## COMMIT SCHEDULE

**Every 2-3 hours:**
- Hour 3: "fix: Critical bug fixes (STFT windowing, wrong defaults)"
- Hour 6: "feat: Complete core functions (Mel/MFCC, utilities)"
- Hour 9: "feat: Add spectral features and pitch tracking"
- Hour 13: "feat: Add advanced features (HPSS, segmentation, effects)"
- Hour 16: "test: Add comprehensive test suite"
- Hour 19: "docs: Add TypeScript definitions and documentation"
- Hour 20: "feat: Complete pleco-audio library v1.0.0-beta.1"

---

## SUCCESS METRICS

**After 20 Hours:**
- ✅ 0 critical bugs
- ✅ 60-80% Librosa parity (up from 10%)
- ✅ 90%+ test coverage
- ✅ Clean, organized structure
- ✅ TypeScript support
- ✅ Ready to publish to npm

---

## CURRENT STATUS: READY TO BEGIN

**Completed So Far:**
- ✅ Comprehensive audits
- ✅ Fixed xa-mel.js mel conversions (Slaney + HTK)
- ✅ Fixed xa-onset.js duplicate FFT
- ✅ Created planning documents

**Starting Next:**
- ⏳ Hour 1: Fix STFT windowing bug

---

**LET'S GO! 🚀**
