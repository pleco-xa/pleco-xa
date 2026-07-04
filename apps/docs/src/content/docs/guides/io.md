---
title: Audio I/O
description: Loading audio in the browser with the audioio namespace, the canonical WAV codec, signal generators, and file/stream helpers.
---

Getting audio in and out is where a browser-native engine earns its keep. The
`audioio` namespace wraps the Web Audio decode path behind a single `load` call,
and the `encodeWav` / `decodeWav` pair is one pure-JavaScript WAV codec that runs
identically in Node, workers, and browsers. Between them you can synthesize test
signals, decode a real file, run analysis, and write the result back out —
without pulling in a native dependency.

The distinction to keep in mind: **`audioio.load` / `play` / `stop` are
browser-only** (they touch `window.AudioContext` and `fetch`), while the signal
math — `tone`, `chirp`, `clicks`, `resample`, `lpc`, and the WAV codec — is pure
and Node-safe.

## Key functions

- `audioio.load(url, { sr?, mono?, offset?, duration? })` — fetch + decode a URL
  to a `Float32Array` (browser only).
- `audioio.play({ loop? })` / `audioio.stop()` — Web Audio playback of the
  currently loaded buffer.
- `audioio.tone(frequency, opts?)` / `audioio.chirp(...)` / `audioio.clicks(...)`
  — deterministic signal generators for tests and demos.
- `audioio.resample`, `audioio.toMono`, `audioio.lpc`, `audioio.autocorrelate`,
  `audioio.zeroCrossings`, `audioio.muCompress` / `audioio.muExpand` — pure DSP
  utilities.
- `encodeWav(channels, sampleRate)` / `decodeWav(buffer)` — the one canonical WAV
  codec. `encodeWav` takes an **array of channel arrays** and returns an
  `ArrayBuffer`; `decodeWav` returns `{ channels, sampleRate }`.
- `file.*` — the browser convenience layer: `example`, `listExamples`,
  `loadFile`, `saveAudio`.
- `fileio.*` — `stream` (chunked reader), `find_files`, `cite`.

## Example

```js
import { audioio, encodeWav, decodeWav } from 'pleco-xa'

// Browser: fetch + decodeAudioData behind one call, resampled to 22.05 kHz mono
const y = await audioio.load('/audio/loop.wav', { sr: 22050, mono: true })

// Anywhere (Node, worker, browser): the one canonical WAV codec.
// encodeWav takes an array of channels; decodeWav returns { channels, sampleRate }.
const wav = encodeWav([y], 22050) // 16-bit PCM interleaved ArrayBuffer
const { channels, sampleRate } = decodeWav(wav)

// Pure signal generators — no AudioContext required, so they run in Node too
const test = audioio.tone(440, { sr: 22050, duration: 1 })
```

## Notes

- **One codec, everywhere.** `encodeWav` / `decodeWav` are pure
  `ArrayBuffer`/`DataView` code, so they behave identically in Node, browsers,
  and workers. Encode is 16-bit PCM interleaved; decode handles PCM 16/24/32-bit
  int and 32-bit float. The 16-bit round-trip max error is exactly `1/32768`.
- **`load(mono: false)` concatenates channels flat.** It does not return a 2-D
  or interleaved array — the channels are laid end to end. For per-channel work,
  decode with `decodeWav` and read `channels[i]`.
- **`resample` is linear interpolation.** It aliases on downsampling, so it is a
  convenience path, not a band-limited resampler — don't use it where fidelity
  matters.
- **Two correct decoders can disagree by 1 LSB.** Chrome's `decodeAudioData`
  maps int16 → float as `s / 32768` in both directions, while `decodeWav` uses
  `s / 0x7fff` for positives. Any bitwise assertion must reference the *same*
  decoder that produced the data.
- **`fileio.stream()` is decode-whole-then-chunk**, not true streaming: memory is
  O(file), `blockLength` counts **samples** and advances by `hopLength` (so
  blocks can overlap). It is a sample-block reader, not a frame-block stream —
  treat it as a chunked reader.
- **Codec coverage is an explicit exception.** Native WAV is built in; other
  codecs come from the browser's `decodeAudioData` or, in Node, an injectable
  decoder hook. `tone` / `chirp` / `clicks` / mu-law / `lpc` are all
  golden-verified.

See the [API reference](/api-by-category/) for full signatures and defaults.
