# DUPLICATE CODE AUDIT
## Finding All Code Duplication Across the Codebase

**Created:** 2025-11-15
**Purpose:** Systematic search for duplicate implementations to consolidate

---

## DUPLICATE MEL CONVERSIONS

### hz_to_mel / mel_to_hz

**Primary Implementation:**
- `src/scripts/xa-mel.js` - Lines 84-135 ✓ FIXED (now supports both Slaney and HTK)

**Duplicate/Inline Implementations Found:**
1. ❌ **xa-rhythm.js:130-131** - Inline HTK formulas in `createMelFilterbank()`
   ```javascript
   const melMin = 2595 * Math.log10(1 + fMin / 700)  // HTK formula
   const melMax = 2595 * Math.log10(1 + fMax / 700)
   // Line 135:
   const freq = 700 * (Math.pow(10, mel / 2595) - 1)
   ```
   **Fix:** Import and use `hz_to_mel()` and `mel_to_hz()` from xa-mel.js

**Action:** Search for ALL occurrences of these magic numbers:
- `2595` - HTK mel conversion constant
- `700` - HTK frequency constant
- `200.0 / 3` - Slaney linear scale factor
- `1000.0` - Slaney linear/log breakpoint
- `6.4` - Slaney log scale factor
- `27.0` - Slaney log scale divisor

---

## DUPLICATE MEL FILTERBANKS

**Primary Implementation:**
- `src/scripts/xa-mel.js:18` - `mel_filterbank()` function

**Duplicate Implementations Found:**
1. ❌ **xa-rhythm.js:128** - `createMelFilterbank()` - COMPLETE DUPLICATE!
   - Uses HTK formulas (should use Slaney by default)
   - 30+ lines of duplicate filterbank code
   - **Fix:** Remove function, import from xa-mel.js

**Search Pattern:**
```bash
grep -rn "filterbank\|filter.*bank" src/scripts/*.js
```

---

## DUPLICATE FFT IMPLEMENTATIONS

**Primary Implementation:**
- `src/scripts/xa-fft.js:11` - `fft()` function (Cooley-Tukey algorithm)

**Duplicate Implementations Found:**
1. ✅ **xa-onset.js:10-68** - ALREADY FIXED! (Removed, now imports from xa-fft.js)
2. ❓ **Check remaining files for FFT implementations**

**Search Pattern:**
```bash
grep -rn "function fft\|export function fft\|Cooley-Tukey\|reverseBits" src/scripts/*.js
```

**Action Required:**
```bash
# Search for FFT-related code
grep -rn "reverseBits\|Cooley-Tukey\|FFT.*algorithm" src/scripts/*.js
grep -rn "Math.cos.*2.*Math.PI.*k\|twiddle.*factor" src/scripts/*.js
```

---

## DUPLICATE STFT IMPLEMENTATIONS

**Primary Implementation:**
- `src/scripts/xa-fft.js:109` - `stft()` function

**Duplicate Implementations Found:**
1. ✅ **xa-onset.js:62** - `computeSTFT()` - Different format but NOW USES xa-fft.js FFT
2. ❓ **Check for other STFT implementations**

**Search Pattern:**
```bash
grep -rn "function.*[Ss][Tt][Ff][Tt]\|Short.*Time.*Fourier" src/scripts/*.js
```

---

## DUPLICATE WINDOW FUNCTIONS

**Primary Implementation:**
- `src/scripts/xa-fft.js:243-278` - `hann_window()`, `hamming_window()`, `blackman_window()`

**Duplicate Implementations Found:**
1. ✅ **xa-onset.js:67-70** - Inline Hann window - NOW IMPORTS from xa-fft.js
2. ❓ **xa-chroma.js:372-375** - Need to check

**Search Pattern:**
```bash
grep -rn "0.5.*1.*cos.*2.*Math.PI\|Hann.*window\|hamming\|blackman" src/scripts/*.js
```

**Action Required:**
```bash
# Find all inline window calculations
grep -rn "0.5.*Math.cos\|0.54.*0.46.*cos\|0.42.*0.5.*cos" src/scripts/*.js
```

---

## DUPLICATE ONSET DETECTION

**Primary Implementation:**
- `src/scripts/xa-onset.js` - `onsetDetect()`, `computeSpectralFlux()`, `pickPeaks()`

**Potential Duplicates:**
- ❓ Check xa-bpm-algorithm.js for onset detection
- ❓ Check xa-beat.js for onset detection
- ❓ Check xa-downbeat.js for onset detection

**Search Pattern:**
```bash
grep -rn "spectral.*flux\|onset.*detect\|onset.*strength" src/scripts/*.js
```

---

## DUPLICATE BEAT TRACKING

**Primary Implementation:**
- `src/scripts/xa-beat.js` - `beatTrack()`, `estimateTempo()`, `trackBeats()`

**Potential Duplicates:**
- ❓ xa-beat-tracker.js
- ❓ xa-bpm-algorithm.js
- ❓ xa-bpm-detection.js
- ❓ xa-tempo.js

**Search Pattern:**
```bash
grep -rn "function.*beat.*track\|autocorrelation.*tempo\|beat.*frames" src/scripts/*.js
```

---

## DUPLICATE CHROMA FEATURES

**Primary Implementation:**
- `src/scripts/xa-chroma.js` - `chroma_cqt()`, `chroma_stft()`, `constant_q_transform()`

**Potential Duplicates:**
- ❓ Check xa-spectral.js for chroma functions
- ❓ Check any other files

**Search Pattern:**
```bash
grep -rn "chroma.*stft\|chroma.*cqt\|constant.*q\|pitch.*class" src/scripts/*.js
```

---

## DUPLICATE SPECTRAL FEATURES

**Check for duplicates in:**
- spectralCentroid
- spectralBandwidth
- spectralRolloff
- spectralFlatness
- rms
- zeroCrossingRate

**Search Pattern:**
```bash
grep -rn "spectral.*centroid\|spectral.*bandwidth\|spectral.*rolloff\|zero.*crossing" src/scripts/*.js
```

---

## DUPLICATE DCT IMPLEMENTATIONS

**Primary Implementation:**
- `src/scripts/xa-mel.js:218` - `dct()` function

**Search Pattern:**
```bash
grep -rn "discrete.*cosine\|function dct\|DCT.*type" src/scripts/*.js
```

---

## SYSTEMATIC SEARCH COMMANDS

Run these to find ALL duplicates:

```bash
# 1. Mel conversions
grep -rn "2595\|700.*Math.pow\|200\.0.*\/.*3\|6\.4.*\/.*27" src/scripts/*.js

# 2. FFT implementations
grep -rn "reverseBits\|Cooley.*Tukey\|butterfly\|twiddle" src/scripts/*.js

# 3. Window functions
grep -rn "0\.5.*\(1.*cos\)\|0\.54.*cos\|0\.42.*cos" src/scripts/*.js

# 4. STFT
grep -rn "Short.*Time.*Fourier\|function.*stft" src/scripts/*.js

# 5. Onset detection
grep -rn "spectral.*flux\|onset.*strength\|peak.*pick" src/scripts/*.js

# 6. Beat tracking
grep -rn "beat.*track\|tempo.*estimate\|autocorrelation" src/scripts/*.js

# 7. Chroma
grep -rn "chroma.*cqt\|constant.*q\|pitch.*class" src/scripts/*.js

# 8. MFCCs
grep -rn "mfcc\|mel.*cepstral\|dct.*mel" src/scripts/*.js
```

---

## CONSOLIDATION STRATEGY

### Priority 1: Remove Exact Duplicates
1. Remove duplicate mel filterbank from xa-rhythm.js → import from xa-mel.js
2. Check for any other FFT duplicates
3. Check for any other window function duplicates

### Priority 2: Consolidate Similar Implementations
1. Merge multiple BPM detection files into one
2. Merge multiple beat tracking implementations
3. Consolidate onset detection if duplicated

### Priority 3: Create Shared Utilities
1. Create xa-math-utils.js for common math operations
2. Create xa-dsp-utils.js for common DSP operations
3. Ensure all files import from shared utilities

---

## EXECUTION PLAN

1. **Run all search commands above**
2. **Document every duplicate found**
3. **Create fix plan for each duplicate**
4. **Apply fixes systematically**
5. **Test after each consolidation**

---

## STATUS

- [x] Found mel conversion duplicates in xa-rhythm.js
- [ ] Search for all magic numbers (2595, 700, etc.)
- [ ] Search for all window function duplicates
- [ ] Search for all FFT duplicates
- [ ] Search for all STFT duplicates
- [ ] Search for all onset detection duplicates
- [ ] Search for all beat tracking duplicates
- [ ] Search for all chroma duplicates
- [ ] Create comprehensive fix list
- [ ] Apply fixes systematically

---

**Next Action:** Run systematic search commands to find ALL duplicates before proceeding!

---

## COMPLETE FINDINGS (2025-11-15)

### MEL CONVERSION DUPLICATES
1. ✅ xa-mel.js:84-135 - PRIMARY (fixed with Slaney support)
2. ❌ xa-rhythm.js:130-137 - DUPLICATE inline formulas

**Fix:** Replace with imports from xa-mel.js

### WINDOW FUNCTION DUPLICATES
1. ✅ xa-fft.js:246,259 - PRIMARY (hann, hamming, blackman)
2. ❌ SpectrumAnalyzer.js:533 - Inline Hann
3. ❌ audio-analysis.js:424 - Inline Hann
4. ❌ audio-utils.js:242 - Inline Hann
5. ❌ xa-beat-tracker.js:346 - Inline Hann
6. ❌ xa-bpm-algorithm.js:85,213 - Inline Hann (2 occurrences!)
7. ❌ xa-chroma.js:374 - Inline Hann
8. ❌ xa-temporal.js:604 - Modified Hamming

**Total: 10 duplicate window implementations!**

**Fix:** Import `hann_window()` from xa-fft.js everywhere

### FFT DUPLICATES
1. ✅ xa-fft.js:11 - PRIMARY  
2. ✅ xa-onset.js:13 - FIXED (now wrapper around xa-fft)
3. ❌ **xa-beat-tracker.js:5** - FULL DUPLICATE!

**Fix:** Import from xa-fft.js in xa-beat-tracker.js

### STFT DUPLICATES
1. ✅ xa-fft.js:109 - PRIMARY
2. ✅ xa-onset.js:62 - `computeSTFT()` - uses xa-fft internally (OK)
3. ❌ **xa-advanced.js:585** - `simple_stft()` - DUPLICATE!
4. ❌ **xa-advanced.js:605** - `simple_istft()` - DUPLICATE!
5. ❌ **xa-chroma.js:367** - `computeSTFT()` - DUPLICATE!
6. ⚠️ xa-spectral.js:1165 - `stft()` wrapper - needs checking

**Total: 3-4 duplicate STFT implementations!**

**Fix:** Replace all with imports from xa-fft.js

