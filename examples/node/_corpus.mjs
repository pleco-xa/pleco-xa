/**
 * The house corpus — pleco's answer to librosa.ex(): deterministic synthetic
 * demo assets with machine-checkable ground truth, generated on demand into
 * examples/corpus/. Other demos import ensureCorpus() for stable inputs;
 * examples/node/recordings.mjs is the verification pass that PROVES the
 * ground truths hold after a WAV round-trip.
 */
import { encodeWav } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const CORPUS_DIR = fileURLToPath(new URL('../corpus/', import.meta.url))

const SR = 22050

/** Deterministic uniform noise in [-1, 1) (LCG — same sequence every run). */
function makeNoise(n, seed = 1234) {
  const out = new Float32Array(n)
  let s = seed >>> 0
  for (let i = 0; i < n; i++) {
    s = (1664525 * s + 1013904223) >>> 0
    out[i] = (s / 2147483648) - 1
  }
  return out
}

function synthTone(freq, durationSec, amp = 0.8) {
  const n = Math.round(durationSec * SR)
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) y[i] = amp * Math.sin((2 * Math.PI * freq * i) / SR)
  return y
}

/** Linear chirp fmin→fmax: phase(t) = 2π(fmin·t + (fmax−fmin)·t²/(2T)). */
function synthChirp(fmin, fmax, durationSec, amp = 0.8) {
  const n = Math.round(durationSec * SR)
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    y[i] = amp * Math.sin(2 * Math.PI * (fmin * t + ((fmax - fmin) * t * t) / (2 * durationSec)))
  }
  return y
}

/** Click train: 5 ms decaying 1 kHz bursts every intervalSec. */
function synthClicks(bpm, durationSec, amp = 0.9) {
  const n = Math.round(durationSec * SR)
  const y = new Float32Array(n)
  const interval = 60 / bpm
  const burst = Math.round(0.005 * SR)
  for (let t0 = 0; t0 < durationSec - 0.005; t0 += interval) {
    const start = Math.round(t0 * SR)
    for (let i = 0; i < burst && start + i < n; i++) {
      y[start + i] = amp * Math.sin((2 * Math.PI * 1000 * i) / SR) * Math.exp(-i / (SR * 0.0015))
    }
  }
  return y
}

/** Amplitude-modulated noise (vocal stand-in): env = 0.05 + 0.95·(½−½cos 2πf·t). */
function synthAmNoise(amRateHz, durationSec, amp = 0.8) {
  const n = Math.round(durationSec * SR)
  const noise = makeNoise(n)
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / SR
    const env = 0.05 + 0.95 * (0.5 - 0.5 * Math.cos(2 * Math.PI * amRateHz * t))
    y[i] = amp * env * noise[i]
  }
  return y
}

/**
 * Synthesize (or re-synthesize) the corpus and its manifest. Deterministic:
 * every run writes byte-identical WAVs. Returns { dir, manifest, path(key) }.
 */
export function ensureCorpus() {
  mkdirSync(CORPUS_DIR, { recursive: true })

  const entries = [
    {
      key: 'tone-440', file: 'tone-440.wav', sr: SR, durationSec: 2.0,
      truth: { type: 'tone', freqHz: 440 },
      synth: () => synthTone(440, 2.0),
    },
    {
      key: 'chirp-110-880', file: 'chirp-110-880.wav', sr: SR, durationSec: 2.0,
      truth: { type: 'chirp', fminHz: 110, fmaxHz: 880 },
      synth: () => synthChirp(110, 880, 2.0),
    },
    {
      key: 'click-track-120bpm', file: 'click-track-120bpm.wav', sr: SR, durationSec: 10.0,
      truth: { type: 'clicks', bpm: 120, count: 20, intervalSec: 0.5 },
      synth: () => synthClicks(120, 10.0),
    },
    {
      key: 'am-noise', file: 'am-noise.wav', sr: SR, durationSec: 8.0,
      truth: { type: 'am-noise', amRateHz: 3, envelopePeaks: 24 },
      synth: () => synthAmNoise(3, 8.0),
    },
  ]

  const manifest = []
  for (const { synth, ...meta } of entries) {
    const y = synth()
    writeFileSync(join(CORPUS_DIR, meta.file), Buffer.from(encodeWav([y], meta.sr)))
    manifest.push(meta)
  }
  writeFileSync(join(CORPUS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

  return {
    dir: CORPUS_DIR,
    manifest,
    path: (key) => join(CORPUS_DIR, manifest.find((m) => m.key === key).file),
  }
}
