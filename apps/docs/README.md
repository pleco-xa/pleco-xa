# @pleco-xa/docs

The documentation site for pleco-xa — narrative guides, an auto-generated
per-function API reference, and an interactive gallery where every example runs
live in the browser. Built with [Astro Starlight](https://starlight.astro.build)
and deployed to **[plecoxa.com](https://plecoxa.com)** on GitHub Pages.

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

## Deploy — GitHub Pages

Hosting is GitHub Pages, driven by `.github/workflows/deploy-docs.yml`. On every
push to `main` that touches the docs, library, or demos, the workflow builds the
site and publishes `apps/docs/dist/` to Pages. `public/CNAME` pins the custom
domain to `plecoxa.com`.

**One-time repo setup** (already done if the site is live):

```bash
# Point Pages at the Actions workflow as its build source
gh api -X POST repos/pleco-xa/pleco-xa/pages -f build_type=workflow
```

Then Settings → Pages should show the custom domain `plecoxa.com` and, once DNS
resolves, "Enforce HTTPS".

## Deploy — DNS (Cloudflare)

`plecoxa.com` is registered on Cloudflare; Cloudflare serves **DNS only** while
GitHub Pages serves the site. Point the apex at GitHub's Pages IPs and `www` at
the Pages host. Keep these records **grey-cloud (DNS only)** so GitHub can
provision the TLS certificate.

| Type  | Name | Value                | Proxy      |
|-------|------|----------------------|------------|
| A     | `@`  | `185.199.108.153`    | DNS only   |
| A     | `@`  | `185.199.109.153`    | DNS only   |
| A     | `@`  | `185.199.110.153`    | DNS only   |
| A     | `@`  | `185.199.111.153`    | DNS only   |
| CNAME | `www`| `pleco-xa.github.io` | DNS only   |

Set these in the Cloudflare dashboard (DNS → Records), or run the API script
below with a token scoped to **Zone → DNS → Edit** for the `plecoxa.com` zone:

```bash
export CF_API_TOKEN=<your-token>
export CF_ZONE_ID=<plecoxa.com zone id>   # Cloudflare dashboard → domain → Overview
bash tools/dns/cloudflare-pages-dns.sh
```

After DNS propagates (minutes to an hour), GitHub Pages issues the certificate;
enable "Enforce HTTPS" in Settings → Pages.
