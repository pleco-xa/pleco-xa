# Golden Fixtures

Committed reference fixtures: frozen reference ground truth that pins the
numerical output of Pleco-Xa's DSP and analysis functions. Each file holds a
set of cases — inputs plus expected outputs captured at a known-good point —
and the suites under `tests/goldens/` replay them in CI, failing on any
numerical drift beyond the per-suite tolerance.

These files are **deliberately frozen**. They are inputs to the test suite,
not build artifacts — do not regenerate them as part of routine development.
Regeneration is a maintainer operation, done only when an intentional
algorithm change invalidates the pinned values, and it should be reviewed as
such.

`loop_goldens.json` is a special case: in addition to pinning numerical
output on synthetic signals, it pins detected loop points on real audio to
±441 samples (±10 ms @ 44.1 kHz).

## Inventory

| File | Domain | Size |
| --- | --- | --- |
| `chroma.json` | Chroma filterbank + chroma features | 500 KB |
| `cluster.json` | K-means clustering | 2.8 KB |
| `conversions.json` | Unit conversions (Hz/mel/MIDI/dB/frames/time/samples) | 2.0 KB |
| `dtw_segment.json` | Dynamic time warping + segmentation utilities | 41 KB |
| `effects.json` | Effects: trim, split, preemphasis | 935 KB |
| `f0_harmonics.json` | F0 harmonic extraction | 2.7 KB |
| `fft_frequencies.json` | FFT bin frequencies | 27 KB |
| `hpss.json` | Harmonic/percussive source separation | 2.2 MB |
| `istft_roundtrip.json` | STFT → ISTFT reconstruction round-trip | 222 KB |
| `laplacian_seg.json` | Laplacian segmentation | 8.5 KB |
| `linalg.json` | Eigendecomposition + normalized graph Laplacian | 2.7 KB |
| `loop_goldens.json` | Loop-point detection on real audio (±441 samples) | 1.9 KB |
| `mel_filterbank.json` | Mel filterbank construction | 116 KB |
| `melspectrogram.json` | Mel spectrogram | 876 KB |
| `mfcc.json` | MFCC | 468 KB |
| `onset_strength.json` | Onset strength envelope | 851 KB |
| `pcen.json` | Per-channel energy normalization (PCEN) | 256 KB |
| `phase_vocoder.json` | Phase vocoder time-stretch | 1.5 MB |
| `pyin.json` | pYIN pitch tracking | 502 KB |
| `rqa.json` | Recurrence quantification analysis | 8.4 KB |
| `sequence_extra.json` | Transition matrices + discriminative Viterbi | 2.2 KB |
| `spectral_features.json` | Spectral descriptors (centroid, bandwidth, contrast, rolloff, flatness, RMS, ZCR) | 462 KB |
| `stft.json` | STFT magnitude | 461 KB |
| `tempo_beats.json` | Tempo estimation + beat tracking | 850 KB |
| `tempogram_ratio.json` | Tempogram ratio features | 629 KB |
| `weighting.json` | Frequency weighting curves | 1.3 KB |
| `windows.json` | Window functions | 155 KB |
