# Contributing to Pleco-Xa

Thanks for your interest in improving Pleco-Xa! This guide covers how the repo is
laid out, how to get set up, and what a good contribution looks like.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Repository layout

Pleco-Xa is an npm-workspaces monorepo:

| Path | What it is |
| --- | --- |
| `packages/pleco-xa` | **The library** — the only published package. Source in `src/`, built bundles in `dist/`. |
| `apps/docs` | The documentation site ([plecoxa.com](https://plecoxa.com)) — Astro Starlight + auto-generated API reference. |
| `apps/demo` | A standalone Astro demo app (also hosts shared audio fixtures the docs gallery reuses). |
| `examples/` | Proof-of-work demos — `node/` (terminal PASS/FAIL scripts) and `web/` (browser pages). Every one asserts a real result. |
| `tools/goldens` | Committed reference fixtures that pin numerical output in the test suite. |

The library ships **zero runtime dependencies** — please keep it that way. Dev
dependencies (build, test, lint) are fine; anything that would end up in a
consumer's bundle is not.

## Getting set up

Requires **Node ≥ 22.12** (see `engines` in `package.json`). Install exactly what's locked:

```bash
npm run setup      # alias for `npm ci` — reproducible workspace install
```

## Everyday commands

```bash
npm test           # library test suite (Vitest)
npm run build      # build the library (packages/pleco-xa/dist)
npm run lint       # ESLint over the library + tooling
npm run format     # Prettier — write
npm run docs       # docs site dev server
npm run demos      # serve the example gallery at http://localhost:5757
```

## Making a change

1. **Branch** off `main`.
2. **Write a test first** where it makes sense. Numerical DSP changes should be
   validated against committed reference fixtures — see
   [Validating numerical work](#validating-numerical-work).
3. Keep the change focused. Match the surrounding code's style; Prettier and
   ESLint enforce the mechanical parts (`npm run format && npm run lint`).
4. **Run the full check** before pushing:
   ```bash
   npm run lint && npm test && npm run build:lib
   ```
5. Open a pull request. Fill in the template — describe *what* changed and *how
   you verified it*. Link any related issue.

CI runs the test suite, builds the library, the demo, and the docs site, and
runs a Node import smoke test. All of it must be green to merge.

## Validating numerical work

Pleco-Xa's core promise is that results are *correct*, not just plausible. Any
change to an analysis function must keep its committed reference fixtures green:

```bash
npm test           # runs the fixture-backed suite
```

A new capability should ship with a fixture that pins its output to
independently-computed ground truth — a demo that prints `PASS` without
asserting against ground truth is not proof.

## Commit and PR conventions

- Write commit messages in the imperative mood ("Add chroma CQT variant", not
  "Added…"). A short subject line, a blank line, then the why if it isn't
  obvious.
- Keep PRs reviewable — split unrelated changes.
- Don't commit generated output, `.venv`, audio scratch files, or editor/AI
  tooling config; `.gitignore` already covers the common cases.

## Reporting bugs and requesting features

Use the issue templates (**New issue** on GitHub). For anything security-related,
follow [SECURITY.md](SECURITY.md) — please don't open a public issue.

## Design principles (please preserve these)

- **Zero runtime dependencies**, pure ESM, browser + Node + Web Worker.
- **Explicit tiers, never silent.** Quality is the default; fast/live variants
  are separate named calls. A function that can't produce a valid result
  **throws with diagnostics** — it never fabricates a number or silently falls
  back.
- **Uniform API:** analysis functions take `(Float32Array, sampleRate)`.

Thanks again — every fixture-backed fix makes the library more trustworthy.
