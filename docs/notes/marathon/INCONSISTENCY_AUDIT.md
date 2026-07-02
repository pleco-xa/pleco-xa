# INCONSISTENCY AUDIT
## Finding Behavioral Differences Between Duplicate Implementations

**Created:** 2025-11-15
**Purpose:** Different implementations of same function may have DIFFERENT bugs/behaviors!

---

## CRITICAL INSIGHT

**Problem:** It's not the duplication itself - it's that duplicate implementations might:
1. Have different default parameters
2. Use different algorithms
3. Have different bugs
4. Produce different results

**Example Found:**
```javascript
// xa-mel.js:213
export function mfcc(y, sr = 22050, n_mfcc = 13, ...) { }  // ❌ WRONG default

// xa-spectral.js:952
function mfcc(options = { n_mfcc = 20, ... }) { }  // ✓ CORRECT (matches Librosa)
```

These are DIFFERENT implementations with DIFFERENT defaults! Which one is correct?

---

## METHODOLOGY

For each duplicated function:
1. **Find all implementations**
2. **Compare parameters** (defaults, types, names)
3. **Compare algorithm** (are they implementing same thing?)
4. **Check against Librosa** (which matches?)
5. **Document differences**
6. **Mark correct version**

---

## FUNCTION-BY-FUNCTION COMPARISON

### 1. MFCC Implementations

#### Implementation A: xa-mel.js:213
```javascript
export function mfcc(
  y,
  sr = 22050,           // ✓ Matches Librosa
  n_mfcc = 13,          // ❌ WRONG: Librosa = 20
  n_fft = 2048,         // ✓ Matches Librosa
  hop_length = 512,     // ✓ Matches Librosa
  n_mels = 128,         // ✓ Matches Librosa
  fmin = 0,             // ✓ Matches Librosa (0.0)
  fmax = null,          // ✓ Matches Librosa
) {
  // Computes mel spectrogram inline
  // Then applies DCT
  // Missing: S parameter, dct_type, norm, lifter parameters
}
```

**Issues:**
- ❌ n_mfcc default is 13 (should be 20)
- ❌ Missing S parameter (can't accept pre-computed mel spec)
- ❌ Missing dct_type parameter
- ❌ Missing norm parameter
- ⚠️ Has lifter but implemented differently

#### Implementation B: xa-spectral.js:947
```javascript
function mfcc(options = {}) {
  const {
    y = null,            // ✓
    sr = 22050,          // ✓
    S = null,            // ✓ HAS S parameter!
    n_mfcc = 20,         // ✓ CORRECT!
    dct_type = 2,        // ✓ HAS dct_type!
    norm = 'ortho',      // ✓ HAS norm!
    lifter = 0,          // ✓
    ...kwargs
  } = options

  // Different implementation
  // Calls melspectrogram() from options
  // Applies DCT with correct parameters
}
```

**Status:** Implementation B is MORE COMPLETE and matches Librosa better!

**Decision:** Implementation B (xa-spectral.js) should be the canonical version

---

### 2. Window Function Implementations

#### Implementation A: xa-fft.js:246 (hann_window)
```javascript
export function hann_window(n) {
  const window = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  return window
}
```

**Formula:** `0.5 * (1 - cos(2πi/(n-1)))`

#### Implementation B: xa-bpm-algorithm.js:85
```javascript
const window = new Float32Array(frameSize)
for (let i = 0; i < frameSize; i++) {
  window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameSize - 1)))
}
```

**Formula:** Same - `0.5 * (1 - cos(2πi/(n-1)))`

#### Implementation C: audio-analysis.js:424
```javascript
const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)))
```

**Formula:** Same - `0.5 * (1 - cos(2πi/(n-1)))`

**Status:** All Hann window implementations appear identical ✓

**Librosa Check:**
```python
# scipy.signal.windows.hann(n, sym=True)
# 0.5 - 0.5*cos(2*pi*n/(M-1))  # same as ours
```

**Decision:** xa-fft.js implementation is correct, all others can safely import it

---

### 3. Mel Conversion Implementations

#### Implementation A: xa-mel.js:84 (UPDATED)
```javascript
export function hz_to_mel(hz, htk = false) {
  if (htk) {
    return 2595 * Math.log10(1 + hz / 700)  // HTK formula
  }

  // Slaney formula (default)
  const f_min = 0.0
  const f_sp = 200.0 / 3
  let mel = (hz - f_min) / f_sp  // Linear part

  const min_log_hz = 1000.0
  const min_log_mel = (min_log_hz - f_min) / f_sp
  const logstep = Math.log(6.4) / 27.0

  if (hz >= min_log_hz) {
    mel = min_log_mel + Math.log(hz / min_log_hz) / logstep  // Log part
  }
  return mel
}
```

**Supports:** Both Slaney (default) and HTK

#### Implementation B: xa-rhythm.js:130
```javascript
const melMin = 2595 * Math.log10(1 + fMin / 700)
const melMax = 2595 * Math.log10(1 + fMax / 700)
```

**Supports:** Only HTK formula

**Issue:** xa-rhythm.js only uses HTK, while Librosa default is Slaney!

**Decision:** xa-mel.js is now correct. xa-rhythm.js should import and specify `htk=true` if HTK is desired, or use default Slaney

---

### 4. STFT Implementations

Need to compare all STFT implementations:
- xa-fft.js:109 - stft()
- xa-onset.js:62 - computeSTFT()
- xa-chroma.js:367 - computeSTFT()
- xa-advanced.js:585 - simple_stft()

#### Implementation A: xa-fft.js:109
```javascript
export function stft(
  y,
  n_fft = 2048,
  hop_length = 512,
  window = 'hann',
  center = true,
) {
  const win = get_window(window, n_fft)

  // Pad the signal if center is true
  let padded_y = y
  if (center) {
    const pad_length = Math.floor(n_fft / 2)
    padded_y = pad_reflect(y, pad_length)
  }

  // Compute STFT frames...
}
```

**Features:**
- ✓ Supports multiple window types
- ✓ Supports centering
- ✓ Reflect padding
- ✓ Returns complex spectrum

#### Implementation B: xa-onset.js:62
```javascript
export function computeSTFT(audioData, frameLength = 2048, hopLength = 512) {
  const numFrames = Math.floor((audioData.length - frameLength) / hopLength) + 1
  const stft = []
  const window = hann_window(frameLength)  // Uses xa-fft

  for (let i = 0; i < numFrames; i++) {
    // ... windowing and FFT using xa-fft ...
    const fftResult = fft(frame)
    stft.push(fftResult)
  }
  return stft
}
```

**Features:**
- ✓ Uses xa-fft functions internally
- ❌ No centering support
- ❌ Only Hann window
- ❌ Different output format (flat complex array)

**Status:** This is a simplified wrapper, OK to keep for specific format needs

#### Implementation C: xa-chroma.js:367
```javascript
function computeSTFT(y, n_fft = 2048, hop_length = 512) {
  const numFrames = Math.floor((y.length - n_fft) / hop_length) + 1
  const stft = []

  // Pre-compute Hann window
  const window = new Float32Array(n_fft)  // ❌ INLINE window!
  for (let i = 0; i < n_fft; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n_fft - 1)))
  }

  for (let i = 0; i < numFrames; i++) {
    // ... windowing ...
    const fftResult = fft(frame)  // Uses xa-onset's fft wrapper
    stft.push(fftResult)
  }
  return stft
}
```

**Issues:**
- ❌ Inline window calculation (should import)
- ❌ No centering support
- ✓ Uses fft from xa-onset (which now uses xa-fft)

**Decision:** Should be replaced with xa-fft.js stft() or at minimum import window function

#### Implementation D: xa-advanced.js:585
```javascript
function simple_stft(y, n_fft, hop_length) {
  const frames = []
  for (let i = 0; i <= y.length - n_fft; i += hop_length) {
    const frame = y.slice(i, i + n_fft)

    // Simple FFT without windowing
    const fft_frame = [] // ... custom FFT code ...
    frames.push(fft_frame)
  }
  return frames
}
```

**Issues:**
- ❌ NO WINDOWING AT ALL!
- ❌ Custom FFT implementation
- ❌ Very simplified

**Decision:** This is WRONG - STFT without windowing causes spectral leakage! Should be replaced entirely

---

## SUMMARY OF INCONSISTENCIES FOUND

### Critical (Wrong Defaults)
1. **n_mfcc**: xa-mel.js=13, xa-spectral.js=20 (Librosa=20) ✓ xa-spectral is correct
2. **mel conversion**: xa-rhythm.js only HTK, should support Slaney default

### Moderate (Missing Features)
3. **mfcc**: xa-mel.js missing S, dct_type, norm parameters
4. **STFT**: xa-advanced.js missing windowing entirely!
5. **STFT**: xa-chroma.js missing centering support

### Minor (Can coexist)
6. **Window functions**: All identical, safe to consolidate
7. **STFT wrappers**: xa-onset.js wrapper is OK for format conversion

---

## DECISION MATRIX

| Function | Primary Implementation | Reason |
|----------|----------------------|---------|
| **mfcc** | xa-spectral.js:947 | More complete, correct defaults |
| **hz_to_mel** | xa-mel.js:84 | Now supports both Slaney & HTK |
| **mel_to_hz** | xa-mel.js:115 | Now supports both Slaney & HTK |
| **hann_window** | xa-fft.js:246 | Clean, correct |
| **stft** | xa-fft.js:109 | Most complete, correct |
| **fft** | xa-fft.js:11 | Primary implementation |

---

## ACTION ITEMS

### Immediate Fixes
1. ❌ Fix n_mfcc=13 in xa-mel.js → n_mfcc=20
2. ❌ Add missing parameters to xa-mel.js mfcc()
3. ❌ Fix xa-rhythm.js to use Slaney default mel conversion
4. ❌ Remove xa-advanced.js simple_stft() (no windowing!)
5. ❌ Fix xa-chroma.js to import window function

### Consolidation
6. Replace all inline windows with xa-fft.js imports
7. Consider deprecating xa-mel.js mfcc() in favor of xa-spectral.js version

---

**NEXT:** Check FFT implementations for behavioral differences
