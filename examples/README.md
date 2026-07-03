# pleco-xa examples

Self-contained proof-of-work demos for every part of the library. Each one runs
a real scenario (known signal in → asserted result out) and shows a visible
**PASS/FAIL** — they exist to *prove* the library works, function by function.

Two kinds:

- **`web/`** — browser pages (waveforms, spectrograms, audio playback, PASS/FAIL badges)
- **`node/`** — terminal scripts that print a proof table and exit `0` on pass, non-zero on fail

You do **not** need to build or install anything if `packages/pleco-xa/dist/` is
already present (it ships in the repo). If it's missing, see [Rebuilding](#rebuilding).

---

## Web demos

Opening a `.html` file directly (double-clicking → `file://`) shows a **blank
page** — browsers block ES-module imports over `file://`. Serve them over
`http://` instead. Pick either option:

### Option A — the built-in server (recommended)

```bash
npm run demos
```

Then open **http://localhost:5757** — you'll get an index listing all 50 web
demos with descriptions. Click any one. (Zero dependencies; it's a tiny Node
static server rooted at the repo so the demos can reach the `dist/` bundle.)

Custom port: `node tools/serve-demos.mjs 8080`

### Option B — no npm at all

Any static server rooted at the **repo root** works:

```bash
python3 -m http.server 5757        # then open http://localhost:5757/examples/web/xa-fft.html
```

> It must be the **repo root**, not `examples/web/` — the demos load the library
> via `../../packages/pleco-xa/dist/pleco-xa.js`.

---

## Node demos

Just run them — no server needed:

```bash
node examples/node/xa-fft.mjs          # FFT/STFT known-tone proof
node examples/node/pyin.mjs            # probabilistic-YIN pitch tracking
node examples/node/vocal-separation-real.mjs   # vocal separation on a real mix
```

Each prints a `PASS`/`FAIL` table and exits `0` only if every proof passes, so
they double as a smoke test:

```bash
for f in examples/node/*.mjs; do node "$f" >/dev/null && echo "ok  $f" || echo "FAIL $f"; done
```

A few good ones to start with: `convert-goldens.mjs` (unit conversions vs
golden values), `linalg-cluster.mjs` (eigensolver + k-means), `beat-tracker.mjs`
(tempo/beat against committed fixtures), `streaming-meters.mjs` (real-time RMS/flux).

---

## What they prove

These aren't toys — every assertion is checked against ground truth. Numerical
demos are validated against **committed reference fixtures**; loop/vocal demos
assert real recovery metrics. If a demo passes, that capability genuinely works.
Nothing silently falls back or fakes a result.

---

## Rebuilding

If `packages/pleco-xa/dist/pleco-xa.js` is missing or you changed library
source:

```bash
npm install          # first time only (workspace install)
npm run build:lib    # produces packages/pleco-xa/dist/
# or in one step, build + serve:
npm run demos:build
```
