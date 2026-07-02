# Pleco Audio Library - Comprehensive Audit & Reorganization Plan

**Date:** 2025-11-15
**Purpose:** Transform messy audio analysis code into a professional npm library

---

## Executive Summary

### Current Status
- **50+ JavaScript files** scattered in `src/scripts/`
- **~10% Librosa parity** - missing 90% of features
- **No tests** - zero test coverage
- **Incomplete implementations** - many functions are stubs
- **Code duplication** - Multiple FFT implementations
- **Import chaos** - Inconsistent module dependencies

### Goals
1. **Organize** - Clean module structure like Librosa
2. **Test** - Verify everything works
3. **Fix** - Complete incomplete implementations
4. **Document** - Librosa-style docs
5. **Publish** - Professional npm package

---

## Code Audit Results

### ✅ HIGH QUALITY (Ready to use with tests)

**xa-fft.js** (373 lines)
- ✓ Clean FFT implementation (Cooley-Tukey)
- ✓ STFT/iSTFT with overlap-add
- ✓ Window functions (Hann, Hamming, Blackman)
- ✓ Good JSDoc comments
- ⚠️ **Needs:** Unit tests

**xa-mel.js** (405 lines)
- ✓ Mel filterbank implementation
- ✓ MFCC computation with DCT
- ✓ Delta features
- ✓ Power-to-dB conversion
- ⚠️ **Issue:** Imports from non-existent `librosa-fft.js` (line 127)
- ⚠️ **Needs:** Fix import, add tests

**xa-beat.js** (327 lines)
- ✓ Beat tracking with onset detection
- ✓ Autocorrelation tempo estimation
- ✓ Half-time/double-time correction
- ✓ Good error handling
- ⚠️ **Needs:** Tests

**xa-chroma.js** (418 lines)
- ✓ CQT-based chroma features
- ✓ STFT-based chroma features
- ✓ Frequency-to-chroma mapping
- ⚠️ **Issue:** Imports FFT from xa-onset.js (should use xa-fft.js)
- ⚠️ **Needs:** Fix import, add tests

---

### ⚠️ MEDIUM QUALITY (Has bugs/incomplete parts)

**xa-onset.js** (250 lines)
- ✓ Spectral flux onset detection
- ✓ Peak picking algorithm
- ✗ **DUPLICATE FFT CODE** - lines 10-68 duplicate xa-fft.js
- ⚠️ **Fix:** Remove duplicate FFT, import from xa-fft.js
- ⚠️ **Needs:** Refactor, then test

**xa-spectral.js** (1361 lines!)
- ✓ Many spectral features defined (centroid, bandwidth, contrast, rolloff, flatness)
- ✓ Chroma features (STFT, CQT, CENS)
- ✓ MFCC computation
- ✗ **INCOMPLETE HELPER FUNCTIONS:**
  - `fftFrequencies()` - calls undefined function
  - `chromaFilterBank()` - not implemented
  - `melFilterBank()` - not implemented
  - `cqt()`, `hybridCqt()` - not implemented
  - `sum()`, `subtract()`, `cumsum()`, etc. - incomplete
- ⚠️ **Fix:** Complete all helper functions
- ⚠️ **Needs:** Major refactoring, then tests

**xa-bpm-algorithm.js**
- ✓ Advanced tempo detection from "lb" project
- ✓ Fourier tempogram analysis
- ✓ UI-yielding for responsiveness
- ⚠️ **Needs:** Tests, verify algorithm correctness

---

### ❓ UNKNOWN QUALITY (Not audited yet)

Files needing review:
- xa-tempo.js
- xa-rhythm.js
- xa-dtw.js
- xa-recurrence.js
- xa-matching.js
- xa-downbeat.js
- xa-loop.js
- xa-precise-loop.js
- xa-filters.js
- xa-util.js
- xa-audioio.js
- xa-audio-features.js
- xa-audio-core.js
- xa-advanced.js
- xa-complete.js
- xa-features.js
- xa-processing.js
- xa-temporal.js
- xa-trim.js
- xa-split.js
- xa-remix.js
- xa-file.js
- xa-intervals.js
- xa-beat-tracker.js
- xa-bpm-detection.js
- xa-loop-detection.js

---

## Critical Issues to Fix

### 1. Import Errors
```javascript
// xa-mel.js:127 - BROKEN
const { stft, magnitude } = await import('./librosa-fft.js') // ❌ File doesn't exist

// FIX:
import { stft, magnitude } from './xa-fft.js' // ✓
```

### 2. Duplicate Code
```javascript
// xa-onset.js has DUPLICATE FFT implementation (lines 10-68)
// REMOVE and import from xa-fft.js instead
```

### 3. Incomplete Implementations in xa-spectral.js
```javascript
// Missing helper functions that will cause runtime errors:
- fftFrequencies() - undefined
- chromaFilterBank() - undefined
- melFilterBank() - undefined (exists in xa-mel.js!)
- cqt() / hybridCqt() - undefined
- Many array operations - incomplete
```

### 4. Inconsistent Module Organization
- No clear structure
- Everything in flat `src/scripts/` directory
- No separation of concerns

---

## Proposed Library Structure

```
pleco-audio/                    # New npm package name
├── package.json
├── README.md
├── LICENSE
├── tsconfig.json
├── .npmignore
│
├── src/                       # Source code
│   ├── index.js              # Main entry point
│   │
│   ├── core/                 # Core transforms (like librosa.core)
│   │   ├── index.js
│   │   ├── fft.js           # FFT/STFT (from xa-fft.js)
│   │   ├── spectrum.js      # Spectral operations
│   │   └── audio.js         # Audio I/O utilities
│   │
│   ├── beat/                 # Beat/tempo analysis (like librosa.beat)
│   │   ├── index.js
│   │   ├── tracker.js       # Beat tracking (from xa-beat.js)
│   │   ├── tempo.js         # Tempo estimation
│   │   └── onset.js         # Onset detection (from xa-onset.js)
│   │
│   ├── feature/              # Feature extraction (like librosa.feature)
│   │   ├── index.js
│   │   ├── spectral.js      # Spectral features (from xa-spectral.js)
│   │   ├── mel.js           # Mel features (from xa-mel.js)
│   │   ├── chroma.js        # Chroma features (from xa-chroma.js)
│   │   ├── mfcc.js          # MFCCs
│   │   └── rhythm.js        # Rhythm features
│   │
│   ├── segment/              # Segmentation (like librosa.segment)
│   │   ├── index.js
│   │   ├── recurrence.js    # Recurrence analysis
│   │   └── structure.js     # Structural analysis
│   │
│   ├── effects/              # Audio effects (like librosa.effects)
│   │   ├── index.js
│   │   ├── split.js         # Audio splitting
│   │   ├── trim.js          # Trimming
│   │   └── remix.js         # Remixing
│   │
│   ├── util/                 # Utilities (like librosa.util)
│   │   ├── index.js
│   │   ├── utils.js         # General utilities
│   │   ├── normalize.js     # Normalization functions
│   │   └── convert.js       # Unit conversions
│   │
│   └── types/                # TypeScript definitions
│       └── index.d.ts
│
├── test/                      # Test suite
│   ├── core/
│   │   ├── fft.test.js
│   │   └── spectrum.test.js
│   ├── beat/
│   │   ├── tracker.test.js
│   │   └── onset.test.js
│   ├── feature/
│   │   ├── spectral.test.js
│   │   ├── mel.test.js
│   │   └── chroma.test.js
│   └── fixtures/             # Test audio files
│       └── sample.wav
│
├── examples/                  # Usage examples
│   ├── basic-usage.js
│   ├── bpm-detection.js
│   ├── chroma-analysis.js
│   └── mfcc-extraction.js
│
└── docs/                      # Documentation
    ├── api/                  # API docs (like Librosa)
    │   ├── core.md
    │   ├── beat.md
    │   ├── feature.md
    │   └── util.md
    └── examples/             # Example docs
        └── quick-start.md
```

---

## Implementation Plan

### Phase 1: FIX & ORGANIZE (Week 1-2)

**Step 1: Fix Critical Bugs**
- [ ] Fix xa-mel.js import (line 127)
- [ ] Remove duplicate FFT from xa-onset.js
- [ ] Fix xa-chroma.js to import from xa-fft.js
- [ ] Complete missing helper functions in xa-spectral.js

**Step 2: Create New Directory Structure**
- [ ] Create new `pleco-audio/` package directory
- [ ] Create `src/core/`, `src/beat/`, `src/feature/`, etc.
- [ ] Create `test/` directory structure
- [ ] Create `examples/` and `docs/` directories

**Step 3: Reorganize Files**
- [ ] Move xa-fft.js → src/core/fft.js
- [ ] Move xa-onset.js → src/beat/onset.js (after fixing)
- [ ] Move xa-beat.js → src/beat/tracker.js
- [ ] Move xa-mel.js → src/feature/mel.js (after fixing)
- [ ] Move xa-chroma.js → src/feature/chroma.js (after fixing)
- [ ] Move xa-spectral.js → src/feature/spectral.js (after fixing)
- [ ] Continue for all remaining files...

**Step 4: Create Index Files**
- [ ] src/index.js - Main library export
- [ ] src/core/index.js
- [ ] src/beat/index.js
- [ ] src/feature/index.js
- [ ] src/util/index.js

---

### Phase 2: TEST EVERYTHING (Week 2-3)

**Step 1: Set Up Testing Framework**
- [ ] Install Jest or Vitest
- [ ] Create test configuration
- [ ] Set up test fixtures (sample audio files)

**Step 2: Write Core Tests**
- [ ] test/core/fft.test.js
  - FFT correctness
  - STFT/iSTFT round-trip
  - Window functions
- [ ] test/core/spectrum.test.js

**Step 3: Write Beat Tests**
- [ ] test/beat/onset.test.js
  - Onset detection accuracy
  - Peak picking
- [ ] test/beat/tracker.test.js
  - Beat tracking accuracy
  - Tempo estimation

**Step 4: Write Feature Tests**
- [ ] test/feature/mel.test.js
  - Mel filterbank correctness
  - MFCC computation
- [ ] test/feature/chroma.test.js
  - Chroma extraction
  - CQT correctness
- [ ] test/feature/spectral.test.js
  - All spectral features

**Step 5: Integration Tests**
- [ ] End-to-end BPM detection
- [ ] Full MFCC pipeline
- [ ] Complete chroma analysis

---

### Phase 3: ADD MISSING FEATURES (Week 3-5)

**Priority Tier 1 (Critical):**
- [ ] Unit conversion functions (hz_to_mel, mel_to_hz, etc.)
- [ ] Complete spectral features (bandwidth, contrast, flatness)
- [ ] Proper CQT implementation
- [ ] Pitch tracking (basic)

**Priority Tier 2 (Important):**
- [ ] Full chroma feature variants
- [ ] Enhanced beat tracking
- [ ] Segmentation functions
- [ ] More audio effects

---

### Phase 4: TYPESCRIPT & DOCUMENTATION (Week 5-6)

**Step 1: TypeScript Definitions**
- [ ] src/types/index.d.ts - Complete type definitions
- [ ] Type definitions for all public APIs
- [ ] JSDoc comments with @type annotations

**Step 2: API Documentation**
- [ ] docs/api/core.md - Core module docs
- [ ] docs/api/beat.md - Beat module docs
- [ ] docs/api/feature.md - Feature module docs
- [ ] Include examples for every function

**Step 3: Examples**
- [ ] examples/basic-usage.js
- [ ] examples/bpm-detection.js
- [ ] examples/chroma-analysis.js
- [ ] examples/mfcc-extraction.js

---

### Phase 5: NPM PACKAGE SETUP (Week 6)

**Step 1: Package Configuration**
- [ ] package.json with proper metadata
- [ ] Set main entry point
- [ ] Configure exports for tree-shaking
- [ ] Add build scripts

**Step 2: Bundle Configuration**
- [ ] Set up Rollup/esbuild for bundling
- [ ] Create ESM and CommonJS builds
- [ ] Minified production build
- [ ] Source maps

**Step 3: Publishing Prep**
- [ ] README.md with installation/usage
- [ ] LICENSE file
- [ ] .npmignore
- [ ] Version 1.0.0-beta.1

---

## Success Metrics

### Code Quality
- ✅ 90%+ test coverage
- ✅ Zero linting errors
- ✅ All imports resolved correctly
- ✅ No duplicate code

### Functionality
- ✅ All core Librosa features implemented
- ✅ Additional DJ/remix features beyond Librosa
- ✅ Performance benchmarks documented

### Documentation
- ✅ API docs for every public function
- ✅ Working examples for common use cases
- ✅ TypeScript definitions for all APIs

### Publishing
- ✅ Published to npm
- ✅ Proper semantic versioning
- ✅ CI/CD pipeline set up

---

## Next Steps

1. **Start Phase 1** - Fix critical bugs and reorganize
2. **Create reorganization script** - Automate file moves
3. **Set up testing** - Get Jest/Vitest running
4. **Begin systematic testing** - Core module first

---

**Status:** READY TO BEGIN
**Estimated Total Time:** 6 weeks
**Priority:** HIGH - Code needs organization before adding features
