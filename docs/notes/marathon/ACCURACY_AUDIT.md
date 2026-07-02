# ACCURACY AUDIT - Librosa vs Pleco
## Tracking Parameter Differences and Missing Features

**Created:** 2025-11-15
**Purpose:** Document every difference from Librosa to ensure accuracy

---

## ⚠️ CRITICAL FINDINGS

### mel_filterbank() - src/scripts/xa-mel.js

**Librosa signature:**
```python
def mel(
    *,
    sr: float,              # REQUIRED - no default
    n_fft: int,             # REQUIRED - no default
    n_mels: int = 128,
    fmin: float = 0.0,
    fmax: Optional[float] = None,
    htk: bool = False,
    norm: Optional[Union[Literal["slaney"], float]] = "slaney",
    dtype: DTypeLike = np.float32,
) -> np.ndarray
```

**Our signature:**
```javascript
export function mel_filterbank(
  sr = 22050,        // ❌ WRONG: Should be REQUIRED
  n_fft = 2048,      // ❌ WRONG: Should be REQUIRED
  n_mels = 128,      // ✓ Correct
  fmin = 0,          // ✓ Correct
  fmax = null,       // ✓ Correct
  norm = true,       // ❌ WRONG: Should be 'slaney' | number | null
) { }
```

**Issues:**
1. ❌ `sr` should be REQUIRED (no default)
2. ❌ `n_fft` should be REQUIRED (no default)
3. ❌ `norm` parameter is wrong type (boolean vs string/'slaney'/number/null)
4. ❌ Missing `htk` parameter for HTK-style mel scale
5. ❌ Normalization logic doesn't match Librosa's "slaney" normalization

**Fix Required:**
```javascript
export function mel_filterbank(
  sr,              // REQUIRED
  n_fft,           // REQUIRED
  n_mels = 128,
  fmin = 0.0,
  fmax = null,
  htk = false,
  norm = 'slaney'
) {
  // Validate required params
  if (sr === undefined || n_fft === undefined) {
    throw new Error('sr and n_fft are required parameters')
  }

  // Implement proper slaney normalization
  // ...
}
```

---

### melspectrogram() - src/scripts/xa-mel.js

**Librosa signature:**
```python
def melspectrogram(
    *,
    y: Optional[np.ndarray] = None,
    sr: float = 22050,
    S: Optional[np.ndarray] = None,
    n_fft: int = 2048,
    hop_length: int = 512,
    win_length: Optional[int] = None,      # Missing in ours!
    window: _WindowSpec = "hann",          # Missing in ours!
    center: bool = True,                   # Missing in ours!
    pad_mode: _PadModeSTFT = "constant",   # Missing in ours!
    power: float = 2.0,                    # Missing in ours!
    **kwargs: Any,
) -> np.ndarray
```

**Our signature:**
```javascript
export function melspectrogram(
  y,
  sr = 22050,      // ✓ Correct
  n_fft = 2048,    // ✓ Correct
  hop_length = 512,// ✓ Correct
  n_mels = 128,
  fmin = 0,
  fmax = null,
) { }
```

**Issues:**
1. ❌ Missing `S` parameter (can accept pre-computed spectrogram)
2. ❌ Missing `win_length` parameter
3. ❌ Missing `window` parameter (default: 'hann')
4. ❌ Missing `center` parameter (default: True)
5. ❌ Missing `pad_mode` parameter (default: 'constant')
6. ❌ Missing `power` parameter (default: 2.0) - IMPORTANT for power vs magnitude

**Fix Required:**
```javascript
export function melspectrogram(
  y = null,
  sr = 22050,
  S = null,                    // Add S parameter
  n_fft = 2048,
  hop_length = 512,
  win_length = null,           // Add
  window = 'hann',             // Add
  center = true,               // Add
  pad_mode = 'constant',       // Add
  power = 2.0,                 // Add - CRITICAL!
  n_mels = 128,
  fmin = 0.0,
  fmax = null,
) {
  // Either y or S must be provided
  if (y === null && S === null) {
    throw new Error('Either y or S must be provided')
  }

  // If S provided, skip STFT and go straight to mel mapping
  if (S !== null) {
    const mel_basis = mel_filterbank(sr, n_fft, n_mels, fmin, fmax)
    return matmul(mel_basis, S)
  }

  // Otherwise compute STFT with all the missing parameters
  const stft_result = stft(y, {
    n_fft,
    hop_length,
    win_length,
    window,
    center,
    pad_mode
  })

  // Apply power (2.0 for power spectrum, 1.0 for magnitude)
  const spec = stft_result.map(frame => {
    const mag = magnitude(frame)
    return mag.map(m => Math.pow(m, power))
  })

  // Apply mel filterbank
  const mel_basis = mel_filterbank(sr, n_fft, n_mels, fmin, fmax)
  return matmul(mel_basis, spec)
}
```

---

### mfcc() - src/scripts/xa-mel.js

**Librosa signature:**
```python
def mfcc(
    *,
    y: Optional[np.ndarray] = None,
    sr: float = 22050,
    S: Optional[np.ndarray] = None,
    n_mfcc: int = 20,                  # ❌ We have 13!
    dct_type: int = 2,
    norm: Optional[str] = "ortho",
    lifter: float = 0,
    **kwargs: Any,
) -> np.ndarray
```

**Our signature:**
```javascript
export function mfcc(
  y,
  sr = 22050,      // ✓ Correct
  n_mfcc = 13,     // ❌ WRONG: Should be 20!
  n_fft = 2048,
  hop_length = 512,
  n_mels = 128,
  fmin = 0,
  fmax = null,
) { }
```

**Issues:**
1. ❌ `n_mfcc` default is 13 - should be 20!
2. ❌ Missing `S` parameter (can accept pre-computed mel spectrogram)
3. ❌ Missing `dct_type` parameter (default: 2)
4. ❌ Missing `norm` parameter (default: 'ortho')
5. ❌ Has `lifter` but implemented differently

**Fix Required:**
```javascript
export function mfcc(
  y = null,
  sr = 22050,
  S = null,              // Add S parameter
  n_mfcc = 20,           // Fix default: 13 → 20
  dct_type = 2,          // Add
  norm = 'ortho',        // Add
  lifter = 0,            // Keep but verify implementation
  n_fft = 2048,
  hop_length = 512,
  n_mels = 128,
  fmin = 0.0,
  fmax = null,
) {
  // Compute or use provided mel spectrogram
  let melspec = S
  if (melspec === null) {
    melspec = melspectrogram(y, sr, null, n_fft, hop_length, null, 'hann', true, 'constant', 2.0, n_mels, fmin, fmax)
  }

  // Convert to dB
  const log_mel = power_to_db(melspec)

  // Apply DCT with correct type and normalization
  const M = dct(log_mel, { axis: -2, type: dct_type, norm })

  // Return first n_mfcc coefficients
  return M.slice(0, n_mfcc)
}
```

---

### hz_to_mel() / mel_to_hz() - src/scripts/xa-mel.js

**Librosa implementation:**
```python
def hz_to_mel(
    frequencies: _FloatLike_co,
    *,
    htk: bool = False,
) -> np.ndarray:
    """Convert Hz to Mels.

    Examples
    --------
    >>> librosa.hz_to_mel(60)
    0.9
    >>> librosa.hz_to_mel([110, 220, 440])
    array([ 1.65,  3.3 ,  6.6 ])

    Parameters
    ----------
    frequencies : number or np.ndarray [shape=(...,)] , float
        scalar or array of frequencies
    htk : bool
        use HTK formula instead of Slaney

    Returns
    -------
    mels : number or np.ndarray [shape=(...,)]
        input frequencies in Mels
    """
    if htk:
        return 2595.0 * np.log10(1.0 + frequencies / 700.0)

    # Fill in the linear part
    f_min = 0.0
    f_sp = 200.0 / 3

    mels = (frequencies - f_min) / f_sp

    # Fill in the log-scale part

    min_log_hz = 1000.0  # beginning of log region (Hz)
    min_log_mel = (min_log_hz - f_min) / f_sp  # same (Mels)
    logstep = np.log(6.4) / 27.0  # step size for log region

    if frequencies >= min_log_hz:
        mels = min_log_mel + np.log(frequencies / min_log_hz) / logstep

    return mels
```

**Our implementation:**
```javascript
export function hz_to_mel(hz) {
  return 2595 * Math.log10(1 + hz / 700)
}
```

**Issues:**
1. ❌ Only implements HTK formula!
2. ❌ Missing `htk` parameter
3. ❌ Missing Slaney formula (default in Librosa)
4. ❌ Slaney formula has linear part (0-1000Hz) and log part (>1000Hz)

**Fix Required:**
```javascript
export function hz_to_mel(hz, htk = false) {
  if (htk) {
    // HTK formula
    return 2595 * Math.log10(1 + hz / 700)
  }

  // Slaney formula (default)
  const f_min = 0.0
  const f_sp = 200.0 / 3

  // Linear part
  let mel = (hz - f_min) / f_sp

  // Log part
  const min_log_hz = 1000.0
  const min_log_mel = (min_log_hz - f_min) / f_sp
  const logstep = Math.log(6.4) / 27.0

  if (hz >= min_log_hz) {
    mel = min_log_mel + Math.log(hz / min_log_hz) / logstep
  }

  return mel
}

export function mel_to_hz(mel, htk = false) {
  if (htk) {
    // HTK formula
    return 700 * (Math.pow(10, mel / 2595) - 1)
  }

  // Slaney formula (default)
  const f_min = 0.0
  const f_sp = 200.0 / 3
  const min_log_hz = 1000.0
  const min_log_mel = (min_log_hz - f_min) / f_sp
  const logstep = Math.log(6.4) / 27.0

  if (mel < min_log_mel) {
    // Linear part
    return f_min + f_sp * mel
  } else {
    // Log part
    return min_log_hz * Math.exp(logstep * (mel - min_log_mel))
  }
}
```

---

## NEXT FILES TO AUDIT

### Priority Queue (check these next):
1. ⚠️ **xa-chroma.js** - Check all chroma function parameters
2. ⚠️ **xa-spectral.js** - Check spectral feature parameters
3. ⚠️ **xa-fft.js** - Verify STFT/FFT parameters match
4. ⚠️ **xa-onset.js** - Check onset detection parameters
5. ⚠️ **xa-beat.js** - Verify beat tracking parameters

---

## SYSTEMATIC AUDIT PROCESS

For EACH function:
1. Find Librosa equivalent in `/tmp/librosa-reference/`
2. Compare parameter names, defaults, types
3. Compare algorithm implementation details
4. Document differences in this file
5. Create fix in code

---

## AUDIT STATUS

- [x] mel_filterbank() - **ISSUES FOUND**
- [x] melspectrogram() - **ISSUES FOUND**
- [x] mfcc() - **ISSUES FOUND**
- [x] hz_to_mel() / mel_to_hz() - **ISSUES FOUND**
- [ ] dct() - TO CHECK
- [ ] delta_features() - TO CHECK
- [ ] power_to_db() - TO CHECK
- [ ] chroma_cqt() - TO CHECK
- [ ] chroma_stft() - TO CHECK
- [ ] constant_q_transform() - TO CHECK
- [ ] stft() - TO CHECK
- [ ] fft() - TO CHECK
- [ ] onsetDetect() - TO CHECK
- [ ] beatTrack() - TO CHECK
- [ ] spectralCentroid() - TO CHECK
- [ ] spectralBandwidth() - TO CHECK
- [ ] rms() - TO CHECK

---

**RECOMMENDATION:** Before proceeding with file reorganization, we should FIX all these parameter mismatches first. Otherwise we'll be organizing incorrect code!
