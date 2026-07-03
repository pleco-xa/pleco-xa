# Pleco-Xa Documentation Site — Design (Ship Phase, part 1: docs)

**Date:** 2026-07-03
**Status:** Design (decisions made by best judgment while Cameron was away — flagged for review)
**Goal:** A thorough documentation site for pleco-xa using librosa's documentation architecture as the structural template — per-function API reference (auto-generated, "logs each function"), narrative guides, and an interactive gallery — produced as both committed markdown and a built website.

## 1. Decisions (review points)

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Astro Starlight** + `starlight-typedoc` + `typedoc-plugin-markdown` | Repo is already an Astro monorepo; islands embed the live demos natively; TypeDoc auto-generates the per-function reference from pleco's JSDoc (validated 2026-07-03 on `encodeWav`/`mel_to_hz` — full signature, params, returns, source link) and emits markdown (satisfies "md AND website"). |
| Narrative depth | **Full** (per-namespace conceptual guides + tutorial + advanced) | Cameron: "thru and thru … logging each function, etc — all this kinda thing." |
| Dev-state strip pass | **Separate follow-on goal** | This goal's text is entirely documentation; the strip pass is a defined sibling ([[pleco-xa-goal-split]]). Docs describe current shims honestly. |
| Location | `apps/docs/` in the monorepo | Beside `apps/demo`; same toolchain. |
| Hosting | plecoxa.com via Cloudflare Pages | Domain is on Cloudflare ([[pleco-xa-domain]]); Astro static build deploys to Pages. |
| Positioning | pleco-first; "Coming from librosa" is a discovered cross-reference page, never the banner | [[pleco-xa-identity]]. |

If Cameron redirects any of these, the spec and plan adjust before implementation continues past the scaffold.

## 2. Toolchain validation (done)

TypeDoc 0.28 with `typedoc-plugin-markdown`, `allowJs: true`, run on pleco's actual `.js` modules, produced per-function markdown pages with: signature + inferred types (from `@param {type}`), one-line and full description, per-parameter docs, typed returns, and a **source-file:line link**. It correctly split `export function` (functions) from `export const` (variables) and inferred optional params from defaults. pleco has 2,636 `@param`/`@returns` tags across 98/112 documented files, so the reference will be dense and accurate. `starlight-typedoc` wraps this: generates the markdown, wires sidebar entries, renders inside Starlight.

## 3. Site architecture

```
apps/docs/                          # Astro + Starlight
├── astro.config.mjs                # starlight() + starlight-typedoc plugin(s) per namespace
├── typedoc.json                    # entryPoints = the 19 namespace source modules
├── src/content/docs/
│   ├── index.mdx                   # landing: identity, "what it is", quick demo
│   ├── start/                      # Getting Started (mirrors librosa)
│   │   ├── install.md
│   │   ├── quickstart.mdx          # walked-through example (load → detectBPM → loop.detect), live island
│   │   └── coming-from-librosa.md  # the discovered parity cross-reference (fn-by-fn map + exceptions ledger)
│   ├── guides/                     # narrative, one per namespace (the "thru and thru" layer)
│   │   ├── core.md  io.md  util.md
│   │   ├── beat.md  onset.md
│   │   ├── feature.md  filters.md
│   │   ├── effects.md  decompose.md
│   │   ├── segment.md  sequence.md
│   │   ├── linalg.md  cluster.md
│   │   ├── loop.md                 # ★ the flagship narrative
│   │   ├── playback.md  display.md
│   │   └── play.md                 # the creative/choreography layer
│   ├── gallery/                    # interactive demos as pages (islands)
│   │   └── <one .mdx per showcased demo, embedding the examples/web page>
│   └── reference/
│       ├── parity.md               # PARITY.md ledger (verified rows + exceptions)
│       ├── changelog.md
│       └── glossary.md
├── src/components/                 # DemoEmbed island wrapper, etc.
└── (generated) api/                # typedoc markdown per namespace → rendered API reference
```

Sidebar (mirrors librosa's captions, pleco identity):
- **Getting Started** — install, quickstart, coming-from-librosa
- **Guides** — the per-namespace conceptual pages (loop featured)
- **API Reference** — auto-generated, grouped by namespace
- **Gallery** — the interactive demos
- **Reference** — parity, changelog, glossary

## 4. The three content layers

**A. Auto API reference (the "log each function" core).** `starlight-typedoc` generates one page per exported function/class across all 19 namespaces (core, io, util, beat, onset, feature, filters, effects, decompose, segment, sequence, linalg, cluster, loop, playback, display, convert, intervals, notation, …). Each page: signature, params, returns, description, source link. Regenerated from source on every build — never hand-maintained, never stale. Committed markdown output lives under `apps/docs/src/content/docs/api/` (the "md version").

**B. Narrative guides (hand-written).** One conceptual page per namespace: what it's for, the key functions, worked snippets, gotchas, and the documented librosa divergences already captured in `docs/notes/ship-goal-notes.md` (143 lines of per-module notes collected during the proof-of-work pass — this is the seed corpus, not a blank page). `loop.md` is the flagship (the signature capability with no librosa equivalent). `play.md` covers the creative choreography layer.

**C. Interactive gallery.** The `examples/web/*` demos become Starlight pages via a `DemoEmbed` island (iframe or direct island mount). Each gallery page: what it proves, the live running demo, the code. This is the differentiator librosa structurally cannot match (its examples are static matplotlib PNGs). Flagships: vocal separation on real Orphans stems, Laplacian segmentation, pitch (pyin), music-sync DTW, the loop choreographies.

## 5. "Coming from librosa" page

The discovered-parity cross-reference (never the banner). Contents: a function-map table (`librosa.feature.mfcc` → `feature.mfcc`, etc.) generated from the PARITY ledger, the exceptions list (display → canvas-native, icqt/CQT-inverse honest throws, audioread codec breadth), and the honest positioning — pleco is its own library that happens to cover librosa's ground, plus real-time/loop capabilities librosa can't.

## 6. Markdown-and-website requirement

Both are produced by one pipeline: TypeDoc emits the API reference as markdown (committed under `api/`); guides/gallery/start are markdown/MDX authored directly. `astro build` renders all of it into the static site. So the repo always holds a readable markdown corpus AND builds a deployable site — no divergence.

## 7. Build, deploy, CI

- `apps/docs/package.json`: `dev` (astro dev), `build` (typedoc generate → astro build), `sync-api` (regenerate typedoc markdown).
- Root `npm run docs` runs the docs dev server.
- CI: build the docs site (catches broken links / bad MDX / stale API refs) alongside the existing test + demo-build gates.
- Deploy: `apps/docs/dist` → Cloudflare Pages on plecoxa.com (replaces the dead GitHub Pages path from Wave 0).

## 8. README reconciliation

The root `README.md` (currently the stale v1.0.6 one with a fabricated Quick Start) is rewritten to pleco's identity, a working quickstart, the zero-dependency/zero-ML-footprint selling points, and a link to the docs site. `packages/pleco-xa/README.md` (what npm shows) gets the concise package-focused version. `docs/` currently holds legacy junk (doppler experiments, old PNGs, `AUDIO_MANIPULATION_FEATURES.md`) — that clutter is quarantined to `docs/notes/legacy/` so the docs root is clean (deletion is the strip-pass goal's call).

## 9. Scope boundaries (YAGNI)

- No versioned docs (single current version until there's a v2.1 to differentiate).
- No i18n.
- No search customization beyond Starlight's built-in Pagefind.
- Gallery embeds the EXISTING demos; it does not rebuild them (they're already verified). Demo dedup (the 3 vocal pages) happens as gallery curation, not a rewrite.
- The dev-state strip pass is explicitly out of scope (separate goal).

## 10. Success criteria

- `apps/docs` builds clean; every namespace has an auto API-reference section and a narrative guide.
- The interactive gallery renders the live demos.
- "Coming from librosa" maps the verified parity surface.
- Committed markdown corpus exists for the whole reference (the "md version").
- README rewritten. Docs deployable to Cloudflare Pages.
