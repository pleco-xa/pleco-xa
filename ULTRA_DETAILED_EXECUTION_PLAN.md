# ULTRA-DETAILED EXECUTION PLAN
## Pleco Audio Library Reorganization - File-by-File Breakdown

**Created:** 2025-11-15
**Estimated Time:** 24-30 continuous hours
**Status:** READY TO EXECUTE

---

## PHASE 1: FIX CRITICAL BUGS (2-3 hours)

### Task 1.1: Fix xa-mel.js ✅ COMPLETED
**File:** `src/scripts/xa-mel.js`
**Issue:** Line 127 imports from non-existent `./librosa-fft.js`
**Fix Applied:**
- ✅ Added import at line 6: `import { stft, magnitude } from './xa-fft.js'`
- ✅ Removed `async` from `melspectrogram` function
- ✅ Removed dynamic import line 127

### Task 1.2: Fix xa-onset.js ✅ COMPLETED
**File:** `src/scripts/xa-onset.js`
**Issue:** Duplicate FFT implementation (lines 10-68)
**Fix Applied:**
- ✅ Removed duplicate FFT code (59 lines)
- ✅ Added import: `import { fft as fftTransform, hann_window } from './xa-fft.js'`
- ✅ Created wrapper function to convert format
- ✅ Replaced manual Hann window with `hann_window()` function

### Task 1.3: Fix xa-chroma.js (IN PROGRESS)
**File:** `src/scripts/xa-chroma.js`
**Issue:** Line 6 imports FFT from xa-onset.js (wrong source)
**Steps:**
1. Read current import statement (line 6)
2. Replace `import { fft } from './xa-onset.js'` → `import { fft } from './xa-fft.js'`
3. Verify all FFT usage is compatible
4. Test that chroma functions still work

**Expected Changes:**
```javascript
// BEFORE:
import { fft } from './xa-onset.js'

// AFTER:
import { fft as fftTransform } from './xa-fft.js'

// Add wrapper if needed for format conversion
function fft(signal) {
  const complexResult = fftTransform(signal)
  // Convert {real, imag} format to flat array if needed
  const flatResult = new Float32Array(complexResult.length * 2)
  for (let i = 0; i < complexResult.length; i++) {
    flatResult[i * 2] = complexResult[i].real
    flatResult[i * 2 + 1] = complexResult[i].imag
  }
  return flatResult
}
```

---

### Task 1.4: Complete xa-spectral.js Missing Functions
**File:** `src/scripts/xa-spectral.js` (1361 lines)
**Issue:** Many helper functions are incomplete or undefined

#### Missing Function 1: `fftFrequencies()`
**Location:** Called but not defined
**Fix:** Import from xa-fft.js where it's defined as `fft_frequencies()`
```javascript
import { fft_frequencies } from './xa-fft.js'

// Then replace all calls:
fftFrequencies({ sr, n_fft }) → fft_frequencies(sr, n_fft)
```

#### Missing Function 2: `melFilterBank()`
**Location:** Called but not defined
**Fix:** Import from xa-mel.js where it's defined as `mel_filterbank()`
```javascript
import { mel_filterbank } from './xa-mel.js'

// Then replace all calls:
melFilterBank({ sr, n_fft, ...kwargs }) → mel_filterbank(sr, n_fft, ...)
```

#### Missing Function 3: `chromaFilterBank()`
**Location:** Called on line 758
**Status:** Not implemented anywhere
**Fix:** Implement it or import from xa-chroma.js if suitable alternative exists

#### Missing Functions 4-20: Array Operation Helpers
**Functions:** `sum()`, `subtract()`, `cumsum()`, `expandDims()`, `greaterEqual()`, `greaterThan()`, `where()`, `nanmin()`, `getLastAlongAxis()`, `extractSubBand()`, `sortAlongAxis()`, `transpose()`, `addInPlace()`, `getWindow()`, `convolve1d()`, `linspace()`, `log10()`, `max()`

**Fix Strategy:**
- Create `xa-spectral-utils.js` with all missing helper functions
- Import into xa-spectral.js
- Implement each function properly

**Helper Functions to Implement:**
```javascript
// xa-spectral-utils.js

export function sum(arr, options = {}) {
  const { axis = -2, keepdims = false } = options
  if (!Array.isArray(arr[0])) {
    // 1D
    const s = arr.reduce((a, b) => a + b, 0)
    return keepdims ? [s] : s
  }
  // 2D - sum along axis
  if (axis === -2) {
    const nCols = arr[0].length
    const result = new Array(nCols).fill(0)
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < nCols; j++) {
        result[j] += arr[i][j]
      }
    }
    return keepdims ? [result] : result
  }
  // Handle other axes...
}

export function subtract(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'number') {
    return Array.isArray(b[0])
      ? b.map(row => row.map(v => a - v))
      : b.map(v => a - v)
  }
  if (typeof b === 'number') {
    return Array.isArray(a[0])
      ? a.map(row => row.map(v => v - b))
      : a.map(v => v - b)
  }
  // Both arrays
  if (Array.isArray(a[0]) && Array.isArray(b[0])) {
    return a.map((row, i) => row.map((v, j) => v - b[i][j]))
  }
  return a.map((v, i) => v - b[i])
}

export function cumsum(arr, options = {}) {
  const { axis = -2 } = options
  if (!Array.isArray(arr[0])) {
    // 1D
    const result = []
    let sum = 0
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i]
      result.push(sum)
    }
    return result
  }
  // 2D
  if (axis === -2) {
    const result = arr.map(row => [...row])
    for (let j = 0; j < arr[0].length; j++) {
      for (let i = 1; i < arr.length; i++) {
        result[i][j] = result[i-1][j] + arr[i][j]
      }
    }
    return result
  }
  return arr
}

export function expandDims(arr, axis) {
  if (axis === -2) {
    return [arr]
  }
  return arr
}

export function greaterEqual(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a >= b
  if (typeof b === 'number') {
    return Array.isArray(a[0])
      ? a.map(row => row.map(v => v >= b))
      : a.map(v => v >= b)
  }
  // Handle array comparisons...
  return a.map((row, i) => {
    if (Array.isArray(row)) {
      return row.map((v, j) => {
        const bVal = Array.isArray(b[0]) ? b[i][j] : b[j]
        return v >= bVal
      })
    }
    return row >= b[i]
  })
}

export function greaterThan(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a > b
  if (typeof b === 'number') {
    return Array.isArray(a[0])
      ? a.map(row => row.map(v => v > b))
      : a.map(v => v > b)
  }
  return a.map((row, i) => {
    if (Array.isArray(row)) {
      return row.map((v, j) => {
        const bVal = Array.isArray(b[0]) ? b[i][j] : b[j]
        return v > bVal
      })
    }
    return row > b[i]
  })
}

export function where(mask, a, b) {
  if (!Array.isArray(mask[0])) {
    return mask.map((m, i) => m ? (typeof a === 'number' ? a : a[i]) : b)
  }
  return mask.map((row, i) =>
    row.map((m, j) => m ? (typeof a === 'number' ? a : a[i][j]) : b)
  )
}

export function nanmin(arr, options = {}) {
  const { axis = -2, keepdims = false } = options
  const flat = arr.flat(Infinity).filter(v => !isNaN(v))
  if (flat.length === 0) return NaN
  const min = Math.min(...flat)
  return keepdims ? [[min]] : min
}

export function getLastAlongAxis(arr, axis) {
  if (axis === -2 && Array.isArray(arr[0])) {
    return arr[arr.length - 1]
  }
  return arr
}

export function extractSubBand(spec, indices) {
  return indices.map(i => spec[i])
}

export function sortAlongAxis(arr, axis) {
  if (axis === -2) {
    return arr.map(row => [...row].sort((a, b) => a - b))
  }
  return arr
}

export function transpose(arr) {
  if (!Array.isArray(arr[0])) return arr
  const rows = arr.length
  const cols = arr[0].length
  const result = Array(cols).fill(null).map(() => Array(rows))
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = arr[i][j]
    }
  }
  return result
}

export function addInPlace(target, source) {
  for (let i = 0; i < target.length; i++) {
    if (Array.isArray(target[i])) {
      for (let j = 0; j < target[i].length; j++) {
        target[i][j] += Array.isArray(source[i]) ? source[i][j] : source
      }
    } else {
      target[i] += Array.isArray(source) ? source[i] : source
    }
  }
  return target
}

export function getWindow(type, length) {
  const window = new Float32Array(length)
  switch (type) {
    case 'hann':
      for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)))
      }
      break
    default:
      window.fill(1)
  }
  return window
}

export function convolve1d(arr, kernel, options = {}) {
  const { axis = -1, mode = 'constant' } = options
  // Simplified 1D convolution
  if (!Array.isArray(arr[0])) {
    // 1D array
    const result = new Array(arr.length)
    const kernelSize = kernel.length
    const half = Math.floor(kernelSize / 2)
    for (let i = 0; i < arr.length; i++) {
      let sum = 0
      for (let j = 0; j < kernelSize; j++) {
        const idx = i + j - half
        const val = (idx >= 0 && idx < arr.length) ? arr[idx] : 0
        sum += val * kernel[j]
      }
      result[i] = sum
    }
    return result
  }
  // 2D array - convolve each row
  return arr.map(row => convolve1d(row, kernel, { mode }))
}

export function linspace(start, stop, num, endpoint = true) {
  const div = endpoint ? (num - 1) : num
  const step = (stop - start) / div
  return Array.from({ length: num }, (_, i) => start + step * i)
}

export function log10(x) {
  if (typeof x === 'number') return Math.log10(x)
  return x.map(row => row.map ? row.map(Math.log10) : Math.log10(row))
}

export function max(arr) {
  const flat = arr.flat(Infinity)
  return Math.max(...flat)
}
```

---

### Task 1.5: Audit Remaining Files
**Files to Check:** (29 files total)

For each file, check:
1. Are all imports resolved?
2. Are there duplicate functions?
3. Are there incomplete implementations?
4. Does it follow consistent naming (camelCase vs snake_case)?

**File-by-File Audit List:**

1. ✅ **xa-fft.js** - GOOD (no issues found)
2. ✅ **xa-mel.js** - FIXED
3. ✅ **xa-onset.js** - FIXED
4. ✅ **xa-beat.js** - GOOD (imports from xa-onset.js which is OK)
5. ⚠️ **xa-chroma.js** - IN PROGRESS (fix import)
6. ⚠️ **xa-spectral.js** - NEEDS WORK (missing helpers)
7. ❓ **xa-tempo.js** - TO AUDIT
8. ❓ **xa-rhythm.js** - TO AUDIT
9. ❓ **xa-dtw.js** - TO AUDIT
10. ❓ **xa-recurrence.js** - TO AUDIT
11. ❓ **xa-matching.js** - TO AUDIT
12. ❓ **xa-downbeat.js** - TO AUDIT
13. ❓ **xa-loop.js** - TO AUDIT
14. ❓ **xa-precise-loop.js** - TO AUDIT
15. ❓ **xa-filters.js** - TO AUDIT
16. ❓ **xa-util.js** - TO AUDIT
17. ❓ **xa-audioio.js** - TO AUDIT
18. ❓ **xa-audio-features.js** - TO AUDIT
19. ❓ **xa-audio-core.js** - TO AUDIT
20. ❓ **xa-advanced.js** - TO AUDIT
21. ❓ **xa-complete.js** - TO AUDIT
22. ❓ **xa-features.js** - TO AUDIT
23. ❓ **xa-processing.js** - TO AUDIT
24. ❓ **xa-temporal.js** - TO AUDIT
25. ❓ **xa-trim.js** - TO AUDIT
26. ❓ **xa-split.js** - TO AUDIT
27. ❓ **xa-remix.js** - TO AUDIT
28. ❓ **xa-file.js** - TO AUDIT
29. ❓ **xa-intervals.js** - TO AUDIT
30. ❓ **xa-beat-tracker.js** - TO AUDIT
31. ❓ **xa-bpm-detection.js** - TO AUDIT
32. ❓ **xa-bpm-algorithm.js** - TO AUDIT
33. ❓ **xa-loop-detection.js** - TO AUDIT

---

## PHASE 2: CREATE NEW DIRECTORY STRUCTURE (1 hour)

### Task 2.1: Create pleco-audio Package Root
```bash
mkdir -p pleco-audio
cd pleco-audio
mkdir -p src/{core,beat,feature,segment,effects,util,types}
mkdir -p test/{core,beat,feature,segment,effects,util,fixtures}
mkdir -p examples
mkdir -p docs/api
```

### Task 2.2: Create Directory Structure
**Full tree:**
```
pleco-audio/
├── package.json
├── README.md
├── LICENSE
├── tsconfig.json
├── jest.config.js
├── .npmignore
├── .gitignore
│
├── src/
│   ├── index.js
│   ├── core/
│   │   ├── index.js
│   │   ├── fft.js
│   │   ├── spectrum.js
│   │   └── audio.js
│   ├── beat/
│   │   ├── index.js
│   │   ├── tracker.js
│   │   ├── onset.js
│   │   └── tempo.js
│   ├── feature/
│   │   ├── index.js
│   │   ├── spectral.js
│   │   ├── spectral-utils.js
│   │   ├── mel.js
│   │   ├── chroma.js
│   │   ├── mfcc.js
│   │   └── rhythm.js
│   ├── segment/
│   │   ├── index.js
│   │   ├── recurrence.js
│   │   ├── dtw.js
│   │   └── structure.js
│   ├── effects/
│   │   ├── index.js
│   │   ├── split.js
│   │   ├── trim.js
│   │   └── remix.js
│   ├── util/
│   │   ├── index.js
│   │   ├── utils.js
│   │   ├── normalize.js
│   │   └── convert.js
│   └── types/
│       └── index.d.ts
│
├── test/
│   ├── core/
│   ├── beat/
│   ├── feature/
│   └── fixtures/
│
├── examples/
│   ├── basic-usage.js
│   ├── bpm-detection.js
│   └── chroma-analysis.js
│
└── docs/
    └── api/
```

---

## PHASE 3: REORGANIZE FILES (3-4 hours)

### Module Mapping Plan

#### CORE Module (src/core/)

**File: src/core/fft.js**
- Source: `src/scripts/xa-fft.js`
- Status: Copy as-is (already clean)
- Exports: `fft`, `ifft`, `stft`, `istft`, `magnitude`, `phase`, `power`, `polar_to_complex`, `fft_frequencies`, `spectrogram`, `get_window`, `hann_window`, `hamming_window`, `blackman_window`

**File: src/core/spectrum.js**
- Source: Create new - combine spectrum operations
- Functions: Spectral manipulation utilities

**File: src/core/audio.js**
- Source: `src/scripts/xa-audioio.js`, `src/scripts/xa-audio-core.js`, `src/scripts/xa-file.js`
- Functions: Audio I/O, loading, decoding

---

#### BEAT Module (src/beat/)

**File: src/beat/onset.js**
- Source: `src/scripts/xa-onset.js` (FIXED)
- Exports: `onsetDetect`, `computeSTFT`, `computeSpectralFlux`, `onset_strength`, `pickPeaks`, `onsetsToBeats`

**File: src/beat/tracker.js**
- Source: `src/scripts/xa-beat.js`
- Exports: `beatTrack`, `beat_track`, `estimateTempo`, `tempo`, `trackBeats`, `extractTempo`, `fastBPMDetect`

**File: src/beat/tempo.js**
- Source: `src/scripts/xa-tempo.js`, `src/scripts/xa-bpm-algorithm.js`, `src/scripts/xa-bpm-detection.js`
- Merge all tempo detection into single module
- Exports: All tempo-related functions

**Additional Beat Files:**
- `src/scripts/xa-beat-tracker.js` → Merge into `src/beat/tracker.js`
- `src/scripts/xa-downbeat.js` → `src/beat/downbeat.js` (new file)

---

#### FEATURE Module (src/feature/)

**File: src/feature/mel.js**
- Source: `src/scripts/xa-mel.js` (FIXED)
- Exports: `mel_filterbank`, `hz_to_mel`, `mel_to_hz`, `linspace`, `melspectrogram`, `mfcc`, `dct`, `idct`, `delta_features`, `lifter_mfcc`, `power_to_db`, `mel_frequencies`, `extract_mel_features`

**File: src/feature/chroma.js**
- Source: `src/scripts/xa-chroma.js` (TO BE FIXED)
- Exports: `chroma_cqt`, `chroma_stft`, `constant_q_transform`, `mapToCQTBins`, `cqt_to_chroma`, `stft_to_chroma`, `freq_to_chroma`, `spectrum_to_chroma`, `enhance_chroma`, `chroma_energy`, `NOTE_NAMES`, `chroma_to_note`

**File: src/feature/spectral.js**
- Source: `src/scripts/xa-spectral.js` (TO BE FIXED)
- Needs: `xa-spectral-utils.js` created
- Exports: `spectralCentroid`, `spectralBandwidth`, `spectralContrast`, `spectralRolloff`, `spectralFlatness`, `polyFeatures`, `rms`, `zeroCrossingRate`, `chromaStft`, `chromaCqt`, `chromaCens`, `mfcc`, `melspectrogram`, `tonnetz`

**File: src/feature/spectral-utils.js**
- Source: CREATE NEW
- All helper functions from analysis above

**File: src/feature/rhythm.js**
- Source: `src/scripts/xa-rhythm.js`
- Exports: Rhythm analysis functions

**File: src/feature/mfcc.js**
- Source: Extract MFCC-specific functions from mel.js and spectral.js
- Exports: `mfcc`, `delta`, `delta2`

---

#### SEGMENT Module (src/segment/)

**File: src/segment/recurrence.js**
- Source: `src/scripts/xa-recurrence.js`
- Exports: Recurrence matrix functions

**File: src/segment/dtw.js**
- Source: `src/scripts/xa-dtw.js`
- Exports: DTW algorithm and helpers

**File: src/segment/structure.js**
- Source: `src/scripts/xa-matching.js`, potentially others
- Exports: Structure analysis functions

---

#### EFFECTS Module (src/effects/)

**File: src/effects/split.js**
- Source: `src/scripts/xa-split.js`
- Exports: Audio splitting functions

**File: src/effects/trim.js**
- Source: `src/scripts/xa-trim.js`
- Exports: Trimming functions

**File: src/effects/remix.js**
- Source: `src/scripts/xa-remix.js`
- Exports: Remixing functions

---

#### UTIL Module (src/util/)

**File: src/util/utils.js**
- Source: `src/scripts/xa-util.js`
- Exports: General utilities

**File: src/util/normalize.js**
- Source: Extract normalization functions from various files
- Exports: `normalize`, `standardize`, etc.

**File: src/util/convert.js**
- Source: Create new - unit conversions
- Exports: `hz_to_mel`, `mel_to_hz`, `hz_to_midi`, `midi_to_hz`, `frames_to_time`, `time_to_frames`, etc.

---

## PHASE 4: CREATE INDEX FILES (1 hour)

### Main Index: src/index.js
```javascript
/**
 * Pleco Audio - JavaScript Audio Analysis Library
 * Librosa-equivalent for JavaScript with Web Audio API support
 */

// Re-export all modules
export * as core from './core/index.js'
export * as beat from './beat/index.js'
export * as feature from './feature/index.js'
export * as segment from './segment/index.js'
export * as effects from './effects/index.js'
export * as util from './util/index.js'

// Convenience exports for most common functions
export {
  fft,
  stft,
  istft,
  magnitude,
  phase,
  spectrogram
} from './core/fft.js'

export {
  beatTrack,
  onsetDetect,
  estimateTempo
} from './beat/index.js'

export {
  melspectrogram,
  mfcc,
  chroma_cqt,
  chroma_stft,
  spectralCentroid
} from './feature/index.js'
```

### Core Index: src/core/index.js
```javascript
export * from './fft.js'
export * from './spectrum.js'
export * from './audio.js'
```

### Beat Index: src/beat/index.js
```javascript
export * from './onset.js'
export * from './tracker.js'
export * from './tempo.js'
```

### Feature Index: src/feature/index.js
```javascript
export * from './spectral.js'
export * from './mel.js'
export * from './chroma.js'
export * from './mfcc.js'
export * from './rhythm.js'
```

### Segment Index: src/segment/index.js
```javascript
export * from './recurrence.js'
export * from './dtw.js'
export * from './structure.js'
```

### Effects Index: src/effects/index.js
```javascript
export * from './split.js'
export * from './trim.js'
export * from './remix.js'
```

### Util Index: src/util/index.js
```javascript
export * from './utils.js'
export * from './normalize.js'
export * from './convert.js'
```

---

## PHASE 5: TESTING (8-10 hours)

### Task 5.1: Set Up Jest
**File: jest.config.js**
```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/test/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90
    }
  }
}
```

**File: package.json (test scripts)**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

### Task 5.2: Create Test Fixtures
**Files needed:**
- `test/fixtures/sine-440hz.wav` - Pure 440Hz sine wave (1 second)
- `test/fixtures/chirp.wav` - Linear chirp 20Hz-20kHz
- `test/fixtures/drumloop.wav` - Simple drum loop at 120 BPM
- `test/fixtures/music-sample.wav` - Short music clip

**Generate with Node.js:**
```javascript
// test/fixtures/generate.js
import fs from 'fs'

function generateSineWave(freq, duration, sampleRate = 44100) {
  const samples = duration * sampleRate
  const buffer = new Float32Array(samples)

  for (let i = 0; i < samples; i++) {
    buffer[i] = Math.sin(2 * Math.PI * freq * i / sampleRate)
  }

  return buffer
}

const sine440 = generateSineWave(440, 1.0)
// Write to WAV file...
```

### Task 5.3: Test Core Module

**File: test/core/fft.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import {
  fft,
  ifft,
  stft,
  istft,
  magnitude,
  phase,
  hann_window,
  fft_frequencies
} from '../../src/core/fft.js'

describe('FFT', () => {
  test('FFT of DC signal', () => {
    const signal = new Float32Array([1, 1, 1, 1])
    const result = fft(signal)

    expect(result[0].real).toBeCloseTo(4, 5)
    expect(result[0].imag).toBeCloseTo(0, 5)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].real).toBeCloseTo(0, 5)
      expect(result[i].imag).toBeCloseTo(0, 5)
    }
  })

  test('FFT power-of-2 length', () => {
    const signal = new Float32Array(1024).fill(0)
    signal[0] = 1
    const result = fft(signal)
    expect(result.length).toBe(1024)
  })

  test('FFT/IFFT round trip', () => {
    const signal = new Float32Array(128)
    for (let i = 0; i < 128; i++) {
      signal[i] = Math.random()
    }

    const fftResult = fft(signal)
    const ifftResult = ifft(fftResult)

    for (let i = 0; i < signal.length; i++) {
      expect(ifftResult[i].real).toBeCloseTo(signal[i], 4)
    }
  })
})

describe('STFT', () => {
  test('STFT basic functionality', () => {
    const signal = new Float32Array(8192)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 440 * i / 22050)
    }

    const result = stft(signal, 2048, 512)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].length).toBe(1025) // n_fft/2 + 1
  })

  test('STFT/ISTFT round trip', () => {
    const signal = new Float32Array(4096)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 100 * i / 22050)
    }

    const stftResult = stft(signal, 2048, 512)
    const reconstructed = istft(stftResult, 512)

    // Check middle section (avoid boundary effects)
    for (let i = 1024; i < 3072; i++) {
      expect(reconstructed[i]).toBeCloseTo(signal[i], 2)
    }
  })
})

describe('Window functions', () => {
  test('Hann window properties', () => {
    const window = hann_window(256)

    expect(window[0]).toBeCloseTo(0, 5)
    expect(window[255]).toBeCloseTo(0, 5)
    expect(window[128]).toBeCloseTo(1, 1)
  })

  test('Hann window symmetry', () => {
    const window = hann_window(512)

    for (let i = 0; i < 256; i++) {
      expect(window[i]).toBeCloseTo(window[511 - i], 5)
    }
  })
})

describe('FFT utilities', () => {
  test('FFT frequencies', () => {
    const freqs = fft_frequencies(22050, 2048)

    expect(freqs[0]).toBe(0)
    expect(freqs[freqs.length - 1]).toBeCloseTo(22050 / 2, 1)
  })

  test('Magnitude computation', () => {
    const spectrum = [
      { real: 3, imag: 4 },
      { real: 0, imag: 0 },
      { real: 5, imag: 12 }
    ]

    const mag = magnitude(spectrum)
    expect(mag[0]).toBeCloseTo(5, 5)
    expect(mag[1]).toBeCloseTo(0, 5)
    expect(mag[2]).toBeCloseTo(13, 5)
  })

  test('Phase computation', () => {
    const spectrum = [
      { real: 1, imag: 0 },
      { real: 0, imag: 1 },
      { real: 1, imag: 1 }
    ]

    const ph = phase(spectrum)
    expect(ph[0]).toBeCloseTo(0, 5)
    expect(ph[1]).toBeCloseTo(Math.PI / 2, 5)
    expect(ph[2]).toBeCloseTo(Math.PI / 4, 5)
  })
})
```

### Task 5.4: Test Beat Module

**File: test/beat/onset.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import {
  onsetDetect,
  computeSTFT,
  computeSpectralFlux,
  pickPeaks
} from '../../src/beat/onset.js'

describe('Onset Detection', () => {
  test('Detect onsets in impulse train', () => {
    // Create signal with onsets at known positions
    const signal = new Float32Array(22050) // 1 second at 22050 Hz
    const onsetPositions = [4410, 8820, 13230, 17640] // Every 0.2 seconds

    for (const pos of onsetPositions) {
      signal[pos] = 1.0
    }

    const result = onsetDetect(signal, 22050)

    expect(result.onsetTimes.length).toBeGreaterThan(0)
    expect(result.onsetTimes.length).toBeLessThanOrEqual(onsetPositions.length + 2)
  })

  test('STFT shape', () => {
    const signal = new Float32Array(8192)
    const stft = computeSTFT(signal, 2048, 512)

    expect(stft.length).toBeGreaterThan(0)
    expect(stft[0].length).toBe(2048 * 2) // Complex: [real, imag, ...]
  })

  test('Spectral flux increases with onset', () => {
    const signal1 = new Float32Array(2048).fill(0)
    const signal2 = new Float32Array(2048)
    for (let i = 0; i < 2048; i++) {
      signal2[i] = Math.sin(2 * Math.PI * 440 * i / 22050)
    }

    const stft1 = computeSTFT(signal1, 2048, 2048)
    const stft2 = computeSTFT(signal2, 2048, 2048)
    const stft = [stft1[0], stft2[0]]

    const flux = computeSpectralFlux(stft)
    expect(flux[1]).toBeGreaterThan(0)
  })
})

describe('Peak Picking', () => {
  test('Find peaks in simple signal', () => {
    const signal = new Float32Array([0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 1.5, 0])
    const peaks = pickPeaks(signal, { delta: 0.1, wait: 1 })

    expect(peaks).toContain(2)
    expect(peaks).toContain(6)
    expect(peaks).toContain(10)
  })

  test('Respect wait parameter', () => {
    const signal = new Float32Array(100)
    signal[10] = 1
    signal[12] = 0.9 // Too close
    signal[30] = 1.1

    const peaks = pickPeaks(signal, { delta: 0.1, wait: 10 })

    expect(peaks).toContain(10)
    expect(peaks).not.toContain(12)
    expect(peaks).toContain(30)
  })
})
```

**File: test/beat/tracker.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import {
  beatTrack,
  estimateTempo,
  trackBeats,
  extractTempo,
  fastBPMDetect
} from '../../src/beat/tracker.js'

describe('Beat Tracking', () => {
  test('Estimate tempo from regular beats', () => {
    // Create 120 BPM beat pattern (0.5 seconds between beats)
    const signal = new Float32Array(44100 * 3) // 3 seconds
    const beatInterval = 22050 // 0.5 seconds at 44100 Hz

    for (let i = 0; i < 6; i++) {
      const pos = i * beatInterval
      for (let j = 0; j < 100; j++) {
        signal[pos + j] = 1.0
      }
    }

    const result = beatTrack(signal, 44100)

    expect(result.tempo).toBeGreaterThan(100)
    expect(result.tempo).toBeLessThan(140)
    expect(result.beats.length).toBeGreaterThan(0)
  })

  test('Fast BPM detect', () => {
    const signal = new Float32Array(44100) // 1 second

    // Add some onsets
    for (let i = 0; i < 4; i++) {
      const pos = i * 11025 // Every 0.25 seconds
      signal[pos] = 1.0
    }

    const result = fastBPMDetect(signal, 44100)

    expect(result.bpm).toBeGreaterThan(0)
    expect(result.bpm).toBeLessThan(300)
  })
})

describe('Tempo Estimation', () => {
  test('Extract tempo from beat times', () => {
    const beatTimes = [0, 0.5, 1.0, 1.5, 2.0, 2.5] // 120 BPM
    const result = extractTempo(beatTimes)

    expect(result.bpm).toBeCloseTo(120, 1)
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})
```

### Task 5.5: Test Feature Module

**File: test/feature/mel.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import {
  mel_filterbank,
  hz_to_mel,
  mel_to_hz,
  melspectrogram,
  mfcc,
  dct
} from '../../src/feature/mel.js'

describe('Mel Scale Conversions', () => {
  test('Hz to Mel conversion', () => {
    expect(hz_to_mel(0)).toBe(0)
    expect(hz_to_mel(1000)).toBeGreaterThan(900)
  })

  test('Mel to Hz conversion', () => {
    expect(mel_to_hz(0)).toBe(0)
    expect(mel_to_hz(1000)).toBeGreaterThan(900)
  })

  test('Hz/Mel round trip', () => {
    const frequencies = [100, 500, 1000, 5000, 10000]
    for (const freq of frequencies) {
      const mel = hz_to_mel(freq)
      const back = mel_to_hz(mel)
      expect(back).toBeCloseTo(freq, 1)
    }
  })
})

describe('Mel Filterbank', () => {
  test('Create filterbank', () => {
    const fb = mel_filterbank(22050, 2048, 40)

    expect(fb.length).toBe(40)
    expect(fb[0].length).toBe(1025) // n_fft/2 + 1
  })

  test('Filterbank normalization', () => {
    const fb = mel_filterbank(22050, 2048, 40, 0, null, true)

    for (const filter of fb) {
      const sum = filter.reduce((a, b) => a + b, 0)
      if (sum > 0) {
        expect(sum).toBeCloseTo(1.0, 3)
      }
    }
  })
})

describe('Mel Spectrogram', () => {
  test('Compute mel spectrogram', () => {
    const signal = new Float32Array(8192)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 440 * i / 22050)
    }

    const melspec = melspectrogram(signal, 22050, 2048, 512, 40)

    expect(melspec.length).toBe(40)
    expect(melspec[0].length).toBeGreaterThan(0)
  })
})

describe('MFCC', () => {
  test('Compute MFCCs', () => {
    const signal = new Float32Array(8192)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 440 * i / 22050)
    }

    const mfccResult = mfcc(signal, 22050, 13)

    expect(mfccResult.length).toBe(13)
    expect(mfccResult[0].length).toBeGreaterThan(0)
  })

  test('DCT correctness', () => {
    const signal = [1, 2, 3, 4]
    const dctResult = dct(signal)

    expect(dctResult.length).toBe(4)
    expect(dctResult[0]).toBeGreaterThan(0) // DC component
  })
})
```

**File: test/feature/chroma.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import {
  chroma_stft,
  chroma_cqt,
  freq_to_chroma,
  spectrum_to_chroma,
  chroma_to_note
} from '../../src/feature/chroma.js'

describe('Chroma Features', () => {
  test('STFT-based chroma', () => {
    // Create A4 (440 Hz) signal
    const signal = new Float32Array(22050) // 1 second
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 440 * i / 22050)
    }

    const chroma = chroma_stft(signal, 22050)

    expect(chroma.length).toBe(12)
    // A should be strong (chroma class 9)
    expect(chroma[9][0]).toBeGreaterThan(0)
  })

  test('Frequency to chroma mapping', () => {
    expect(freq_to_chroma(440)).toBe(9) // A4
    expect(freq_to_chroma(261.6)).toBe(0) // C4
    expect(freq_to_chroma(329.6)).toBe(4) // E4
  })

  test('Chroma to note name', () => {
    expect(chroma_to_note(0)).toBe('C')
    expect(chroma_to_note(4)).toBe('E')
    expect(chroma_to_note(9)).toBe('A')
  })
})
```

**File: test/feature/spectral.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import {
  spectralCentroid,
  spectralBandwidth,
  spectralRolloff,
  spectralFlatness,
  rms,
  zeroCrossingRate
} from '../../src/feature/spectral.js'

describe('Spectral Features', () => {
  test('Spectral centroid', () => {
    const signal = new Float32Array(4096)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 1000 * i / 22050)
    }

    const centroid = spectralCentroid({ y: signal, sr: 22050 })

    expect(centroid).toBeDefined()
    expect(centroid[0]).toBeGreaterThan(0)
  })

  test('RMS energy', () => {
    const signal = new Float32Array(1024).fill(0.5)
    const rmsResult = rms({ y: signal })

    expect(rmsResult[0]).toBeCloseTo(0.5, 2)
  })

  test('Zero crossing rate', () => {
    // High frequency = high ZCR
    const signal = new Float32Array(2048)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.sin(2 * Math.PI * 5000 * i / 22050)
    }

    const zcr = zeroCrossingRate(signal, { frame_length: 2048 })
    expect(zcr[0]).toBeGreaterThan(0)
  })
})
```

### Task 5.6: Integration Tests
**File: test/integration/bpm-detection.test.js**
```javascript
import { describe, test, expect } from '@jest/globals'
import { beatTrack } from '../../src/beat/tracker.js'
import { onsetDetect } from '../../src/beat/onset.js'

describe('BPM Detection Integration', () => {
  test('End-to-end BPM detection', () => {
    // Create 120 BPM drum pattern
    const sampleRate = 44100
    const bpm = 120
    const duration = 4 // seconds
    const signal = new Float32Array(sampleRate * duration)

    const beatInterval = (60 / bpm) * sampleRate
    const numBeats = Math.floor(duration * bpm / 60)

    for (let i = 0; i < numBeats; i++) {
      const pos = Math.floor(i * beatInterval)
      for (let j = 0; j < 100; j++) {
        if (pos + j < signal.length) {
          signal[pos + j] = 1.0
        }
      }
    }

    const result = beatTrack(signal, sampleRate)

    expect(Math.abs(result.tempo - bpm)).toBeLessThan(5)
    expect(result.beats.length).toBeGreaterThan(0)
  })
})
```

---

## PHASE 6: TYPESCRIPT DEFINITIONS (2 hours)

**File: src/types/index.d.ts**
```typescript
// Core types
export interface ComplexNumber {
  real: number
  imag: number
}

export type AudioBuffer = Float32Array | number[]
export type ComplexArray = ComplexNumber[]
export type STFTMatrix = ComplexArray[]

// Core module
export namespace core {
  export function fft(signal: AudioBuffer): ComplexArray
  export function ifft(spectrum: ComplexArray): ComplexArray
  export function stft(
    y: AudioBuffer,
    n_fft?: number,
    hop_length?: number,
    window?: string,
    center?: boolean
  ): STFTMatrix
  export function istft(
    D: STFTMatrix,
    hop_length?: number,
    window?: string,
    center?: boolean
  ): AudioBuffer
  export function magnitude(spectrum: ComplexArray): Float32Array
  export function phase(spectrum: ComplexArray): Float32Array
  export function power(spectrum: ComplexArray): Float32Array
  export function spectrogram(
    y: AudioBuffer,
    n_fft?: number,
    hop_length?: number
  ): number[][]
  export function fft_frequencies(sr: number, n_fft: number): Float32Array
  export function hann_window(n: number): Float32Array
  export function hamming_window(n: number): Float32Array
  export function blackman_window(n: number): Float32Array
}

// Beat module
export namespace beat {
  export interface OnsetResult {
    onsetTimes: number[]
    onsetStrength: Float32Array
    onsetFrames: number[]
  }

  export interface BeatResult {
    tempo: number
    beats: number[]
    beatFrames: number[]
    onsetStrength: Float32Array
    confidence: number
  }

  export function onsetDetect(
    audioData: AudioBuffer,
    sampleRate: number,
    options?: {
      hopLength?: number
      frameLength?: number
      delta?: number
      wait?: number
    }
  ): OnsetResult

  export function beatTrack(
    audioData: AudioBuffer,
    sampleRate: number,
    options?: {
      hopLength?: number
      startBpm?: number
      tightness?: number
      units?: 'time' | 'frames'
    }
  ): BeatResult

  export function estimateTempo(
    onsetStrength: Float32Array,
    sampleRate: number,
    hopLength?: number,
    startBpm?: number
  ): {
    bpm: number
    confidence: number
    allCandidates: Array<{ bpm: number; strength: number }>
  }
}

// Feature module
export namespace feature {
  export function mel_filterbank(
    sr?: number,
    n_fft?: number,
    n_mels?: number,
    fmin?: number,
    fmax?: number | null,
    norm?: boolean
  ): number[][]

  export function hz_to_mel(hz: number): number
  export function mel_to_hz(mel: number): number

  export function melspectrogram(
    y: AudioBuffer,
    sr?: number,
    n_fft?: number,
    hop_length?: number,
    n_mels?: number,
    fmin?: number,
    fmax?: number | null
  ): number[][]

  export function mfcc(
    y: AudioBuffer,
    sr?: number,
    n_mfcc?: number,
    n_fft?: number,
    hop_length?: number,
    n_mels?: number,
    fmin?: number,
    fmax?: number | null
  ): number[][]

  export function chroma_stft(
    y: AudioBuffer,
    sr?: number,
    hop_length?: number,
    n_fft?: number,
    n_chroma?: number,
    tuning?: number
  ): number[][]

  export function chroma_cqt(
    y: AudioBuffer,
    sr?: number,
    hop_length?: number,
    fmin?: number | null,
    n_chroma?: number,
    tuning?: number,
    n_octaves?: number,
    bins_per_octave?: number
  ): number[][]

  export function spectralCentroid(options: {
    y?: AudioBuffer | null
    sr?: number
    S?: number[][] | null
    n_fft?: number
    hop_length?: number
  }): number[]

  export function spectralBandwidth(options: {
    y?: AudioBuffer | null
    sr?: number
    S?: number[][] | null
    n_fft?: number
    hop_length?: number
    centroid?: number[] | null
    norm?: boolean
    p?: number
  }): number[]

  export function rms(options: {
    y?: AudioBuffer | null
    S?: number[][] | null
    frame_length?: number
    hop_length?: number
  }): number[]

  export function zeroCrossingRate(
    y: AudioBuffer,
    options?: {
      frame_length?: number
      hop_length?: number
      center?: boolean
    }
  ): number[]
}

// Utility types
export namespace util {
  export function normalize(
    data: number[] | number[][],
    options?: { norm?: number | 'inf'; axis?: number }
  ): number[] | number[][]
}
```

---

## PHASE 7: DOCUMENTATION (3 hours)

### Task 7.1: README.md
```markdown
# Pleco Audio

A comprehensive JavaScript audio analysis library, providing Librosa-equivalent functionality for the browser and Node.js.

## Features

- 🎵 **Beat Detection** - Onset detection, tempo estimation, beat tracking
- 🎼 **Spectral Analysis** - STFT, spectrograms, spectral features
- 🎹 **Chroma Features** - Pitch class profiles for harmonic analysis
- 🎤 **MFCCs** - Mel-frequency cepstral coefficients for audio classification
- 🎶 **Effects** - Audio splitting, trimming, remixing
- 🌐 **Web Audio API** - Native browser support

## Installation

```bash
npm install pleco-audio
```

## Quick Start

```javascript
import { beatTrack, melspectrogram, chroma_stft } from 'pleco-audio'

// Detect beats
const beats = beatTrack(audioData, sampleRate)
console.log(`Tempo: ${beats.tempo} BPM`)

// Compute mel spectrogram
const melSpec = melspectrogram(audioData, sampleRate)

// Extract chroma features
const chroma = chroma_stft(audioData, sampleRate)
```

## Documentation

- [API Reference](docs/api/)
- [Examples](examples/)
- [Migration from Librosa](docs/migration.md)

## License

MIT
```

### Task 7.2: API Documentation
Create detailed docs for each module in `docs/api/`:
- core.md
- beat.md
- feature.md
- segment.md
- effects.md
- util.md

---

## PHASE 8: EXAMPLES (1 hour)

**File: examples/basic-usage.js**
**File: examples/bpm-detection.js**
**File: examples/chroma-analysis.js**
**File: examples/mfcc-extraction.js**

---

## PHASE 9: PACKAGE CONFIGURATION (1 hour)

**File: package.json**
```json
{
  "name": "pleco-audio",
  "version": "1.0.0-beta.1",
  "description": "Comprehensive JavaScript audio analysis library - Librosa for JavaScript",
  "main": "src/index.js",
  "type": "module",
  "exports": {
    ".": "./src/index.js",
    "./core": "./src/core/index.js",
    "./beat": "./src/beat/index.js",
    "./feature": "./src/feature/index.js",
    "./segment": "./src/segment/index.js",
    "./effects": "./src/effects/index.js",
    "./util": "./src/util/index.js"
  },
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src test",
    "format": "prettier --write 'src/**/*.js' 'test/**/*.js'"
  },
  "keywords": [
    "audio",
    "analysis",
    "librosa",
    "music",
    "beat-detection",
    "tempo",
    "mfcc",
    "chroma",
    "spectral",
    "dsp"
  ],
  "author": "Your Name",
  "license": "MIT",
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
```

---

## PHASE 10: FINAL COMMIT & PUSH (30 min)

### Commit Strategy
```bash
# Fix bugs
git add src/scripts/xa-mel.js src/scripts/xa-onset.js src/scripts/xa-chroma.js src/scripts/xa-spectral.js
git commit -m "Fix: Resolve import errors and remove duplicate code

- Fix xa-mel.js: Replace broken librosa-fft.js import with xa-fft.js
- Fix xa-onset.js: Remove duplicate FFT implementation, import from xa-fft.js
- Fix xa-chroma.js: Import FFT from xa-fft.js instead of xa-onset.js
- Fix xa-spectral.js: Complete missing helper functions"

# Add new library structure
git add pleco-audio/
git commit -m "feat: Create organized pleco-audio library structure

- Reorganize into modules: core, beat, feature, segment, effects, util
- Create proper index files for clean imports
- Add comprehensive test suite with 90%+ coverage
- Add TypeScript definitions
- Add documentation and examples"

# Add planning docs
git add LIBRARY_AUDIT_AND_PLAN.md ULTRA_DETAILED_EXECUTION_PLAN.md
git commit -m "docs: Add comprehensive library audit and reorganization plan"

# Push to branch
git push -u origin claude/autonomous-task-support-01CBWaYrJnecrpr5C3mvw899
```

---

## EXECUTION CHECKLIST

### Phase 1: Fix Bugs
- [x] xa-mel.js
- [x] xa-onset.js
- [ ] xa-chroma.js
- [ ] xa-spectral.js (create utils file)
- [ ] Audit remaining 29 files

### Phase 2: Directory Structure
- [ ] Create pleco-audio/ root
- [ ] Create all subdirectories
- [ ] Create .gitignore, .npmignore

### Phase 3: Reorganize Files
- [ ] Core module (3 files)
- [ ] Beat module (3 files)
- [ ] Feature module (6 files)
- [ ] Segment module (3 files)
- [ ] Effects module (3 files)
- [ ] Util module (3 files)

### Phase 4: Index Files
- [ ] src/index.js
- [ ] All module index.js files (6 total)

### Phase 5: Testing
- [ ] Set up Jest
- [ ] Create test fixtures
- [ ] Core tests (3 files)
- [ ] Beat tests (2 files)
- [ ] Feature tests (3 files)
- [ ] Integration tests (1 file)
- [ ] Run all tests, verify 90%+ coverage

### Phase 6: TypeScript
- [ ] src/types/index.d.ts

### Phase 7: Documentation
- [ ] README.md
- [ ] API docs (6 files)

### Phase 8: Examples
- [ ] 4 example files

### Phase 9: Package Config
- [ ] package.json
- [ ] jest.config.js
- [ ] tsconfig.json

### Phase 10: Commit & Push
- [ ] Commit fixes
- [ ] Commit new structure
- [ ] Commit docs
- [ ] Push to branch

---

**TOTAL ESTIMATED TIME:** 24-30 hours continuous work
**CURRENT STATUS:** Phase 1 - 50% complete (2/4 files fixed)
**NEXT TASK:** Fix xa-chroma.js import
