# Changelog

All notable changes to `pleco-xa` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.5] — 2026-07-05

Documentation release — no code changes.

### Added

- **`VERIFICATION.md` ships in the package** — the quality ledger: a 51-row
  declared-vs-achieved tolerance table, loop acceptance gates (±10 ms golden
  lock on real audio), and documented edge-case contracts. The full reference
  corpus and golden suites are public in the repository (`npm ci && npm test`
  reproduces all 420 assertions).

### Changed

- Test counts updated to the public verification layer (47 suites / 420 tests).
- Package size badge is now a static measured value (~89 kB min+gzip).

## [2.0.4] — 2026-07-04

Documentation release — no code changes. This package now documents itself to
AI agents and humans alike, entirely offline.

### Added

- **`llms.txt` at the package root** — a machine-readable capability map:
  runtime matrix, the three universal contracts, task→function routing,
  execution-verified per-function cards, eight verified advanced-MIR recipes,
  and the full 313-function index. Also served at plecoxa.com/llms.txt.
- **`api-manifest.json`** — the full export surface as JSON (category, import
  form, description per function) for tools and agents.
- **The documentation ships in the tarball** — all guides and the categorized
  API reference under `docs/`, readable from `node_modules` with no fetch.

### Changed

- The npm page now carries the project banner, and the README reflects the
  latest measured test counts and claims.

## [2.0.3] — 2026-07-04

Correctness and honesty release. No API-shape changes; degenerate inputs that
previously produced fabricated results now throw with diagnostics, as the
library's contract has always stated.

### Fixed

- **Long-input crash eliminated.** The FFT core is now an iterative, in-place
  radix-2 transform over preallocated buffers (numerically bit-identical to the
  previous implementation). A 10-minute 44.1 kHz track — which previously
  crashed the process — now runs `beat_track` in ~30 s and `melspectrogram` in
  ~22 s under the default Node heap.
- **Broken TypeScript declaration.** `2.0.2` shipped a syntactically invalid
  `loop/detect.d.ts` that failed `tsc` for TypeScript consumers. Fixed, along
  with nine other declaration defects (unresolvable import specifiers, phantom
  types, over-required option objects).
- **No more fabricated results on degenerate input:**
  - `tempo()` on silent/constant input now throws (previously returned the
    prior's peak, ~117 BPM, for silence).
  - `fastBPMDetect`'s silent fallback (fabricated `confidence: 0.5`) is
    removed; failures rethrow naming the failed stage.
  - `findMusicalLoop` now rejects effectively-silent signals instead of
    scoring them with perfect confidence.
  - FFT/STFT input containing NaN/Infinity now throws with the offending
    index (previously coerced to 0 and produced plausible-looking output).

### Changed

- **The library is silent by default.** All internal logging is gated behind
  the `PLECO_DEBUG` debug flag (87 previously-ungated console calls removed
  from the default paths), enforced by lint rule.

### Infrastructure

- CI now packs the tarball, installs it into a fresh project, and typechecks a
  real consumer under both `moduleResolution: bundler` and `node16` with
  `skipLibCheck: false` — shipping a broken declaration again will fail the
  build.

## [2.0.2] — 2026-07-04

Maintenance release — no API changes.

### Changed

- Rebuilt from cleaned source, so the published bundle and its source maps carry
  no internal build-tooling references.
- Refreshed the npm page (README badges) and the documentation, now published
  from a browsable `/docs` at the repo root.

## [2.0.1] — 2026-07-03

Packaging release — no runtime behavior changes.

### Added

- **Per-namespace subpath exports.** Import only the domain you need:
  `import { mfcc } from 'pleco-xa/feature'`, `pleco-xa/loop`, `pleco-xa/convert`,
  `pleco-xa/segment`, `pleco-xa/sequence`, and 14 more — 19 subpaths in all, each
  a code-split entry point sharing common DSP via internal chunks.
- **TypeScript declarations.** Generated `.d.ts` types ship for the barrel and
  every subpath, so editor autocomplete and type-checking work with no
  `@types/…` package.

### Changed

- Build now emits a self-contained barrel bundle plus multi-entry, code-split
  subpath bundles (shared code deduplicated into `dist/internal/`), with source
  maps.
- `package.json` `exports` map added; `sideEffects: false` for better
  tree-shaking.

## [2.0.0] — 2026-07-03

Ground-up rewrite. Establishes the current API and quality bar. **Breaking** —
see below.

### Added

- **Uniform analysis API.** Every analysis function takes `(Float32Array,
  sampleRate)`, so the same code runs in the browser, Node, and Web Workers.
- **Loop detection** — the signature feature: one `loop.detect(...)` entry point
  with multiple strategies and a single honest confidence score.
- Broad coverage across ~20 domains — beat/tempo tracking, mel/MFCC/chroma and
  spectral descriptors, structural segmentation, DTW & sequence alignment,
  effects, pitch tracking (pYIN), and pure-DSP vocal separation — each validated
  against committed reference fixtures in CI.
- Real-time streaming analyzers and a live-tempo tier.

### Changed

- **Explicit quality tiers, never silent.** Quality is the default; fast/live
  variants are separate, named calls. Nothing silently falls back to a lower
  tier.
- **Zero runtime dependencies**, pure ESM.

### Fixed

- Eliminated a library-wide crash class from `Math.max(...bigArray)` spreads on
  large signals (replaced with stack-safe reducers).
- Functions that cannot produce a valid result now **throw with diagnostics**
  instead of fabricating a number.

### Breaking

- Function signatures, return shapes, and entry points were redesigned for the
  uniform `(samples, sampleRate)` API and the namespace/subpath layout. Code
  written against `1.x` will need updating. See
  [plecoxa.com](https://plecoxa.com) for the current reference.

---

Releases prior to `2.0.0` (the `1.x` line, published May–July 2025) predate this
changelog; their history is available in the git tags.

[2.0.5]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.5
[2.0.4]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.4
[2.0.3]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.3
[2.0.2]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.2
[2.0.1]: https://www.npmjs.com/package/pleco-xa/v/2.0.1
[2.0.0]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.0
