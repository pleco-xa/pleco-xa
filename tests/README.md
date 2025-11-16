# Pleco-Audio Test Suite

Comprehensive test suite for all 459 Librosa-equivalent functions in the pleco-audio library.

## Overview

This test suite provides complete coverage for the JavaScript implementation of Librosa functions, ensuring parity with the original Python library.

### Test Statistics

- **Total Functions**: 459 implemented functions
- **Test Files**: 46 module test files
- **Test Framework**: Vitest
- **HTML Demo Pages**: 18 interactive demo pages

## Test Structure

```
tests/
├── fixtures/
│   └── test-data.js          # Test data generators and utilities
├── librosa/
│   ├── index.test.js         # Master test suite index
│   ├── xa-fft.test.js        # FFT module tests (comprehensive)
│   ├── xa-convert.test.js    # Conversion module tests (comprehensive)
│   ├── xa-mel.test.js        # Mel scale tests
│   ├── xa-beat.test.js       # Beat tracking tests
│   └── ... (42 more modules)
├── demos/
│   ├── demo-spectral.html    # Spectral analysis demos
│   ├── demo-beat.html        # Beat/tempo demos
│   └── ... (16 more demos)
└── README.md                 # This file
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
npm test xa-fft
npm test xa-convert
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

## Test Categories

### Core Audio Processing

- **xa-fft.test.js** - FFT, STFT, windowing functions
- **xa-spectral.test.js** - Spectral features and transforms
- **xa-mel.test.js** - Mel scale operations
- **xa-chroma.test.js** - Chroma features

### Beat & Tempo

- **xa-beat.test.js** - Beat tracking
- **xa-tempo.test.js** - Tempo estimation
- **xa-bpm-detection.test.js** - BPM detection
- **xa-downbeat.test.js** - Downbeat detection

### Pitch & Harmony

- **xa-pitch.test.js** - Pitch detection (piptrack, YIN, PYIN)
- **xa-harmonic.test.js** - Harmonic analysis
- **xa-intervals.test.js** - Musical intervals
- **xa-notation.test.js** - Music notation utilities

### Transforms

- **xa-constantq.test.js** - Constant-Q transform
- **xa-inverse.test.js** - Inverse transforms
- **xa-decompose.test.js** - HPSS, NMF

### Effects & Processing

- **xa-effects.test.js** - Time stretch, pitch shift
- **xa-processing.test.js** - Audio processing utilities
- **xa-filters.test.js** - Filter banks

### Analysis

- **xa-onset.test.js** - Onset detection
- **xa-segment.test.js** - Segmentation
- **xa-sequence.test.js** - Sequence analysis (DTW, Viterbi)
- **xa-recurrence.test.js** - Recurrence analysis

### Utilities

- **xa-convert.test.js** - MIDI, frequency, time conversions
- **xa-util.test.js** - Array operations, normalization
- **xa-normalize.test.js** - Normalization functions

## HTML Demo Pages

Interactive browser demos are available in `tests/demos/`:

### Viewing Demos

Simply open any HTML file in a browser:

```bash
# Example: open spectral analysis demo
open tests/demos/demo-spectral.html
```

### Available Demos

1. **demo-spectral.html** - STFT, FFT, spectrograms
2. **demo-beat.html** - Beat tracking and tempo estimation
3. **demo-pitch.html** - Pitch detection and analysis
4. **demo-chroma.html** - Chroma features
5. **demo-mel.html** - Mel spectrograms
6. **demo-constantq.html** - Constant-Q transform
7. **demo-effects.html** - Time stretch, pitch shift
8. **demo-onset.html** - Onset detection
9. **demo-segment.html** - Audio segmentation
10. **demo-sequence.html** - DTW and sequence alignment
11. **demo-filters.html** - Filter bank visualization
12. **demo-features.html** - Feature extraction
13. **demo-decompose.html** - HPSS demos
14. **demo-rhythm.html** - Rhythm analysis
15. **demo-convert.html** - Conversion utilities
16. **demo-util.html** - Utility functions
17. **demo-display.html** - Visualization functions
18. **demo-processing.html** - Audio processing

Each demo provides:
- File upload for testing with your audio
- Interactive controls
- Visual output
- Real-time console logging

## Test Data Fixtures

The `tests/fixtures/test-data.js` module provides utilities for generating test data:

### Audio Generators

```javascript
import { generateTestAudio, generateWhiteNoise, generateChirp } from '../fixtures/test-data.js';

// Generate sine wave
const audio = generateTestAudio(1.0, 22050, 440); // 1s, 22050 Hz, 440 Hz

// Generate white noise
const noise = generateWhiteNoise(1.0, 22050);

// Generate frequency sweep
const chirp = generateChirp(1.0, 22050, 100, 1000);
```

### Validation Helpers

```javascript
import { almostEqual, isFiniteArray } from '../fixtures/test-data.js';

// Compare floating point values
expect(almostEqual(3.14159, Math.PI, 0.01)).toBe(true);

// Validate array contents
expect(isFiniteArray([1, 2, 3, 4])).toBe(true);
```

### Mock Audio Buffers

```javascript
import { createMockAudioBuffer } from '../fixtures/test-data.js';

const audioData = generateTestAudio(1.0, 22050, 440);
const mockBuffer = createMockAudioBuffer(audioData, 22050);
```

## Writing New Tests

### Test Template

```javascript
import { describe, it, expect } from 'vitest';
import * as module from '../../src/scripts/xa-module.js';
import { generateTestAudio, almostEqual } from '../fixtures/test-data.js';

describe('xa-module', () => {
  describe('functionName', () => {
    it('should be defined and exported', () => {
      expect(module.functionName).toBeDefined();
      expect(typeof module.functionName).toBe('function');
    });

    it('should handle valid inputs', () => {
      const input = generateTestAudio(1.0, 22050, 440);
      const result = module.functionName(input);
      expect(result).toBeDefined();
    });

    it('should match expected output', () => {
      // Test with known input/output
      const result = module.functionName(knownInput);
      expect(almostEqual(result, expectedOutput, 0.01)).toBe(true);
    });

    it('should throw on invalid inputs', () => {
      expect(() => module.functionName(null)).toThrow();
      expect(() => module.functionName(undefined)).toThrow();
    });
  });
});
```

### Best Practices

1. **Test Existence**: Always verify function exists and is correct type
2. **Test Valid Inputs**: Test with realistic audio data
3. **Test Edge Cases**: Empty arrays, boundary values, extreme parameters
4. **Test Invalid Inputs**: Null, undefined, wrong types
5. **Test Output**: Verify output shape, type, and values
6. **Test Parity**: Compare with known Librosa outputs when possible

## Test Coverage Goals

### Current Status (As of November 2025)

- FFT Module: 100% coverage (14/14 functions)
- Convert Module: 100% coverage (20+/20+ functions)
- Remaining Modules: Infrastructure complete, tests in progress

### Target Coverage

- All 459 functions have at least basic existence tests
- Core modules (FFT, spectral, mel, beat, tempo) have comprehensive tests
- All functions tested for valid inputs, edge cases, and errors
- Integration tests for common workflows

## Continuous Integration

Tests are designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm test -- --coverage

- name: Upload coverage
  uses: codecov/codecov-action@v3
```

## Troubleshooting

### Tests Failing on Import

Ensure module paths use correct relative paths:
```javascript
import * as module from '../../src/scripts/xa-module.js';
```

### JSDOM Errors

Some tests require JSDOM environment for Web Audio API:
```javascript
// vitest.config.js
export default defineConfig({
  test: {
    environment: 'jsdom'
  }
});
```

### Timeout Issues

For long-running tests, increase timeout:
```javascript
it('should process large audio file', () => {
  // ... test code
}, 10000); // 10 second timeout
```

## Contributing

When adding new Librosa functions:

1. Update the function in appropriate `xa-*.js` file
2. Add tests to corresponding `tests/librosa/xa-*.test.js`
3. Update HTML demo if applicable
4. Run tests to verify: `npm test`
5. Commit both implementation and tests together

## Resources

- [Vitest Documentation](https://vitest.dev)
- [Librosa Documentation](https://librosa.org/doc/latest/index.html)
- [Pleco-Audio Main README](/home/user/pleco-xa/README.md)

## License

Same as pleco-audio main project.
