# Pleco-Audio Test Suite

**Real algorithmic validation tests based on Librosa's test patterns**

This test suite validates the correctness of pleco-audio's DSP algorithms by testing against known mathematical properties and synthetic test data, following patterns from the Librosa test suite.

## Testing Philosophy

**NO MORE "toBeDefined" PLACEHOLDERS** - Every test validates CORRECTNESS, not just existence.

### What Makes a REAL Test?

Based on Librosa's test suite patterns:

1. **Synthetic data with known outputs**
   - Example: Create click track at 120 BPM → detect tempo → validate within 5% tolerance
   - Example: FFT of impulse → all magnitude bins should equal 1

2. **Mathematical correctness validation**
   - Example: `ifft(fft(signal))` should reconstruct original
   - Example: Mel filterbank coefficients should sum correctly

3. **Parametrized testing** (multiple scenarios)
   - Different sample rates, hop lengths, window sizes
   - Edge cases: DC, Nyquist, silence, single sample

4. **Actual comparison to expected values**
   - Use `almostEqual(actual, expected, tolerance)`
   - Not just "is it defined?" or "is length > 0?"

## Test Fixtures (`tests/fixtures/test-data.js`)

### Synthetic Audio Generators

Following Librosa patterns from `test_beat.py`, `test_features.py`, etc.

#### `generateClickTrack(tempo, sr, duration)`
Creates impulses at regular intervals for tempo testing.

**Librosa equivalent** (test_beat.py lines 56-61):
```python
y = np.zeros(20 * sr)
delay = librosa.time_to_samples(60.0 / tempo, sr=sr).item()
y[::delay] = 1
```

**JavaScript usage**:
```javascript
const clickTrack = generateClickTrack(120, 22050, 20);
const detectedTempo = tempo(clickTrack, 22050);
expect(withinPercent(detectedTempo, 120, 0.05)).toBe(true); // 5% tolerance
```

#### `generateSingleBinSpectrum(nBins, nFrames, peakBin)`
Creates idealized spectrum with all energy in one bin.

**Librosa equivalent** (test_features.py lines 134-138):
```python
S = np.zeros((513, 3))
S[5, :] = 1.0  # All energy in bin 5
```

**JavaScript usage**:
```javascript
const S = generateSingleBinSpectrum(513, 3, 5);
const centroid = spectral_centroid(S);
// Centroid should equal frequency of bin 5
expect(centroid).toBeCloseTo(fft_frequencies(sr, nfft)[5]);
```

#### Other Generators

- **`generateTestAudio(duration, sr, freq)`** - Sine wave at specific frequency
- **`generateWhiteNoise(duration, sr, amplitude)`** - Random noise
- **`generateImpulse(length, position)`** - Dirac delta function
- **`generateDCSignal(length, value)`** - Constant value signal
- **`generateSilence(length)`** - All zeros
- **`generateAlternatingSignal(sr, period)`** - For zero-crossing rate tests
- **`generateChirp(duration, sr, f0, f1)`** - Frequency sweep

### Tolerance Comparison Helpers

#### `almostEqual(a, b, tolerance)`
Simple absolute tolerance comparison.

```javascript
expect(almostEqual(440.0, 440.1, 0.2)).toBe(true);
```

#### `withinPercent(actual, expected, percent)`
Percentage-based tolerance (for tempo testing).

**Librosa equivalent** (test_beat.py line 76):
```python
assert np.abs(tempo_est - tempo) <= 0.05 * tempo  # 5% tolerance
```

**JavaScript usage**:
```javascript
expect(withinPercent(detectedTempo, 120, 0.05)).toBe(true); // Within 5%
```

#### `allclose(a, b, {rtol, atol})`
NumPy `allclose` equivalent for arrays.

**Librosa equivalent**:
```python
assert np.allclose(reconstructed, original, rtol=1e-5, atol=1e-8)
```

**JavaScript usage**:
```javascript
expect(allclose(reconstructed, original, {rtol: 1e-5, atol: 1e-8})).toBe(true);
```

### Known Test Vectors (`knownTestVectors`)

Comprehensive test data based on Librosa's known values:

- **MIDI conversions**: `[33, 45, 57, 69] → [55, 110, 220, 440] Hz`
- **Time/sample conversions**: `[0, 1, 2] s → [0, sr, 2*sr] samples`
- **FFT frequencies**: DC=0, Nyquist=sr/2, linearly spaced
- **Tempo tests**: 60, 80, 110, 120, 160 BPM with 5% tolerance
- **Spectral features**: Single-bin tests, zero-crossing rates

## Test Patterns by Module

### xa-convert.test.js - Conversion Functions

**Pattern**: Known input → conversion → known output

```javascript
// Test with Librosa's known test vectors (test_convert.py line 277)
knownTestVectors.midi.midiToHz.forEach(({ midi, hz }) => {
  const result = midi_to_hz(midi);
  expect(almostEqual(result, hz, 0.5)).toBe(true);
});

// Test reversibility
const midi = hz_to_midi(440);
const reconstructed = midi_to_hz(midi);
expect(almostEqual(440, reconstructed, 0.01)).toBe(true);
```

### xa-beat.test.js - Tempo Detection

**Pattern**: Click track at known BPM → detect tempo → validate within 5% tolerance

Based on **Librosa test_beat.py lines 50-77**:

```javascript
it('should detect 120 BPM from click track within 5% tolerance', () => {
  const expectedTempo = 120;
  const clickTrack = generateClickTrack(expectedTempo, 22050, 20);
  const detectedTempo = tempo(clickTrack, 22050);

  // Librosa pattern: assert np.abs(tempo_est - tempo) <= 0.05 * tempo
  expect(withinPercent(detectedTempo, expectedTempo, 0.05)).toBe(true);
});
```

**Edge cases** (test_tempo_no_onsets):
- Silence → should return 0 or default BPM
- Constant signal → should handle gracefully

### xa-fft.test.js - FFT Correctness

**Pattern**: Known input properties → FFT → validate mathematical correctness

#### Test 1: FFT of Impulse
```javascript
const impulse = generateImpulse(8, 0);  // [1, 0, 0, 0, 0, 0, 0, 0]
const result = fft(impulse);

// All magnitude bins should equal 1
for (const mag of magnitudes) {
  expect(almostEqual(mag, 1.0, 0.01)).toBe(true);
}
```

#### Test 2: FFT of DC Signal
```javascript
const dcSignal = generateDCSignal(8, 1.0);  // [1, 1, 1, 1, 1, 1, 1, 1]
const result = fft(dcSignal);

// DC bin (index 0) should be N (length), all others ~0
expect(almostEqual(magnitudes[0], 8.0, 0.1)).toBe(true);
for (let i = 1; i < magnitudes.length; i++) {
  expect(almostEqual(magnitudes[i], 0, 0.1)).toBe(true);
}
```

#### Test 3: IFFT Reconstruction
```javascript
const signal = generateTestAudio(0.05, 22050, 440);
const fftResult = fft(signal);
const reconstructed = ifft(fftResult);

// ifft(fft(x)) ≈ x
expect(allclose(reconstructed, signal, {rtol: 1e-3, atol: 1e-3})).toBe(true);
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific module
```bash
npm test xa-beat
npm test xa-fft
npm test xa-convert
```

### Run with coverage
```bash
npm run test:coverage
```

### Watch mode (for development)
```bash
npm run test:watch
```

## Adding New Tests

When adding tests for a new function, follow this template:

```javascript
describe('functionName', () => {
  it('should validate correctness with known input/output', () => {
    // 1. Create synthetic test data with known properties
    const input = generateClickTrack(120, 22050, 20);

    // 2. Run algorithm
    const result = functionName(input, 22050);

    // 3. VALIDATE CORRECTNESS against known output
    expect(withinPercent(result, 120, 0.05)).toBe(true);
  });

  it('should handle edge cases', () => {
    // Test with: silence, DC, Nyquist, single sample, etc.
  });

  it('should throw on invalid inputs', () => {
    expect(() => functionName(null, sr)).toThrow();
  });
});
```

## References

- **Librosa test suite**: `/tmp/librosa/tests/`
  - `test_beat.py` - Tempo detection patterns
  - `test_features.py` - Spectral feature validation
  - `test_convert.py` - Conversion function tests
  - `test_onset.py` - Onset detection patterns

- **NumPy testing patterns**:
  - `np.allclose()` for array comparison
  - `np.testing.assert_almost_equal()`

## Test Coverage Goals

- **100% function coverage**: Every exported function has tests
- **Algorithmic correctness**: Every test validates BEHAVIOR, not just existence
- **Edge case coverage**: Silence, DC, Nyquist, boundary conditions
- **Librosa parity**: Tests match Librosa's validation patterns where applicable

---

**Remember**: No more placeholders. Every test validates that the algorithm works correctly.
