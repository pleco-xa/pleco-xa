# Changelog

All notable changes to `pleco-xa` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[2.0.1]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.1
[2.0.0]: https://github.com/pleco-xa/pleco-xa/releases/tag/v2.0.0
