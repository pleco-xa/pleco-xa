# Pleco Audio

**JavaScript Audio Analysis Library - Librosa-compatible**

A comprehensive audio analysis library for JavaScript providing professional-grade audio processing capabilities compatible with Python's Librosa library.

## Features

- ⚡ **Pure JavaScript** - No dependencies, works in Node.js and browsers
- 🎵 **Librosa-Compatible** - Familiar API for Python developers
- 🔧 **Comprehensive** - 50-60% Librosa feature parity and growing
- 📊 **Production-Ready** - Professional-grade implementations
- 🌐 **Web Audio Compatible** - Works with Web Audio API

## Installation

```bash
npm install pleco-audio
```

## Quick Start

```javascript
import { melspectrogram, mfcc, beat_track, hpss } from 'pleco-audio'

// Load your audio (Float32Array)
const audio = loadAudioFile('song.wav')
const sr = 22050

// Extract mel spectrogram
const melSpec = melspectrogram(audio, sr)

// Extract MFCCs
const mfccs = mfcc(audio, sr)

// Beat tracking
const { tempo, beats } = beat_track(audio, sr)

// Harmonic-Percussive Source Separation
const { harmonic, percussive } = hpss(audio)
```

## Modules

### Core Analysis

#### FFT and STFT
```javascript
import { stft, istft, fft, ifft } from 'pleco-audio'

// Short-Time Fourier Transform
const D = stft(audio, 2048, 512)

// Inverse STFT
const reconstructed = istft(D, 512)
```

#### Mel-Frequency Analysis
```javascript
import { melspectrogram, mfcc, mel_filterbank } from 'pleco-audio'

// Mel spectrogram
const melSpec = melspectrogram(audio, sr, {
  n_fft: 2048,
  hop_length: 512,
  n_mels: 128
})

// MFCCs with all parameters
const mfccs = mfcc(audio, sr, {
  n_mfcc: 20,
  dct_type: 2,
  norm: 'ortho',
  lifter: 0
})

// Mel filterbank
const filterbank = mel_filterbank(sr, 2048, 128)
```

### Feature Extraction

#### Pitch Tracking
```javascript
import { yin, pyin, piptrack } from 'pleco-audio'

// YIN fundamental frequency estimator
const f0 = yin(audio, 80, 400, sr)

// Probabilistic YIN
const { f0, voiced_flag, voiced_prob } = pyin(audio, 80, 400, sr)

// Pitch tracking from spectrogram
const { pitches, magnitudes } = piptrack(audio, sr)
```

#### Tempo and Beat Tracking
```javascript
import { tempo, beat_track, tempogram } from 'pleco-audio'

// Estimate tempo
const bpm = tempo(audio, sr)

// Full beat tracking
const { tempo, beats } = beat_track(audio, sr)

// Tempogram for tempo variation
const tgram = tempogram(audio, sr)
```

### Source Separation

#### HPSS (Harmonic-Percussive Source Separation)
```javascript
import { hpss, harmonic, percussive } from 'pleco-audio'

// Full HPSS
const { harmonic, percussive } = hpss(audio)

// Quick access to components
const harmonicOnly = harmonic(audio)
const percussiveOnly = percussive(audio)
```

#### NMF (Non-negative Matrix Factorization)
```javascript
import { decompose, nmf_separate } from 'pleco-audio'

// Decompose into components
const { components, activations } = decompose(spectrogram, 5)

// Separate sources
const sources = nmf_separate(spectrogram, 2)
```

### Audio Effects

#### Time Stretching and Pitch Shifting
```javascript
import { time_stretch } from 'pleco-audio'
import { pitch_shift } from 'pleco-audio/xa-advanced'

// Time stretch (slower)
const slower = time_stretch(audio, 0.8)

// Time stretch (faster)
const faster = time_stretch(audio, 1.2)

// Pitch shift
const higher = pitch_shift(audio, sr, 2) // +2 semitones
```

#### Silence Detection and Trimming
```javascript
import { trim, split } from 'pleco-audio'

// Trim silence
const { trimmed, index } = trim(audio, 60) // 60 dB threshold

// Split on silence
const intervals = split(audio, 60)
```

### Structural Segmentation

```javascript
import { recurrence_matrix, segment_boundaries } from 'pleco-audio'

// Compute self-similarity
const R = recurrence_matrix(features)

// Detect segment boundaries
const boundaries = segment_boundaries(features)
```

### Conversion Utilities

```javascript
import { 
  hz_to_midi, midi_to_hz, hz_to_note,
  frames_to_time, amplitude_to_db,
  a_weighting
} from 'pleco-audio'

// Frequency conversions
const midi = hz_to_midi(440) // 69 (A4)
const note = hz_to_note(440) // 'A4'

// Time conversions
const time = frames_to_time(100, 22050, 512)

// dB conversion
const db = amplitude_to_db(amplitude)

// Perceptual weighting
const weighted = a_weighting(frequencies)
```

### Normalization

```javascript
import { normalize, peak_normalize, rms_normalize } from 'pleco-audio'

// L2 normalization
const normalized = normalize(data, 2)

// Peak normalization
const peakNorm = peak_normalize(audio, 1.0)

// RMS normalization
const rmsNorm = rms_normalize(audio, 0.1)
```

## API Compatibility with Librosa

Pleco Audio aims for API compatibility with Librosa. Most functions use the same:
- Parameter names
- Default values
- Return formats
- Data layouts ([freq][time] for spectrograms)

### Example: MFCC Comparison

**Python (Librosa):**
```python
import librosa

mfccs = librosa.feature.mfcc(
    y=audio,
    sr=22050,
    n_mfcc=20,
    dct_type=2,
    norm='ortho'
)
```

**JavaScript (Pleco Audio):**
```javascript
import { mfcc } from 'pleco-audio'

const mfccs = mfcc(
    audio,
    22050,
    null, // S (pre-computed mel spec)
    20,   // n_mfcc
    2,    // dct_type
    'ortho' // norm
)
```

## Modules Overview

| Module | Functions | Description |
|--------|-----------|-------------|
| **xa-fft** | stft, istft, fft, ifft | Core FFT operations |
| **xa-mel** | melspectrogram, mfcc, dct | Mel-frequency analysis |
| **xa-convert** | hz_to_midi, frames_to_time, etc. | Unit conversions |
| **xa-normalize** | normalize, peak_normalize, etc. | Signal normalization |
| **xa-tempogram** | tempogram, estimate_tempo | Tempo analysis |
| **xa-pitch** | yin, pyin, piptrack | Pitch tracking |
| **xa-decompose** | hpss, nmf | Source separation |
| **xa-rhythm** | beat_track, tempo, plp | Beat and rhythm |
| **xa-segment** | recurrence_matrix, boundaries | Segmentation |
| **xa-effects** | time_stretch, trim, remix | Audio effects |

## Performance

- **Pure JavaScript** - No native dependencies
- **Optimized algorithms** - Efficient implementations
- **Web Worker compatible** - Run in background threads
- **Streaming support** - Process audio in chunks

## Browser Support

Works in all modern browsers with Web Audio API support:
- Chrome 34+
- Firefox 25+
- Safari 7+
- Edge 12+

## Node.js Support

Compatible with Node.js 14+. Works with audio buffers from:
- `node-wav`
- `audio-decode`
- `web-audio-api` (node implementation)

## Development Status

**Current Version:** 1.0.0  
**Librosa Parity:** ~50-60%  
**Status:** Production-ready core features

### Implemented Features

- ✅ Core FFT/STFT with full parameters
- ✅ Mel-frequency analysis (melspectrogram, MFCC)
- ✅ Pitch tracking (YIN, pYIN, piptrack)
- ✅ Beat tracking and tempo estimation
- ✅ Tempogram and tempo variation
- ✅ HPSS and source separation
- ✅ Structural segmentation
- ✅ Audio effects (time stretch, trim, etc.)
- ✅ Comprehensive conversion utilities
- ✅ Normalization and masking

### Roadmap

- 🔄 Additional spectral features
- 🔄 Complete chromagram implementations
- 🔄 Enhanced onset detection
- 🔄 Audio I/O utilities
- 🔄 Real-time processing examples
- 📋 Comprehensive test suite
- 📋 TypeScript definitions
- 📋 Interactive documentation

## Contributing

Contributions welcome! Areas of interest:
- Additional Librosa feature parity
- Performance optimizations
- Browser compatibility
- Documentation improvements
- Example applications

## License

MIT License - See LICENSE file

## Credits

Inspired by and compatible with [Librosa](https://librosa.org/) by Brian McFee et al.

Developed as part of the Pleco-XA audio analysis project.

## Citation

If you use Pleco Audio in academic work, please cite:

```
@software{pleco_audio,
  title = {Pleco Audio: JavaScript Audio Analysis Library},
  year = {2025},
  url = {https://github.com/brookcs3/pleco-xa}
}
```

---

**Made with ♥ for audio analysis in JavaScript**
