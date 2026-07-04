---
title: Core DSP & conversions
description: FFT, STFT/ISTFT, analysis windows, and the convert namespace for frequency, note, dB, and frame/time bookkeeping.
---

The core layer is the DSP foundation everything else stands on: the fast Fourier
transform and its short-time variant, the analysis windows that shape each
frame, and the `convert` namespace of unit conversions. If you are building your
own feature or writing a custom spectrogram, this is where you start.

Pleco-Xa works in **arrays in, arrays out**. `fft` takes a signal and returns
complex bins; `stft` takes a `(y, sr)`-style time series and returns a
`[freq][time]` grid of `{ real, imag }` objects — a frequency-major layout, so a
spectrogram is a plain 2-D array you can index directly.

## Key functions

- `fft(signal)` / `ifft(spectrum)` — one-dimensional complex FFT and its
  inverse. `fft` zero-pads to the next power of two, so the output length may
  exceed the input.
- `stft(y, n_fft?, hop_length?, win_length?, window?, center?, pad_mode?)` —
  short-time Fourier transform, `[freq][time]` of `{ real, imag }` bins.
- `istft(D, hop_length?, win_length?, window?, center?, length?)` — inverse
  STFT; round-trips `istft(stft(y))` to ~1e-7 in the interior.
- `fft_frequencies(sr, n_fft)` — the center frequency of each FFT bin.
- `magnitude(spectrum)` / `phase(spectrum)` / `power(spectrum)` /
  `polar_to_complex(mag, phase)` — 1-D helpers over `fft` output.
- `hann_window(n)` / `hamming_window(n)` / `blackman_window(n)` — periodic
  (`fftbins=True`) analysis windows.
- `convert.*` — `hz_to_mel` / `mel_to_hz`, `hz_to_midi` / `midi_to_hz`,
  `note_to_hz` / `hz_to_note`, `amplitude_to_db` / `power_to_db` /
  `db_to_amplitude` / `db_to_power`, plus `frames_to_time` / `time_to_frames`,
  `samples_to_time`, `mel_frequencies`, and the A/B/C/D frequency-weighting
  curves.

## Example

```js
import { stft, istft, convert } from 'pleco-xa'

// A 1-second 220 Hz test tone at 22.05 kHz
const sr = 22050
const y = Float32Array.from({ length: sr }, (_, i) =>
  Math.sin((2 * Math.PI * 220 * i) / sr),
)

// Short-time Fourier transform -> [freq][time] grid of { real, imag } bins
const D = stft(y, 2048, 512) // n_fft = 2048, hop = 512

// Reconstruct the signal; the interior matches to ~1e-7
const yHat = istft(D, 512)

// Frequency-domain conversions live under the convert namespace
convert.hz_to_mel(1000) // 15.0 (Slaney), the 1 kHz seam
convert.hz_to_note(440) // "A4"
convert.frames_to_time([0, 1, 2], sr, 512) // frame indices -> seconds
```

## Notes

- **Windows are periodic.** `hann_window`, `hamming_window`, and
  `blackman_window` build `fftbins=True`-style periodic windows (the analysis
  convention), fixture-verified for exactness — not the symmetric filter-design
  variant.
- **The round trip is clean.** `ifft(fft(x))` is bit-exact on small integer
  inputs and `istft(stft(y))` matches to a ~1e-7 interior max error, so STFT
  processing chains are safe to build on.
- **`magnitude` / `phase` / `power` are 1-D only.** They operate on `fft`
  output where each element carries `.real` / `.imag`. Handing them a
  `[freq][time]` STFT matrix returns garbage silently — compute magnitude
  per cell (`Math.hypot(bin.real, bin.imag)`) for spectrograms.
- **Slaney seam values are float-exact, not literal.** `convert.hz_to_mel(1000)`
  is `15 − 1.8e-15` and `mel_to_hz(15)` is `1000 + 2.3e-13` (200/3 roundoff in
  IEEE-754 float64). Assert these identities at `1e-9`, never with `===`.
- **`hz_to_mel` defaults to the Slaney formula** (`htk=false`); pass
  `htk: true` for the HTK log form. `midi_to_hz` / `midi_to_note` reject notes
  outside `[0, 127]`.
- `a_weighting(1000)` returns `+0.000344 dB`, not exactly 0 — the standard
  2.0 dB offset leaves a ~3e-4 residual. "Zero at 1 kHz" holds to three
  decimals.

See the [API reference](/api-by-category/) for full signatures and defaults.
