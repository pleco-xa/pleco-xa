---
title: Glossary
description: Short definitions of the audio and signal-processing terms used across the Pleco-Xa guides.
---

Compact definitions for the domain terms that recur across the
[guides](/guides/loop/). Each is scoped to how Pleco-Xa uses it.

**STFT (Short-Time Fourier Transform)**
: The audio split into short overlapping frames, each transformed to the
frequency domain. The foundation of nearly every spectral feature — magnitude
gives you a spectrogram, and the complex output preserves phase for
reconstruction. Pleco-Xa's `stft`/`istft` are fixture-gated (magnitude exact,
round-trip verified).

**Hop length**
: The number of samples the STFT window advances between consecutive frames. A
smaller hop means more frames (finer time resolution, more computation); a larger
hop means fewer. It sets the frame rate of everything downstream — spectrograms,
onset envelopes, chroma.

**Mel spectrogram**
: A spectrogram whose frequency axis is warped onto the mel scale, which spaces
bands the way human hearing does — roughly linear below ~1 kHz, logarithmic
above. The usual input to MFCCs and onset strength.

**Chroma**
: A 12-bin representation that folds all octaves onto the twelve pitch classes
(C, C♯, D, …). It captures harmony and melody while ignoring register, which is
what makes it useful for structure and recurrence analysis.

**Onset strength**
: A per-frame envelope that peaks when new energy appears — a note attack, a
drum hit. Computed from positive spectral flux (frame-to-frame increases in a
log-power mel spectrogram). The raw material for beat tracking and tempo.

**Tempogram**
: A time-by-tempo representation showing how strongly each tempo is expressed at
each moment — essentially a "spectrogram of rhythm" derived from the onset
envelope. Used to estimate and track tempo, including tempo that drifts over
time.

**Beat tracking**
: Finding the sequence of beat instants in audio, given (or jointly with) a
tempo estimate. Pleco-Xa's `beat_track` returns exact frames, pinned by CI
fixtures.

**HPSS (Harmonic-Percussive Source Separation)**
: Splitting a spectrogram into a harmonic layer (stable across time — sustained
tones) and a percussive layer (stable across frequency — transients), via median
filtering along each axis. The masked components sum back to approximately the
original.

**Recurrence matrix**
: A frame-by-frame self-similarity map: cell `(i, j)` marks whether frames `i`
and `j` are similar (as neighbors, or by affinity). Diagonal stripes reveal
repeated sections — the backbone of both structural segmentation and the
`recurrence` loop strategy.

**RQA (Recurrence Quantification Analysis)**
: Quantifying the structure in a recurrence matrix — in particular finding the
best diagonal alignment path. Pleco-Xa's `sequence.rqa` recovers that path
exactly, and the loop `recurrence` strategy can use an RQA path as a lag
candidate.

**DTW (Dynamic Time Warping)**
: An algorithm that finds the lowest-cost alignment between two sequences that
may run at different speeds, by warping the time axis. Used to align a
performance to a reference. Pleco-Xa's `dtw` is bit-exact in cost with an exact
warping path.

**PCEN (Per-Channel Energy Normalization)**
: An adaptive gain / dynamic-range compression applied per frequency channel,
often used in place of log scaling before onset or event detection. Numerically
exact and fixture-gated in CI, and equivalent whether run whole-signal or
block-by-block.

**Laplacian segmentation**
: The McFee-Ellis method for finding structural boundaries: build a recurrence
graph, take its normalized Laplacian, embed with the smallest eigenvectors, and
cluster. Pleco-Xa assembles it from verified `eigh`, `laplacian`, and `kmeans`
primitives.

**Loop point**
: The sample-accurate start and end of a region that repeats seamlessly. Finding
them — with an honest confidence and clean, click-free boundaries — is
Pleco-Xa's signature capability. See the [Loop guide](/guides/loop/).

**Normalized cross-correlation (NCC)**
: A similarity score in `[-1, 1]` between two signals after removing their means
and normalizing by their standard deviations. Pleco-Xa measures loop confidence
by correlating a candidate loop against the audio that follows it — `1` means it
repeats verbatim.

**Zero crossing**
: A sample where the waveform crosses zero amplitude. Snapping a loop boundary to
the nearest zero crossing removes the click at the seam without moving the point
audibly — the job of `DynamicZeroCrossing`.
