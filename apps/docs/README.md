# @pleco-xa/docs

The documentation-site workspace for pleco-xa — narrative guides, an
auto-generated per-function API reference, and an interactive gallery where
every example runs live in the browser. Built with
[Astro Starlight](https://starlight.astro.build) and served at
**[plecoxa.com](https://plecoxa.com)**.

## Architecture

- **Guides** — the hand-written documentation content lives at the repo root in
  `docs/` (the single tracked source), mirrored into `src/content/docs/` at build
  time by `scripts/mirror-docs.mjs` (a `predev`/`prebuild` hook).
- **API Reference** — generated from the library's JSDoc by
  `starlight-typedoc` (TypeDoc with `allowJs`), reading
  `../../packages/pleco-xa/src/index.js`. Regenerated into `src/content/docs/api/`
  on every build (not committed).
- **Gallery** — the verified demos in `examples/web/` are mirrored into
  `public/demos/` by `scripts/copy-demos.mjs` (a `predev`/`prebuild` hook) and
  embedded as iframes. The demos import the real built bundle
  (`packages/pleco-xa/dist`) and compute live — nothing is faked or pre-rendered.

## Local development

```bash
npm ci                       # from the monorepo root
npm run build:lib            # build packages/pleco-xa/dist (the gallery imports it)
npm run docs                 # → astro dev at http://localhost:4321
```

`npm run docs` runs the `predev` hook first, mirroring the demos and the bundle
into `public/`. If you change library source, re-run `npm run build:lib` so the
gallery embeds the latest bundle.

## Build

```bash
npm run docs:build           # build:lib + astro build → apps/docs/dist/
```

The same command runs in CI (`.github/workflows/test.yml`) on every PR, so a
docs build break fails the check before merge.

## Deploy

Deployment is fully automated by
[`.github/workflows/deploy-docs.yml`](../../.github/workflows/deploy-docs.yml) —
every push to `main` that touches the docs, library, or demos rebuilds and
publishes the site.
