# MASS DEDUPLICATION PLAN
## Systematic Approach to Eliminate ALL Code Duplication

**Created:** 2025-11-15
**Status:** READY TO EXECUTE
**Estimated Time:** 4-6 hours

---

## FINDINGS SUMMARY

| Category | Primary | Duplicates | Total Files Affected |
|----------|---------|------------|---------------------|
| **Window Functions** | xa-fft.js | 10 files | 11 |
| **STFT** | xa-fft.js | 3-4 files | 4-5 |
| **FFT** | xa-fft.js | 1 file | 2 |
| **Mel Conversions** | xa-mel.js | 1 file | 2 |
| **Total** | - | **15-16 duplicates** | **19-20 files** |

---

## DEDUPLICATION PRIORITY (Dependencies First)

### Level 1: Core Math Functions (No Dependencies)
**These are foundational - fix first!**

#### 1.1: Window Functions
**Primary:** `src/scripts/xa-fft.js`
**Functions:** `hann_window()`, `hamming_window()`, `blackman_window()`

**Files to Fix:**
1. ❌ SpectrumAnalyzer.js:533
2. ❌ audio-analysis.js:424
3. ❌ audio-utils.js:242
4. ❌ xa-beat-tracker.js:346
5. ❌ xa-bpm-algorithm.js:85,213
6. ❌ xa-chroma.js:374
7. ❌ xa-temporal.js:604

**Fix Process:**
```javascript
// BEFORE (in each file):
const window = new Float32Array(frameLength)
for (let i = 0; i < frameLength; i++) {
  window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameLength - 1)))
}

// AFTER:
import { hann_window } from './xa-fft.js'
const window = hann_window(frameLength)
```

**Time Estimate:** 1-2 hours (7 files to fix)

---

#### 1.2: Mel Conversion Functions
**Primary:** `src/scripts/xa-mel.js`
**Functions:** `hz_to_mel()`, `mel_to_hz()`

**Files to Fix:**
1. ❌ xa-rhythm.js:130-137 (inline formulas)

**Fix Process:**
```javascript
// BEFORE (xa-rhythm.js):
const melMin = 2595 * Math.log10(1 + fMin / 700)
const melMax = 2595 * Math.log10(1 + fMax / 700)
// ...
const freq = 700 * (Math.pow(10, mel / 2595) - 1)

// AFTER:
import { hz_to_mel, mel_to_hz } from './xa-mel.js'
const melMin = hz_to_mel(fMin)
const melMax = hz_to_mel(fMax)
// ...
const freq = mel_to_hz(mel)
```

**Additional Fix:** Remove `createMelFilterbank()` from xa-rhythm.js entirely, use `mel_filterbank()` from xa-mel.js

**Time Estimate:** 30 minutes

---

### Level 2: FFT/STFT (Depends on Level 1)

#### 2.1: FFT Function
**Primary:** `src/scripts/xa-fft.js`
**Function:** `fft()`

**Files to Fix:**
1. ❌ xa-beat-tracker.js:5 (FULL duplicate implementation!)

**Fix Process:**
```javascript
// BEFORE (xa-beat-tracker.js):
function fft(signal) {
  // 50+ lines of Cooley-Tukey implementation
  // ...
}

// AFTER:
import { fft as fftTransform } from './xa-fft.js'

// Create wrapper if needed for format compatibility
function fft(signal) {
  const complexResult = fftTransform(signal)
  // Convert format if needed...
  return complexResult
}
```

**Time Estimate:** 30 minutes

---

#### 2.2: STFT Functions
**Primary:** `src/scripts/xa-fft.js`
**Functions:** `stft()`, `istft()`

**Files to Fix:**
1. ❌ xa-advanced.js:585 - `simple_stft()`
2. ❌ xa-advanced.js:605 - `simple_istft()`
3. ❌ xa-chroma.js:367 - `computeSTFT()`
4. ⚠️ xa-spectral.js:1165 - `stft()` wrapper (verify if needed)

**Fix Process for xa-advanced.js:**
```javascript
// BEFORE:
function simple_stft(y, n_fft, hop_length) {
  // Custom STFT implementation
  // ...
}

// AFTER:
import { stft } from './xa-fft.js'
// Remove simple_stft entirely, use stft() directly
```

**Fix Process for xa-chroma.js:**
```javascript
// BEFORE:
function computeSTFT(y, n_fft = 2048, hop_length = 512) {
  // Duplicate STFT implementation
  const fftResult = fft(frame)  // Using duplicate FFT!
  // ...
}

// AFTER:
import { stft } from './xa-fft.js'
// Remove computeSTFT, use stft() directly
// OR keep as thin wrapper:
function computeSTFT(y, n_fft = 2048, hop_length = 512) {
  return stft(y, n_fft, hop_length)
}
```

**Time Estimate:** 1-2 hours (3-4 files to fix)

---

## EXECUTION ORDER

### Phase A: Level 1 Fixes (2-2.5 hours)
1. ✅ Fix xa-mel.js hz_to_mel/mel_to_hz (DONE)
2. ⏳ Fix window functions in 7 files
3. ⏳ Fix mel conversions in xa-rhythm.js

### Phase B: Level 2 Fixes (1.5-2 hours)
4. ⏳ Fix FFT in xa-beat-tracker.js
5. ⏳ Fix STFT in xa-advanced.js
6. ⏳ Fix STFT in xa-chroma.js
7. ⏳ Verify STFT in xa-spectral.js

### Phase C: Verification (1 hour)
8. ⏳ Test each fixed file still works
9. ⏳ Run imports check (no broken imports)
10. ⏳ Update DUPLICATE_CODE_AUDIT.md with "FIXED" status

---

## DETAILED FIX CHECKLIST

### Window Functions (7 fixes)

- [ ] **SpectrumAnalyzer.js:533**
  - Add import: `import { hann_window } from './xa-fft.js'`
  - Replace inline calculation with: `hann_window(frameData.length)`

- [ ] **audio-analysis.js:424**
  - Add import: `import { hann_window } from './xa-fft.js'`
  - Replace inline calculation with: `hann_window(frameLength)`

- [ ] **audio-utils.js:242**
  - Add import: `import { hann_window } from './xa-fft.js'`
  - Replace inline calculation with: `hann_window(len)`

- [ ] **xa-beat-tracker.js:346**
  - Add import: `import { hann_window } from './xa-fft.js'`
  - Replace inline calculation with: `hann_window(frameLength)`

- [ ] **xa-bpm-algorithm.js:85**
  - Add import: `import { hann_window } from './xa-fft.js'`
  - Replace inline calculation with: `hann_window(frameSize)`

- [ ] **xa-bpm-algorithm.js:213**
  - Already has import? Check and replace second occurrence with: `hann_window(windowLength)`

- [ ] **xa-chroma.js:374**
  - Add import: `import { fft as fftTransform, hann_window } from './xa-fft.js'`
  - Replace inline calculation with: `hann_window(n_fft)`
  - ALSO fix FFT import (currently from xa-onset.js)

### Mel Conversions (1 fix)

- [ ] **xa-rhythm.js:128-150**
  - Add import: `import { hz_to_mel, mel_to_hz, mel_filterbank } from './xa-mel.js'`
  - Replace `createMelFilterbank()` function entirely
  - Use `mel_filterbank()` instead

### FFT (1 fix)

- [ ] **xa-beat-tracker.js:5-60** (approx)
  - Add import: `import { fft as fftTransform } from './xa-fft.js'`
  - Remove entire fft() function
  - Create thin wrapper if format conversion needed

### STFT (3-4 fixes)

- [ ] **xa-advanced.js:585-620**
  - Add import: `import { stft, istft } from './xa-fft.js'`
  - Remove `simple_stft()` and `simple_istft()`
  - Replace all calls with direct `stft()` and `istft()`

- [ ] **xa-chroma.js:367-392**
  - Import already added for window (see above)
  - Remove `computeSTFT()` function
  - Replace calls with `stft()`

- [ ] **xa-spectral.js:1165**
  - Check if this is a wrapper or duplicate
  - If wrapper, verify it uses xa-fft.js
  - If duplicate, replace with import

---

## TESTING STRATEGY

After each fix:
1. Check file has no syntax errors
2. Verify imports resolve correctly
3. If possible, run quick smoke test

After all fixes:
1. Try running main application
2. Check for any runtime errors
3. Verify BPM detection still works
4. Verify chroma analysis still works

---

## ROLLBACK PLAN

If fixes break something:
1. Git status shows which files changed
2. Git diff shows exact changes
3. Can revert individual files if needed
4. All original code is preserved in git

---

## SUCCESS CRITERIA

- ✅ All duplicate window functions removed (7 files fixed)
- ✅ All duplicate mel conversions removed (1 file fixed)
- ✅ All duplicate FFT implementations removed (1 file fixed)
- ✅ All duplicate STFT implementations removed (3-4 files fixed)
- ✅ No broken imports
- ✅ Application still runs
- ✅ Core features still work

**Total Files to Fix:** 12-13 files
**Total Deletions:** ~500-700 lines of duplicate code
**Total Additions:** ~12-15 import statements

---

**NEXT ACTION:** Begin Phase A - Fix window functions (highest duplication count)
