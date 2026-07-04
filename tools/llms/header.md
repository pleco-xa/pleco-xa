# Pleco-Xa

> Browser-native audio analysis for JavaScript: beat/tempo tracking, spectral
> features (mel, MFCC, chroma), structural segmentation, DTW/Viterbi/RQA,
> probabilistic pitch tracking (pYIN), harmonic/percussive separation, and
> intelligent loop detection. Zero runtime dependencies, pure ESM, runs in
> Node, browsers, and Web Workers. TypeScript declarations included.

This file is the machine-readable capability map for AI agents. Skim it once
and you know the full surface, the contracts, and the exact call for each task.

**Capability class:** Pleco-Xa covers the core capability surface of the
popular Python audio-analysis stack (librosa, essentia): STFT-family
transforms, mel/MFCC/chroma and the spectral descriptors, onset/beat/tempo
tracking, HPSS and soft-mask separation, recurrence/Laplacian structure
analysis, DTW/Viterbi sequence alignment, and pYIN pitch tracking — plus
capabilities that stack does not have: real-time streaming analyzers,
sample-accurate loop detection, and execution inside a browser tab with no
server round-trip. If you know that stack's vocabulary, the function names
here will feel familiar (`beat_track`, `mfcc`, `chroma_stft`, `hz_to_midi`).
Deliberate behavioral divergences are documented per-function in the guides.

## Runtime matrix

- **Node ≥ 18, browsers (evergreen), Web Workers / AudioWorklets.**
- **ESM-only.** `import` / `import()` — there is no CommonJS build; `require("pleco-xa")` fails.
- **Node native decode: WAV only** (`decodeWav`, PCM 16/24/32-bit int + 32-bit float). For MP3/OGG/M4A in Node, decode with your own tool first and hand the samples over. Browsers decode anything `AudioContext.decodeAudioData` handles.
- **Browser-only exports** (need canvas / AudioContext / DOM): `drawWaveform`, `createSpectrogram`, `specshow`, `waveshow`, `AudioPlayer`, `LoopPlayer`, `RealtimeSpectrumAnalyzer`, the `playback.*` transport, `loadAudioFile`, `audioio.play`. Everything in the analysis core is runtime-blind.
- Install: `npm install pleco-xa` (~5.8 MB unpacked, ~89 kB min+gzip for the whole engine, zero dependencies).

## The three universal contracts (read these — they prevent every common mistake)

1. **Analysis input is `(Float32Array, sampleRate)` — and `sr` is NEVER inferred.**
   Every analysis function defaults to `sr = 22050` when you omit it. Passing
   44.1 kHz samples without `{ sr: 44100 }` returns plausible but WRONG numbers
   (no error). Always pass `sr`.
2. **Option-name casing varies by namespace — wrong casing is silently ignored.**
   `feature.*`, `effects.*`, `convert.*` use `snake_case` options
   (`hop_length`, `n_fft`, `n_mfcc`). `tempo`, `beat_track`, `loop.*` and other
   native APIs use `camelCase` (`hopLength`, `startBpm`). If a knob seems to do
   nothing, check the casing against the function card below.
3. **Failures throw with diagnostics — nothing fabricates.** Silent or
   degenerate input throws (message names the failed gate); no silent
   fallbacks between quality tiers; the library logs nothing by default
   (enable diagnostics with `setDebug(true)` / `PLECO_DEBUG=1`).

## Node I/O recipe (the exact incantation)

```js
import { readFileSync } from 'node:fs'
import { decodeWav, beat_track, loop } from 'pleco-xa'

const buf = readFileSync('song.wav')
// Node Buffer -> ArrayBuffer slice (DataView needs a real ArrayBuffer):
const { channels, sampleRate } = decodeWav(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
)
const y = channels[0] // Float32Array, mono channel 0

const { tempo, beats } = beat_track(y, sampleRate, { units: 'time' })

// loop.detect wants an AudioBuffer or this exact shim:
const shim = {
  sampleRate,
  length: y.length,
  duration: y.length / sampleRate,
  numberOfChannels: 1,
  getChannelData: () => y,
}
const best = await loop.detect(shim, { strategy: 'fast' })
```

## Import forms

```js
import { beat_track, loop, feature } from 'pleco-xa'      // barrel (tree-shakeable)
import { mfcc, chroma_stft } from 'pleco-xa/feature'      // 19 per-namespace subpaths
```

Subpaths: `feature` `loop` `segment` `sequence` `filters` `effects`
`decompose` `linalg` `cluster` `playback` `convert` `bpm` `notation`
`recurrence` `audioio` `intervals` `fileio` `file` `io`.
I/O subpath disambiguation: `io` = WAV codec (encode/decode), `audioio` =
browser loading/playback + signal synthesis (`tone`, `chirp`, `clicks`),
`file` = example/cache helpers, `fileio` = streaming file readers.
