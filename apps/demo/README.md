# @pleco-xa/demo

A standalone Astro app that exercises `pleco-xa` as a real consumer (it imports
the published package via the workspace). It is **not** the public site —
[plecoxa.com](https://plecoxa.com) is served by [`apps/docs`](../docs).

This app earns its place in the monorepo for two reasons:

1. **Consumer smoke test.** CI builds it (`npm run build -w @pleco-xa/demo`) to
   catch anything that breaks when the library is imported from a real app.
2. **Shared audio corpus.** `public/audio/` holds the reference audio the
   examples and gallery use. The `examples/web/*` demos fetch it via
   `../../apps/demo/public/audio/…`, and the docs gallery mirrors it through
   `apps/docs/scripts/copy-demos.mjs`. Moving or renaming that folder means
   updating those consumers too.

## Local dev

```bash
npm run dev -w @pleco-xa/demo    # predev builds the library first
```
