---
title: "Verification & tolerances"
description: The declared numerical tolerances, loop acceptance gates, and edge-case contracts behind every Pleco-Xa claim — pinned by committed reference fixtures and CI.
---

Every numerical claim Pleco-Xa makes is pinned by **committed reference
fixtures** and enforced in CI on every push. The fixtures are frozen JSON
under [`tools/goldens/`](https://github.com/pleco-xa/pleco-xa/tree/main/tools/goldens)
(reference ground truth captured at a known-good point); the suites that
replay them live in
[`packages/pleco-xa/tests/goldens/`](https://github.com/pleco-xa/pleco-xa/tree/main/packages/pleco-xa/tests/goldens).
Everything is public and reproducible with no special tooling:

```bash
npm ci && npm test
```

That runs the full library suite — **47 test files, 420 tests**, of which 21
are fixture-gated golden suites (183 tests) plus the loop-point golden lock on
real audio. The assertion helper (`tests/goldens/helpers.js`) uses the
elementwise criterion `|actual − expected| ≤ atol + rtol·|expected|` with
defaults `rtol 1e-5 / atol 1e-8`, and reports the worst offender on failure.

Two kinds of numbers appear below: **declared** tolerances (the gate CI
enforces) and **achieved** margins (what the current implementation actually
measures, recorded where it was captured). Achieved is typically orders of
magnitude inside declared.

## Declared tolerances

| Domain | Fixture | What is asserted | Tolerance |
| --- | --- | --- | --- |
| Window functions (hann/hamming/blackman, periodic) | `windows.json` | `window(n)` values, 9 cases | rtol 1e-6, atol 1e-7 |
| FFT/IFFT round-trip | synthetic | real-signal round-trip; complex-input preservation | max err < 1e-5 (real), < 1e-6 (complex) |
| STFT magnitude | `stft.json` | \|stft\| matrix + shape (n_fft 512, hop 128) | rtol 2e-3, atol 2e-3 (f32 accumulation) |
| ISTFT round-trip | `istft_roundtrip.json` | `istft(stft(y))` reconstructs `y` | max err < 1e-3 |
| Mel filterbank | `mel_filterbank.json` | matrix + shape (htk/norm variants) | rtol 1e-6, atol 1e-8 |
| Mel spectrogram | `melspectrogram.json` | matrix + shape | rtol 5e-4, atol 1e-4 (measured max rel dev ~1e-4) |
| MFCC | `mfcc.json` | matrix + shape | atol 1e-3 absolute, dB scale (achieved 8.7e-5) |
| MFCC options / lifter | synthetic | 3 throws; lifter weight law `1+(L/2)sin(π(k+1)/L)` | lifter to 12 decimal places |
| Chroma filterbank | `chroma.json` | `filters.chroma` matrix + shape | rtol 1e-6, atol 1e-7 (achieved 5.9e-8 rel / 3.0e-8 abs) |
| Chroma STFT (incl. tuning estimation) | `chroma.json` | `chroma_stft` matrix + shape | rtol 1e-4, atol 1e-5 (achieved 1.8e-6 rel / 2.5e-7 abs) |
| Chroma failure paths | — | 3 throw-message regexes | exact (throws) |
| Spectral descriptors | `spectral_features.json` | centroid, bandwidth, rolloff, flatness, contrast, rms, zcr | centroid/bandwidth rtol 1e-6, atol 1e-3; rolloff bin-exact (atol 1e-9); flatness rtol 1e-6, atol 1e-7; contrast rtol 1e-5, atol 1e-3; rms rtol 1e-6, atol 1e-8; zcr atol 1e-12 |
| Spectral y-path (end-to-end via production f32 stft) | `spectral_features.json` | centroid + flatness | rtol 2e-3, atol 2e-3 (wave-level target) |
| Spectral failure paths | — | 3 throw-message regexes | exact (throws) |
| Onset strength envelope | `onset_strength.json` | options-style and positional call vs expected; length | rtol 1e-4, atol 1e-5 (measured max abs dev ~6e-6) |
| Onset lag padding | `onset_strength.json` | first 3 envelope samples are structural zeros | exact |
| PCEN | `pcen.json` | `pcen(melspectrogram(y))` matrix + shape | rtol 1e-3, atol 1e-4 (achieved 1.8e-7 end-to-end) |
| F0 harmonics | `f0_harmonics.json` | interpolated harmonic output (±Inf restored from JSON null) | rtol 1e-5, atol 1e-5 |
| Tempogram ratio | `tempogram_ratio.json` | shape [13,173]; values; tg-path == y-path; aggregate collapse | values rtol 2e-3, atol 2e-3 (measured 7.6e-8 abs); path equivalences bit-identical; aggregate to 12 dp |
| Tempogram ratio failure paths | synthetic | 9 invalid-input throws with message regexes | exact (throws) |
| Tempo estimation | `tempo_beats.json` | `tempo(y)` vs expected | rel error < 0.02 (gate); achieved bit-exact lag-bin (10 dp) |
| Beat tracking | `tempo_beats.json` | tempo; beat count; beat frames | tempo rel < 0.02; count exact; each beat ±1 frame (gate); achieved exact frames |
| Beat tracking (onset-envelope path) | `tempo_beats.json` | beats from `{onsetEnvelope}` | exact |
| Beat tracking (class wrapper) | `tempo_beats.json` | `BeatTracker.beatTrack` tempo + beats | tempo to 10 dp; beats exact |
| Beat conversions / silence / failures | `tempo_beats.json` + synthetic | frames→samples/time identities; silence → 0 BPM + `[]`; 6 invalid-input throws | exact |
| pYIN pitch tracking | `pyin.json` | shapes/types; `voiced_prob` ∈ [0,1]; voicing classification; NaN/finite f0 contract; 2 throws | voicing exact except transition frames (frames whose expected voicing differs from a neighbor — genuinely ambiguous at pitch/silence boundaries); voiced f0 deviation < 1.0 semitone (achieved grid-exact) |
| HPSS (magnitude) | `hpss.json` | H and P at margin 1.0 and 2.0; shape | rtol 1e-3, atol 1e-4 (achieved 1.61e-5 / 1.41e-5 abs) |
| HPSS invariants | `hpss.json` | H+P==S at margin 1; masks ∈ [0,1] summing to 1; complex phase carried | reconstruction < 1e-9; mask sum to 9 dp; complex < 1e-9 |
| Softmask | synthetic in-suite case (fixed 3×3 matrices) | power=2 values; power=∞ hard mask; throws | to 6 dp; hard mask exact |
| Waveform-level HPSS | `hpss.json` | yh+yp≈y (interior); `harmonic()`/`percussive()` agree with `hpss()` | interior worst < 1e-3; agreement to 9 dp |
| Trim / split | `effects.json` | trim index + slice identity; split intervals; silent-signal empty slice | exact (integer indices/intervals) |
| Preemphasis / deemphasis | `effects.json` + synthetic | output; round-trip; block streaming via `zf` | rtol 1e-5, atol 1e-6 (achieved 5.96e-8 abs); round-trip < 1e-4; streaming to 6 dp |
| Phase vocoder | `phase_vocoder.json` | shape; per-bin magnitude; complex values vs spectral peak | magnitude \|Δ\| ≤ 1e-3 + 1e-3·\|expected\| (achieved 9.3e-4 worst ratio); complex \|Δz\| ≤ 1e-3·peak + 1e-3·\|z\| (achieved ≤ 4.9e-4 of peak) |
| time_stretch / pitch_shift contracts | `phase_vocoder.json` (input reuse) | length == round(n/rate); all finite; duration preserved; throws on rate ≤ 0 | exact |
| Remix ordering | synthetic | interval order preserved; zero-crossing snap bounds; out-of-bounds throws | order exact; with `align_zeros` the first sample must land on a zero crossing of the test sine (\|out[0]\| < 0.07, one sample-step of amplitude) and length stays within crossing-snap jitter of the 400-sample input (∈ (390, 400]) |
| Dynamic time warping | `dtw_segment.json` | cumulative cost D[-1][-1]; warping path; backtracking | D rel < 1e-6; path exact; backtrack exact |
| Recurrence / segmentation | `dtw_segment.json` | connectivity 0/1; affinity; recurrence_to_lag; agglomerative boundaries | connectivity/lag/boundaries exact; affinity rtol 1e-5, atol 1e-8 |
| Laplacian segmentation (two-feature form) | `laplacian_seg.json` | boundaries; segment count; determinism; degenerate-bandwidth throw; 2 input throws | exact (permutation/sign invariant) |
| RQA alignment | `rqa.json` | path; score | path exact; score to 10 dp |
| RQA degenerate paths | synthetic | negative gap throws; all-zero matrix → empty path | exact |
| HMM transition matrices | `sequence_extra.json` | uniform/loop/cycle/local matrices; rows sum to 1 | atol 1e-6; row sums to 6 dp |
| Discriminative Viterbi | `sequence_extra.json` | integer state path; Bayes-direction pin | exact |
| Sequence regression guards | synthetic | cycle self-prob on diagonal; 6 constructor throws | diagonal to 12 dp; throws exact |
| Symmetric eigendecomposition | `linalg.json` | eigenvalues ascending + values; reconstruction V·diag·Vᵀ; orthonormality VᵀV=I; 1×1 case | eigenvalues rtol 1e-6, atol 1e-6; reconstruction atol 1e-9; orthonormality atol 1e-9; flat-vs-2D atol 1e-12 |
| Normalized graph Laplacian | `linalg.json` | L matrix; eigh(L) eigenvalues; diagonal conventions | L atol 1e-9; eigenvalues rtol 1e-6, atol 1e-6; diagonal to 12 dp |
| K-means clustering | `cluster.json` | canonicalized labels; centers; inertia | labels exact; centers atol 1e-2 (fixture is float32); \|inertia diff\| ≤ 1e-3 |
| K-means determinism / typing | `cluster.json` + synthetic | same-seed determinism; `Int32Array` labels; 5 invalid-input throws | exact |
| Unit conversions (Hz/mel/MIDI/dB/frames/time/samples) | `conversions.json` | 11 conversion functions vs expected arrays | rtol 1e-5, atol 1e-6 |
| Typed-array dispatch | `conversions.json` | `hz_to_mel(Float32Array)` finite + values | rtol 1e-5, atol 1e-6 |
| Frequency weighting curves A/B/C/D | `weighting.json` | `*_weighting(frequencies)` vs expected | rtol 1e-4, atol 1e-4 |
| FFT bin frequencies | `fft_frequencies.json` | `fft_frequencies(sr, n_fft)` vs expected | rtol 1e-6, atol 1e-6 |

## Loop acceptance gates

[Loop detection](../guides/loop.md) — the signature capability — has its own
lock, on **real WAVs**, not synthetic signals.

**The golden lock** (`tests/loop-goldens.test.js` vs
`tools/goldens/loop_goldens.json`): `loop.detect(…, { strategy: 'fast' })` runs
on four real recordings (48 kHz and 44.1 kHz, 2.6 s to 45 s) and the detected
loop start and end must each land within **±441 samples (±10 ms @ 44.1 kHz)**
of the pinned points. A Node spot-run of the same pipeline
([`examples/node/loop-fast.mjs`](https://github.com/pleco-xa/pleco-xa/blob/main/examples/node/loop-fast.mjs))
additionally checks **BPM within ±0.1** of the pinned value — and measures all
four files landing within **Δ ≤ 1 sample** of the pinned loop points, with BPM
exact. Confidence is asserted on the unified 0..1 scale but deliberately
**not** pinned (the legacy pipeline pegged it at 1.0; the fixture meta
documents this).

**Per-strategy quality gates** — every strategy throws a diagnostic naming the
failed gate; none falls back to another strategy or fabricates a result:

- **Input gate (all strategies):** buffer must expose `getChannelData()`,
  `sampleRate > 0`, and a non-empty channel 0 — otherwise `loop.detect` rejects.
- **`fast`:** energy-based; golden-locked as above. Effectively-silent signals
  are rejected by the signal-evidence gate (the message names the RMS
  threshold). Its BPM stage rethrows naming the failed step — the fabricated
  `confidence: 0.5` fallback was removed in 2.0.3.
- **`precise`:** tempo gate (no usable tempo estimate → throws; pass
  `options.bpm` to supply one) and candidate gate (no onset pair inside the
  search window → throws).
- **`musical`:** tempo gate, then candidate gate when no bar length fits the
  material.
- **`recurrence`:** the only strategy with a `minConfidence` gate (default
  0.1) — a best candidate below it throws, suggesting alternatives. Also an
  embedding gate on too-short input and a repetition-evidence gate on silence.
  `hopLength` auto-scales to respect `maxFrames` (recorded in diagnostics —
  never a silent strategy switch). Its result carries no `bpm` field.
- **Unknown strategy:** throws, listing the four valid names.

## Documented edge cases

These are contracts, verified by the shipped test suite and demonstrated
against the published build:

| Input class | Guaranteed behavior |
| --- | --- |
| Silence / constant signal | `tempo()` throws (`cannot estimate tempo: onset envelope is all zeros`); `quickTempo` throws (no onsets in window); `loop.detect` rejects naming the RMS threshold. `beat_track` returns `{tempo: 0, beats: []}` and `onsetDetect` returns zero onsets — valid empties, never a fabricated BPM. |
| NaN / ±Infinity in input | Throws naming the offending index and value (e.g. `stft: input contains non-finite values at index 7 (value: NaN)`). Corrupted audio is never coerced to 0 and laundered into plausible output. |
| Empty input | Throws (`y must not be empty`; `loop.detect: input gate failed — channel 0 is empty`). |
| 1-sample input | Valid: framed transforms return a single zero-padded frame (`stft` → 1025×1, `melspectrogram` → 128×1, `rms` → length 1). `tempo()` throws its all-zeros gate (no onset content exists); `beat_track` returns `{tempo: 0, beats: []}`. |
| Wrong sample-rate assumption | `sr` is **never** inferred — every analysis call defaults to `sr = 22050`. Passing 44.1 kHz samples without `{ sr: 44100 }` returns plausible but wrong numbers with no error. Supplying `sr` is the caller's side of the contract. |
| Plain `Array` instead of `Float32Array` | Accepted — numeric Arrays flow through the DSP core (demonstrated on `tempo`, `stft`, `feature.rms`, `onset_strength`). `Float32Array` remains the documented input type. |
| 10-minute 44.1 kHz track | Valid: `beat_track` in ~30 s and `melspectrogram` in ~22 s under the default Node heap (iterative in-place FFT since [2.0.3](./changelog.md) — the former long-input crash is eliminated). |

## What this does not cover

Honesty section:

- **Fixtures are frozen snapshots.** They pin the output at a known-good
  point and prove non-regression against that reference ground truth — they
  are not a live cross-check against any external system. Regeneration is a
  **maintainer operation**, done only when an intentional algorithm change
  invalidates the pinned values, and reviewed like code
  ([fixture policy](https://github.com/pleco-xa/pleco-xa/blob/main/tools/goldens/README.md)).
- **Loop confidence values are range-asserted, not pinned** — a documented
  decision recorded in the fixture metadata.
- **Performance numbers are measurements, not CI gates.** The 10-minute-track
  timings above were measured on a development machine and are stated as
  observations.
- **Browser-only surfaces** (canvas rendering, playback transport) are
  exercised by unit and demo tests, not numerical fixtures — there is no
  meaningful reference ground truth for pixels and scheduling.
