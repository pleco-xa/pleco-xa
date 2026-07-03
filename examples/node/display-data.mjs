/**
 * Display data layer — everything renderable that does NOT need a canvas:
 * axis formatters, colormap selection, env-blind waveform extraction, the
 * xa-file visualization decimator, and the browser WAV Blob helper (Node ≥ 18
 * ships Blob, so the byte-level contract is assertable here).
 *
 *   - TimeFormatter: frame 100 @ hop 512 / sr 22050 → '2.32s'; ms unit →
 *     '998ms' for frame 43 (exact strings),
 *   - ChromaFormatter: pitch class 7 → 'G' (ASCII), 10 → 'A♯' (unicode),
 *   - cmap: non-negative data → sequential colormap with a callable map();
 *     centered data → diverging,
 *   - getTimebasedWaveform(10 ms resolution): every point i sits at exactly
 *     i·0.01 s and a 440 Hz sine yields peak amplitudes ≈ 1 (≥ 0.95),
 *   - getWaveformRange(0.25 s, 0.5 s): metadata pins the exact sample range
 *     [5512, 11025), out-of-range request throws,
 *   - file.createVisualization(1000 points): exact point count, times are
 *     sample indices on the decimation grid, sampleRate echoed (the repaired
 *     explicit parameter),
 *   - createAudioBlob: audio/wav Blob of exactly 44 + N·2 bytes (16-bit mono).
 */
import {
  TimeFormatter, ChromaFormatter, cmap, getTimebasedWaveform, getWaveformRange,
  createAudioBlob, file,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const sr = 22050
const y = new Float32Array(sr)
for (let i = 0; i < sr; i++) y[i] = Math.sin((2 * Math.PI * 440 * i) / sr)
const buffer = {
  numberOfChannels: 1, length: y.length, sampleRate: sr,
  duration: 1, getChannelData: () => y,
}

// ── axis formatters ─────────────────────────────────────────────────────────
check("TimeFormatter: frame 100 @ hop 512/sr 22050 → '2.32s'",
  new TimeFormatter({ sr, hopLength: 512 }).format(100), '2.32s')
check("TimeFormatter ms unit: frame 43 → '998ms'",
  new TimeFormatter({ unit: 'ms' }).format(43), '998ms')
check("ChromaFormatter: pitch class 7 → 'G' (ASCII)",
  new ChromaFormatter({ unicode: false }).format(7), 'G')
check("ChromaFormatter: pitch class 10 → 'A♯' (unicode default)",
  new ChromaFormatter().format(10), 'A♯')

// ── colormap selection ──────────────────────────────────────────────────────
{
  const seq = cmap(new Float32Array([0, 0.5, 1]))
  check('cmap(non-negative data) selects a sequential colormap', seq.type, 'sequential')
  checkTrue('cmap returns a callable map()', typeof seq.map === 'function')
  const div = cmap(new Float32Array([-1, 0, 1]))
  check('cmap(centered data) selects a diverging colormap', div.type, 'diverging')
}

// ── env-blind waveform extraction ───────────────────────────────────────────
{
  const tw = getTimebasedWaveform(buffer, { resolution: 0.01 })
  check('getTimebasedWaveform(10 ms): 100 points over 1 s', tw.data.length, 100)
  checkTrue('getTimebasedWaveform: point i sits at exactly i·0.01 s (grid times)',
    tw.data.every((p, i) => Math.abs(p.time - (i * Math.floor(0.01 * sr)) / sr) < 1e-9))
  checkTrue('getTimebasedWaveform(440 Hz sine, peaks): every 10 ms peak ≥ 0.95',
    tw.data.every((p) => p.amplitude >= 0.95),
    `min peak ${Math.min(...tw.data.map((p) => p.amplitude)).toFixed(4)}`)

  const range = getWaveformRange(buffer, 0.25, 0.5, { width: 50 })
  check('getWaveformRange(0.25 s, 0.5 s) metadata pins samples [5512, 11025)',
    [range.metadata.startSample, range.metadata.endSample], [5512, 11025])
  let threw = false
  try { getWaveformRange(buffer, 2, 3) } catch { threw = true }
  checkTrue('getWaveformRange beyond the buffer throws (no silent empty range)', threw)
}

// ── xa-file visualization decimator ─────────────────────────────────────────
{
  const viz = file.createVisualization(y, 1000, sr)
  check('createVisualization: exactly 1000 points', viz.amplitudes.length, 1000)
  const step = Math.floor(y.length / 1000)
  check('createVisualization: times are the decimation grid [0, step, 2·step, …]',
    viz.times.slice(0, 3), [0, step, 2 * step])
  check('createVisualization echoes the explicit sampleRate (post-repair)',
    viz.sampleRate, sr)
}

// ── WAV Blob helper ─────────────────────────────────────────────────────────
{
  const blob = createAudioBlob(buffer)
  checkTrue('createAudioBlob returns a Blob', blob instanceof Blob)
  check("createAudioBlob type == 'audio/wav'", blob.type, 'audio/wav')
  check('createAudioBlob size == 44 + N·2 bytes (16-bit mono WAV)',
    blob.size, 44 + sr * 2)
}

summary('display data layer — formatters, cmap, waveform data, WAV Blob')
