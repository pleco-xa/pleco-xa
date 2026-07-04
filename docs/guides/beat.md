---
title: Beat & tempo
description: The canonical Ellis dynamic-programming beat tracker, tempo estimation, the quick tier, tempograms, and the bpm stability analyzer.
---

Rhythm analysis in Pleco-Xa is tiered, and the tiers are honest about what they
promise. At the top is `beat_track` — the canonical Ellis dynamic-programming
tracker, with numerically exact tempo and exact beat frames. Below it sits
`quickTempo`, an explicit fast tier
for live meters, and the `bpm` namespace, a windowed stability analyzer for
watching tempo *drift* over a performance. No tier fabricates a result: failure
paths throw, and there are no default BPMs.

`beat_track(y, sr)` returns `{ tempo, beats }`. The pipeline is
`onset_strength` (median aggregate) → `tempo` with the log-normal prior
→ dynamic-programming peak picking consistent with the estimated tempo.

## Key functions

- `beat_track(y, sr?, opts?)` — canonical DP beat tracker; returns
  `{ tempo, beats }`. Accepts a scalar `bpm`, or a **per-frame BPM array** (from
  `tempo(..., { aggregate: null })`) to track time-varying tempo.
- `tempo(y, opts?)` — tempogram-based tempo estimate; scalar by default,
  per-frame with `{ aggregate: null }`.
- `quickTempo(y, sr?, opts?)` — the explicit quick tier; lands in the same lag
  bin as `tempo` with a measured (non-fabricated) confidence.
- `beat_sync(data, beats, ...)` — beat-synchronous feature aggregation.
- `beatTrack`, `fastBPMDetect`, `extractTempo`, `detectBPM` — fast-heuristic
  helpers.
- `compute_tempogram`, `tempogram`, `fourier_tempogram`, `tempogram_ratio` —
  tempogram family.
- `find_tempo_candidates`, `detect_tempo_multiples`, `analyze_groove`,
  `findDownbeatPhase`, `findFirstDownbeat` — downbeat / groove helpers.
- `bpm.*` — the tempo-drift/stability analyzer (`analyzeWithProgress`,
  `estimateGlobalTempo`, `analyzeTempogram`, …).

## Example

```js
import { beat_track, tempo, quickTempo } from 'pleco-xa'

// y is a Float32Array time series (e.g. from audioio.load), sr its sample rate
const { tempo: bpm, beats } = beat_track(y, sr)
bpm // scalar BPM
beats // beat frame indices (default units: 'frames')

// Tempo alone (scalar), or per-frame for time-varying material
const scalar = tempo(y, { sr })
const perFrame = tempo(y, { sr, aggregate: null })

// Feed the per-frame curve back in to track a tempo ramp
const drifting = beat_track(y, sr, { bpm: perFrame })

// Live/quick tier — same lag bin, honest confidence
const quick = quickTempo(y, sr)
```

## Notes

- **Tempo is lag-quantized.** The tempogram lag bins are
  `60·sr / (hop·k)`, so a true 120 BPM click train legitimately reports
  ~117.45 at hop 512. The honest bound is `|err| ≤ 7 BPM` at that hop — don't
  assert tempo on a knife edge.
- **Tempo and beats are pinned.** `beat_track`'s tempo *and* beat frames are
  pinned by exactness tests in CI — and hold even after a 16-bit WAV
  encode/decode round trip.
- **The quick tier never impersonates the canonical one.** `quickTempo` is
  explicitly the fast path; it is only actually faster than the canonical tier at
  a *matched* hop length (~2.2× at hop 512). Compare tiers at the same hop.
- **`bpm` is a drift analyzer, not the primary source.** Its windowed pass now
  tracks tempo changes (a 100→140 BPM ramp reads ~99→144 across windows) — use
  it to characterize *stability*, never as your headline BPM.
- **`plp` and `beat_sync` have caveats.** `plp` is a windowed-autocorrelation
  pulse-strength approximation, not a Fourier-tempogram PLP;
  `beat_sync` drops audio after the last beat boundary (it emits
  `beats.length − 1` segments).
- **Use `beat_track`, not the legacy detector.** The DP tracker (backed by
  `onset_strength` + `tempo`) is the canonical engine; the old standalone
  BPM detector is superseded.

See the [API reference](../api-by-category.md) for full signatures and defaults.
