/**
 * Wave 3 unit tests for the consolidated `loop` namespace.
 *  - confidence ∈ [0, 1] for every strategy on a synthetic loopable buffer
 *  - strategy failures THROW diagnostic gate errors (no fabrication)
 *  - LoopController.doubleLoop (new, symmetric to halfLoop)
 *  - DynamicZeroCrossing exported and functional
 *  - deleted modules stay deleted (files gone, no lingering source imports)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  detect,
  STRATEGIES,
  LoopController,
  DynamicZeroCrossing,
  snapToZeroCrossings,
  clamp01,
} from '../src/loop/index.js'
import * as barrel from '../src/index.js'

/* ------------------------------------------------------------------ */
/*  Synthetic loopable material                                       */
/* ------------------------------------------------------------------ */

/**
 * Build an AudioBuffer-like shim containing `repeats` copies of a 2-second,
 * 120 BPM bar: four click-marked beats over a tone melody (440/550/660/880 Hz
 * per half second) so beat tracking, onsets AND chroma all have real content.
 */
function makeLoopableBuffer(repeats = 4, sampleRate = 22050) {
  const loopSeconds = 2
  const loopLen = loopSeconds * sampleRate
  const data = new Float32Array(loopLen * repeats)
  const tones = [440, 550, 660, 880]

  for (let r = 0; r < repeats; r++) {
    const base = r * loopLen
    for (let beat = 0; beat < 4; beat++) {
      const beatStart = base + beat * (loopLen / 4)
      const freq = tones[beat]
      for (let i = 0; i < loopLen / 4; i++) {
        const t = i / sampleRate
        // tone + decaying click transient on the beat
        const click = i < 600 ? Math.exp(-i / 80) * 0.9 : 0
        data[beatStart + i] = 0.45 * Math.sin(2 * Math.PI * freq * t) + click
      }
    }
  }

  return {
    numberOfChannels: 1,
    sampleRate,
    length: data.length,
    duration: data.length / sampleRate,
    getChannelData: () => data,
  }
}

function makeSilentBuffer(seconds = 8, sampleRate = 22050) {
  const data = new Float32Array(Math.floor(seconds * sampleRate))
  return {
    numberOfChannels: 1,
    sampleRate,
    length: data.length,
    duration: seconds,
    getChannelData: () => data,
  }
}

/* ------------------------------------------------------------------ */
/*  detect(): confidence convention                                    */
/* ------------------------------------------------------------------ */

describe('loop.detect — unified 0..1 confidence on loopable material', () => {
  const buffer = makeLoopableBuffer()

  for (const strategy of STRATEGIES) {
    it(`strategy '${strategy}' returns confidence in [0, 1]`, async () => {
      const result = await detect(buffer, { strategy })
      expect(result.strategy).toBe(strategy)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
      expect(Number.isFinite(result.confidence)).toBe(true)
      expect(result.loopEnd).toBeGreaterThan(result.loopStart)
      expect(result.loopEndSample).toBeGreaterThan(result.loopStartSample)
    }, 30_000)
  }

  it("strategy 'recurrence' finds strong repetition on verbatim loops", async () => {
    const result = await detect(buffer, { strategy: 'recurrence' })
    expect(result.confidence).toBeGreaterThan(0.5)
  }, 30_000)

  it("strategy 'recurrence' accepts RQA candidate scoring", async () => {
    const result = await detect(buffer, { strategy: 'recurrence', rqa: true })
    expect(result.details.diagnostics.rqa).toBe(true)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  }, 30_000)
})

/* ------------------------------------------------------------------ */
/*  detect(): failure paths throw — no fabrication                     */
/* ------------------------------------------------------------------ */

describe('loop.detect — failure gates throw diagnostics (no fabrication)', () => {
  it('throws on unknown strategy, naming the alternatives', async () => {
    const buffer = makeLoopableBuffer(1)
    await expect(detect(buffer, { strategy: 'psychic' })).rejects.toThrow(
      /unknown strategy 'psychic'.*fast.*precise.*musical.*recurrence/s,
    )
  })

  it('throws on invalid input (no getChannelData)', async () => {
    await expect(detect({})).rejects.toThrow(/input gate/)
  })

  it('throws on empty channel data', async () => {
    const empty = {
      numberOfChannels: 1,
      sampleRate: 44100,
      length: 0,
      duration: 0,
      getChannelData: () => new Float32Array(0),
    }
    await expect(detect(empty)).rejects.toThrow(/input gate/)
  })

  it("'precise' throws its candidate gate on too-short material", async () => {
    const short = makeLoopableBuffer(1) // 2s total: no onset pair fits the window
    await expect(
      detect(short, { strategy: 'precise', bpm: 120 }),
    ).rejects.toThrow(/precise: candidate gate/)
  })

  it("'musical' throws its candidate gate when no bar length fits", async () => {
    const tiny = {
      numberOfChannels: 1,
      sampleRate: 22050,
      length: 11025,
      duration: 0.5,
      getChannelData: () => new Float32Array(11025).fill(0.1),
    }
    await expect(
      detect(tiny, { strategy: 'musical', bpm: 120 }),
    ).rejects.toThrow(/musical: candidate gate/)
  })

  it("'recurrence' throws a gate error on silence (no repetition evidence)", async () => {
    await expect(
      detect(makeSilentBuffer(), { strategy: 'recurrence' }),
    ).rejects.toThrow(/recurrence: .*gate/)
  }, 30_000)

  it("'recurrence' throws its embedding gate on too-short material", async () => {
    const short = makeSilentBuffer(0.2)
    await expect(
      detect(short, { strategy: 'recurrence' }),
    ).rejects.toThrow(/recurrence: /)
  })
})

/* ------------------------------------------------------------------ */
/*  LoopController.doubleLoop                                          */
/* ------------------------------------------------------------------ */

describe('LoopController.doubleLoop', () => {
  it('is symmetric with halfLoop', () => {
    const lc = new LoopController()
    lc.setLoop(0.25, 0.5)
    const halved = lc.halfLoop()
    expect(halved.success).toBe(true)
    expect(halved.loop.end).toBeCloseTo(0.375, 10)

    const doubled = lc.doubleLoop()
    expect(doubled.success).toBe(true)
    expect(doubled.loop).toEqual({ start: 0.25, end: 0.5 })
  })

  it('clamps at the buffer end and reports it', () => {
    const lc = new LoopController()
    lc.setLoop(0.4, 0.8)
    const res = lc.doubleLoop()
    expect(res.success).toBe(true)
    expect(res.loop.end).toBe(1)
    expect(res.clamped).toBe(true)
  })

  it('fails with a reason when the loop already reaches the end', () => {
    const lc = new LoopController()
    lc.setLoop(0.5, 1)
    const res = lc.doubleLoop()
    expect(res.success).toBe(false)
    expect(res.reason).toMatch(/end of the buffer/)
    expect(lc.getCurrentLoop()).toEqual({ start: 0.5, end: 1 })
  })
})

/* ------------------------------------------------------------------ */
/*  DynamicZeroCrossing                                                */
/* ------------------------------------------------------------------ */

describe('DynamicZeroCrossing primitive', () => {
  it('is exported from the loop namespace and the package barrel', () => {
    expect(typeof DynamicZeroCrossing.snap).toBe('function')
    expect(barrel.loop.DynamicZeroCrossing).toBe(DynamicZeroCrossing)
  })

  it('snaps boundaries onto actual zero crossings', () => {
    const sr = 44100
    const data = new Float32Array(sr)
    for (let i = 0; i < sr; i++) {
      data[i] = Math.sin(2 * Math.PI * 100 * (i / sr)) // crossing every 220.5 samples
    }
    // Ask to snap from points deliberately off any crossing
    const [s, e] = DynamicZeroCrossing.snap(data, 100, 40000, 441)
    expect(Math.abs(data[s])).toBeLessThan(0.01)
    expect(Math.abs(data[e])).toBeLessThan(0.01)

    const viaHelper = snapToZeroCrossings(data, 100, 40000, 441)
    expect(viaHelper).toEqual([s, e])
  })

  it('clamp01 keeps the confidence convention honest', () => {
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(0.42)).toBe(0.42)
    expect(clamp01(1000)).toBe(1)
    expect(clamp01(NaN)).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/*  Deleted modules stay deleted                                       */
/* ------------------------------------------------------------------ */

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const PKG_SRC = fileURLToPath(new URL('../src/', import.meta.url))
const DELETED = ['xa-loop-detection', 'recurrence-loop-analyzer', 'loop-smart']

function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

describe('deleted loop modules stay deleted', () => {
  it('source files are gone', () => {
    for (const name of DELETED) {
      expect(
        existsSync(join(PKG_SRC, 'scripts', `${name}.js`)),
        `${name}.js should not exist`,
      ).toBe(false)
    }
  })

  it('no module imports reference them (public/ frozen copies excepted until Wave 6)', () => {
    const roots = [PKG_SRC, join(REPO_ROOT, 'apps/demo/src')]
    const offenders = []
    // Matches import/from/dynamic-import specifiers naming a deleted module,
    // except URL-space specifiers ('/scripts/...') that point at the frozen
    // public/ runtime copies kept for the Wave 6 demo migration.
    const pattern = new RegExp(
      `(from\\s+['"]|import\\s*\\(\\s*['"]|require\\(\\s*['"])(?!/scripts/)[^'"]*(${DELETED.join('|')})(\\.js)?['"]`,
    )
    for (const root of roots) {
      for (const file of walk(root, ['.js', '.mjs', '.ts', '.astro'])) {
        const text = readFileSync(file, 'utf8')
        if (pattern.test(text)) offenders.push(file)
      }
    }
    expect(offenders, `lingering imports of deleted modules:\n${offenders.join('\n')}`).toEqual([])
  })
})
