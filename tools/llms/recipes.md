## Advanced MIR recipes

Every snippet is a complete Node script (no browser, no audio files, no other dependencies), executed
against the built library before being written here; each `// verified output` is the measured result.

### Probabilistic pitch tracking (pYIN) — full HMM pipeline: threshold-ensemble observations, Viterbi-decoded f0 + voicing

```js
import { pyin } from 'pleco-xa';

const sr = 22050, n = sr * 2, y = new Float32Array(n);
let ph = 0;
for (let i = 0; i < n; i++) {                             // 220 -> 330 Hz glide
  ph += 2 * Math.PI * (220 + 110 * i / n) / sr;
  y[i] = 0.6 * Math.sin(ph);
}
const { f0, voiced_flag, voiced_prob } = pyin(y, 110, 660, sr, { frame_length: 2048 });
const v = [...f0].filter((_, t) => voiced_flag[t]);
console.log(f0.length, 'frames; f0 start', v[0].toFixed(1), '-> end', v.at(-1).toFixed(1),
  '; mean voiced_prob', ([...voiced_prob].reduce((a, b) => a + b) / f0.length).toFixed(3));
```
// verified output: `87 frames; f0 start 222.6 -> end 329.6 ; mean voiced_prob 0.953` — corr(frame, f0) = 0.9999, all 87 frames voiced; the track follows the glide.

### Structural segmentation (Laplacian spectral clustering) — recurrence + path graphs, eigendecomposition, k-means, all in JS
The symmetric eigensolver is pure JS (cyclic Jacobi rotations, `pleco-xa/linalg` eigh) — no native linear-algebra dependency anywhere.

```js
import { sync } from 'pleco-xa';
import { chroma_stft } from 'pleco-xa/feature';
import { laplacianSegmentation } from 'pleco-xa/segment';

const sr = 22050, sec = 2, A = [261.63, 329.63, 392], B = [293.66, 349.23, 440];
const form = [A, A, B, A], y = new Float32Array(sr * sec * form.length);
form.forEach((chord, s) => {
  for (let i = 0; i < sr * sec; i++) {
    for (const f of chord) y[s * sr * sec + i] += 0.2 * Math.sin(2 * Math.PI * f * i / sr);
    y[s * sr * sec + i] += 0.01 * (Math.random() * 2 - 1);  // noise floor, as in real audio
  }
});
const chroma = chroma_stft(y, { sr, n_fft: 2048, hop_length: 512 });      // [12][345]
const beatFrames = Array.from({ length: 32 }, (_, b) => Math.round(b * 0.25 * sr / 512));
const beatChroma = sync(chroma, beatFrames);                              // [12][31]
const { segmentIds, boundaries } = laplacianSegmentation(beatChroma, { k: 2, width: 3, mu: 0.5 });
console.log(segmentIds.join(''), 'boundaries at beats', boundaries);      // sections change at 4 s, 6 s
```
// verified output: `0000000000000000111111110000000 boundaries at beats [ 16, 24 ]` — exactly the A→B (4 s) and B→A (6 s) section changes.

### DTW alignment — quadratic-DP alignment recovers a 1.25× tempo warp from chroma alone

```js
import { chroma_stft } from 'pleco-xa/feature';
import { dtw } from 'pleco-xa/sequence';

const sr = 22050, mel = [261.63, 329.63, 392, 523.25, 392, 329.63];
const render = d => {                                     // d = seconds per note
  const y = new Float32Array(Math.round(sr * d * mel.length));
  mel.forEach((f, k) => {
    const off = Math.round(k * d * sr);
    for (let i = 0; i < Math.round(d * sr); i++)
      y[off + i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr) + 0.01 * (Math.random() * 2 - 1);
  });
  return y;
};
const X = chroma_stft(render(0.25), { sr, hop_length: 512 });             // [12][65]
const Y = chroma_stft(render(0.3125), { sr, hop_length: 512 });           // 1.25x stretch, [12][81]
const { D, wp } = dtw(X, Y, { metric: 'cosine' });
const mn = wp.reduce((s, p) => s + p[0], 0) / wp.length, mm = wp.reduce((s, p) => s + p[1], 0) / wp.length;
const slope = wp.reduce((s, p) => s + (p[0] - mn) * (p[1] - mm), 0) / wp.reduce((s, p) => s + (p[0] - mn) ** 2, 0);
console.log('cost', D.at(-1).at(-1).toFixed(3), '; path', wp.length, 'steps; slope', slope.toFixed(3));
```
// verified output: `cost 0.552 ; path 81 steps; slope 1.248` — warping-path slope ≈ the 1.25× stretch; path spans (0,0)→(64,80).

### Harmonic/percussive separation (HPSS) — median-filter masking splits a mix into two spectrogram components

```js
import { stft } from 'pleco-xa';
import { hpss } from 'pleco-xa/decompose';

const sr = 22050, n = sr * 3, y = new Float32Array(n);
for (let i = 0; i < n; i++) y[i] = 0.4 * Math.sin(2 * Math.PI * 440 * i / sr);
for (let t = 0; t < 3; t += 0.25) {                       // click train every 250 ms
  const at = Math.round(t * sr);
  for (let j = 0; j < 32; j++) y[at + j] += 0.8 * (1 - j / 32) * (j % 2 ? -1 : 1);
}
const S = stft(y, 1024, 256);                             // [513][259] of {real, imag}
const { harmonic, percussive } = hpss(S, { kernel_size: 31, power: 2.0, margin: 1.0 });
const bandShare = C => {                                  // energy share in the 440 Hz band (bin 20 +/- 1)
  let band = 0, all = 0;
  for (let f = 0; f < C.length; f++)
    for (const c of C[f]) { const e = c.real ** 2 + c.imag ** 2; all += e; if (Math.abs(f - 20) <= 1) band += e; }
  return band / all;
};
console.log('harmonic in sine band:', bandShare(harmonic).toFixed(3),
  '; percussive in sine band:', bandShare(percussive).toFixed(4));
```
// verified output: `harmonic in sine band: 0.986 ; percussive in sine band: 0.0001` — and 98.9% of percussive energy lands inside the click frames (23% of the timeline). Complex input in, phase-consistent complex components out.

### Viterbi decoding — globally optimal HMM state path beats frame-wise argmax on corrupted data

```js
import { viterbi } from 'pleco-xa/sequence';

const truth = [...Array(25).fill(0), ...Array(25).fill(1), ...Array(10).fill(0)];
let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const prob = [new Float64Array(60), new Float64Array(60)];   // P[obs | state], [state][frame]
truth.forEach((s, t) => {
  const p = 0.65 + 0.3 * rand();
  prob[s][t] = p; prob[1 - s][t] = 1 - p;
  if (rand() < 0.15) [prob[0][t], prob[1][t]] = [prob[1][t], prob[0][t]];  // corrupt ~15% of frames
});
const { states, logp } = viterbi(prob, [[0.9, 0.1], [0.1, 0.9]], null, true);
const corrupted = truth.filter((s, t) => prob[s][t] < 0.5).length;
const errors = states.filter((s, t) => s !== truth[t]).length;
console.log(states.join(''), '\ncorrupted:', corrupted, '; decode errors:', errors, '; logp', logp.toFixed(2));
```
// verified output: `corrupted: 11 ; decode errors: 2 ; logp -40.14` — frame-wise argmax gets 11 frames wrong, Viterbi repairs all but 2 (both at a true state boundary).

### Recurrence quantification (RQA) — DP path extraction over a self-similarity matrix separates structure from noise

```js
import { chroma_stft } from 'pleco-xa/feature';
import { recurrenceMatrix } from 'pleco-xa/segment';
import { rqa } from 'pleco-xa/sequence';

const sr = 22050, notes = [261.63, 293.66, 329.63, 392, 440, 392, 329.63, 293.66];
const analyze = y => {
  const sim = recurrenceMatrix(chroma_stft(y, { sr, hop_length: 1024 }),
    { mode: 'affinity', sym: true, width: 5 });               // [130][130] self-similarity
  const { score, path } = rqa(sim, { gapOnset: 1, gapExtend: 1, knightMoves: true });
  return { best: Math.max(...score.map(r => Math.max(...r))), pathLen: path.length };
};
const y1 = new Float32Array(sr * 6), y2 = new Float32Array(sr * 6);
for (let i = 0; i < y1.length; i++) {
  const k = Math.floor(i / sr / 0.25) % notes.length;         // 2 s melody, looped 3x
  y1[i] = 0.5 * Math.sin(2 * Math.PI * notes[k] * i / sr) + 0.01 * (Math.random() * 2 - 1);
  y2[i] = 0.5 * (Math.random() * 2 - 1);                      // unstructured noise
}
console.log('looped melody:', analyze(y1), ' noise:', analyze(y2));
```
// verified output: `looped melody: { best: 67.4, pathLen: 85 }  noise: { best: 3.5, pathLen: 18 }` — ~19× score and ~5× path-length separation between repetition and noise.

### Beat-synchronous chroma — beat tracking and harmony features fused onto one musical time base

```js
import { beat_track, sync } from 'pleco-xa';
import { chroma_stft } from 'pleco-xa/feature';

const sr = 44100, n = sr * 8, y = new Float32Array(n);
for (let i = 0; i < n; i++)                               // sustained C major triad
  for (const f of [261.63, 329.63, 392]) y[i] += 0.15 * Math.sin(2 * Math.PI * f * i / sr);
for (let t = 0; t < 8; t += 0.5) {                        // 120 BPM click track
  const at = Math.round(t * sr);
  for (let j = 0; j < 440; j++) y[at + j] += 0.7 * Math.exp(-j / 60) * Math.sin(2 * Math.PI * 1500 * j / sr);
}
const { tempo, beats } = beat_track(y, sr, { hopLength: 512 });   // beats are frame indices
const chroma = chroma_stft(y, { sr, hop_length: 512 });           // [12][690]
const beatChroma = sync(chroma, beats);                           // [12][beats.length - 1]
const meanRow = beatChroma.map(r => [...r].reduce((a, b) => a + b) / r.length);
const top3 = meanRow.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(p => p[1]).sort((a, b) => a - b);
console.log('tempo', Number(tempo).toFixed(1), '; beat-synced chroma', beatChroma.length, 'x',
  beatChroma[0].length, '; dominant pitch classes', top3);        // C=0, E=4, G=7
```
// verified output: `tempo 120.2 ; beat-synced chroma 12 x 14 ; dominant pitch classes [ 0, 4, 7 ]` — 15 tracked beats at 0.5001 s mean spacing, C-E-G dominate every beat column.

### Full pipeline: tempo → beats → loop → WAV export — analysis feeding synthesis, ending in a byte-exact codec round-trip

```js
import { beat_track, encodeWav, decodeWav, loop } from 'pleco-xa';

const sr = 44100, n = sr * 8, y = new Float32Array(n);
for (let t = 0; t < 8; t += 0.5) {                        // 120 BPM kicks + off-beat hats
  const at = Math.round(t * sr), ht = Math.round((t + 0.25) * sr);
  for (let j = 0; j < 4400; j++) y[at + j] += 0.8 * Math.exp(-j / 800) * Math.sin(2 * Math.PI * 60 * j / sr);
  for (let j = 0; j < 1000 && ht + j < n; j++) y[ht + j] += 0.25 * Math.exp(-j / 160) * (Math.random() * 2 - 1);
}
const { tempo } = beat_track(y, sr, { hopLength: 512 });
const buffer = { getChannelData: () => y, sampleRate: sr, length: n,     // AudioBuffer shim: plain
  duration: n / sr, numberOfChannels: 1 };                               // object, no audio runtime
const found = await loop.detect(buffer, { strategy: 'musical', bpm: Number(tempo) });
const region = y.slice(found.loopStartSample, found.loopEndSample);
const wav = encodeWav([region], sr);                                     // ArrayBuffer, RIFF/WAVE
const back = decodeWav(wav);
let err = 0;
for (let i = 0; i < region.length; i++) err = Math.max(err, Math.abs(back.channels[0][i] - region[i]));
console.log('tempo', Number(tempo).toFixed(1), '; loop', found.loopStart.toFixed(3), '->',
  found.loopEnd.toFixed(3), 's, conf', found.confidence.toFixed(2),
  ';', wav.byteLength, 'wav bytes; round-trip max err', err.toExponential(2));
```
// verified output: `tempo 120.2 ; loop 0.008 -> 1.008 s, conf 0.83 ; 88244 wav bytes; round-trip max err 1.53e-5` — a one-bar loop at the detected tempo, and the exported WAV decodes back within the 16-bit quantization bound (3.1e-5).

## Appendix: observed behavior vs docs (measured while verifying)

- `sync(data, idx, aggregate, pad, axis)` — the documented `pad` and `axis` parameters are accepted but **ignored**; output always has `idx.length - 1` columns (inner intervals only, time axis only). Plan shapes accordingly.
- Option casing is per-module and wrong casing is **silently ignored**: `beat_track`/`loop.detect` take camelCase (`hopLength`, `strategy`, `bpm`); `feature`/`decompose`/`pyin` take snake_case (`hop_length`, `n_fft`, `kernel_size`, `frame_length`). Measured: `beat_track(y, sr, { hop_length: 1024 })` silently used the default 512.
- `laplacianSegmentation` throws `frame N has a non-positive spectral norm` on sterile noiseless synthetic input: bit-identical successive frames collapse the path-graph bandwidth and the Gaussian weights underflow. Real audio is fine; for synthetic signals add a small noise floor (the recipe does).
- `beat_track` tempo is quantized by the onset-autocorrelation lag grid: a true 120 BPM measures 117.5 at sr 22050 / hop 512 and 120.2 at sr 44100 / hop 512. Beat *positions* are accurate in both cases.
- `loop.detect` `strategy: 'fast'` returned `confidence: 0.000` on a clean 120 BPM pattern while still returning a plausible region; `'musical'` (0.84 with a bpm hint) and `'recurrence'` (0.99) report meaningful confidence. Prefer those when the confidence value matters.
- Two generations of some APIs coexist in the type docs. The public ones verified here: `pleco-xa/sequence` `dtw(X, Y, {metric, ...})` returning `{D, wp}` (not the legacy `{distance, cost_matrix, path}` form), and `pleco-xa/feature` `chroma_stft(y, {sr, hop_length, ...})` options-object form (not the legacy positional form).
- `dtw`, `viterbi`, `rqa`, `hpss`, `chroma_stft`, `laplacianSegmentation`, `recurrenceMatrix` are not flat exports of the root package — import them from their subpaths (as above) or via the root namespaces (`sequence.dtw`, `decompose.hpss`, ...). `pyin`, `stft`, `sync`, `beat_track`, `encodeWav`, `decodeWav`, and the `loop` namespace are flat on the root.
