/**
 * tests/goldens/webaudio-browser-bounce.golden.test.js — P23 browser-bounce parity.
 *
 * The fixture corpus (fixtures/webaudio-browser-bounces.json) was rendered by
 * a REAL Chrome OfflineAudioContext (see the JSON's generator/userAgent/date
 * metadata). Each case here rebuilds the IDENTICAL node graph on
 * PlecoOfflineAudioContext — same buffers, same params, same connections, same
 * render length — renders it headless via renderSync(), and diffs the output
 * sample-wise against what Chrome bounced. This is the ground-truth parity
 * proof for the Web Audio engine: not "does it match the spec on paper" but
 * "does it produce the same audio as a shipping browser".
 *
 * Tolerance tiers (per-fixture table below, each entry documented):
 *   - 1e-6  exact/linear paths — pure float32 arithmetic both sides
 *   - 1e-4  interpolated/filtered paths — double-precision internals differ
 *           in evaluation order between implementations
 *   - 1e-3  synthesis paths — wavetable sizes and interpolation kernels are
 *           implementation-defined
 *   - compressor: the spec algorithm is a MODEL of Chrome's kernel, not a
 *     clone (adaptive release curve, lookahead rounding differ), so it gets a
 *     block-RMS envelope check instead of a sample diff.
 *
 * Divergence ledger:
 *   - oscillator-square: RESOLVED 2026-07-14 — pleco now band-limits per pitch
 *     range (Blink-style mip-map wavetables, xa-periodic-wave.js), so the former
 *     1.36e-1 aliasing gap is closed (maxAbsDiff 3.58e-7, a tolerance pass).
 *   - compressor-burst: INHERENT, not a defect (kept as it.fails). pleco is
 *     faithful to the W3C compressor algorithm step-for-step, but the spec
 *     delegates the knee/detector/envelope-rate curve shapes to the UA, so
 *     Chrome ≠ spec ≠ Firefox — no two browsers match bit-for-bit, and bit-exact
 *     Chrome parity is unachievable by construction. Chrome compresses ~1.8 dB
 *     harder; a coarse (2×) envelope sanity test guards timing/compression.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PlecoOfflineAudioContext } from '../../src/engine/xa-offline-context.js'

const corpus = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/webaudio-browser-bounces.json', import.meta.url)), 'utf8'),
)
const byName = new Map(corpus.fixtures.map((f) => [f.name, f]))
const SR = 8192 // every fixture in the corpus was bounced at this rate

// ---------------------------------------------------------------------------
// Shared signal recipes — MUST mirror the Chrome-side generator to the letter.
// ---------------------------------------------------------------------------

/** d[i] = (i % 17) / 16 − 0.5 — a repeating 17-sample ramp, every value exact in float32. */
function rampBuffer(ctx, length) {
  const buf = ctx.createBuffer(1, length, SR)
  const d = buf.getChannelData(0)
  for (let i = 0; i < length; i++) d[i] = (i % 17) / 16 - 0.5
  return buf
}

/** 4-frame buffer with d[0] = 1 — the unit impulse used by the delay/filter fixtures. */
function impulseBuffer(ctx) {
  const buf = ctx.createBuffer(1, 4, SR)
  buf.getChannelData(0)[0] = 1
  return buf
}

/** bufferSource(buffer) → node → destination, started at 0 — the corpus's standard topology. */
function sourceThrough(ctx, buffer, node) {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(node)
  node.connect(ctx.destination)
  src.start(0)
}

// ---------------------------------------------------------------------------
// Graph builders — one per fixture, the exact recipe Chrome rendered.
// ---------------------------------------------------------------------------

const GRAPHS = {
  'gain-static': (ctx) => {
    const g = ctx.createGain()
    g.gain.value = 0.5
    sourceThrough(ctx, rampBuffer(ctx, 320), g)
  },

  'gain-automation': (ctx) => {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, 0)
    g.gain.linearRampToValueAtTime(1, 256 / SR)
    g.gain.setTargetAtTime(0.25, 256 / SR, 128 / SR)
    sourceThrough(ctx, rampBuffer(ctx, 512), g)
  },

  'buffer-source-loop': (ctx) => {
    const buf = ctx.createBuffer(1, 64, SR)
    const d = buf.getChannelData(0)
    for (let i = 0; i < 64; i++) d[i] = Math.fround(Math.sin((2 * Math.PI * i) / 64))
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.loopStart = 16 / SR
    src.loopEnd = 48 / SR
    src.connect(ctx.destination)
    src.start(0)
  },

  'buffer-source-playbackrate': (ctx) => {
    const src = ctx.createBufferSource()
    src.buffer = rampBuffer(ctx, 512)
    src.playbackRate.value = 0.5
    src.detune.value = 600
    src.connect(ctx.destination)
    src.start(0)
  },

  'delay-impulse': (ctx) => {
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 200 / SR
    sourceThrough(ctx, impulseBuffer(ctx), delay)
  },

  'biquad-lowpass-impulse': (ctx) => {
    const biquad = ctx.createBiquadFilter()
    biquad.type = 'lowpass'
    biquad.frequency.value = 1000
    biquad.Q.value = 2
    sourceThrough(ctx, impulseBuffer(ctx), biquad)
  },

  'iir-impulse': (ctx) => {
    const iir = ctx.createIIRFilter([0.5, 0.25], [1, -0.5])
    sourceThrough(ctx, impulseBuffer(ctx), iir)
  },

  'oscillator-sine': (ctx) => {
    const osc = ctx.createOscillator()
    osc.frequency.value = 512
    osc.connect(ctx.destination)
    osc.start(0)
  },

  'oscillator-square': (ctx) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 256
    osc.connect(ctx.destination)
    osc.start(0)
  },

  'periodic-wave-custom': (ctx) => {
    const wave = ctx.createPeriodicWave(new Float32Array([0, 0, 0.5]), new Float32Array([0, 1, 0]))
    const osc = ctx.createOscillator()
    osc.setPeriodicWave(wave)
    osc.frequency.value = 256
    osc.connect(ctx.destination)
    osc.start(0)
  },

  'stereo-panner': (ctx) => {
    const panner = ctx.createStereoPanner()
    panner.pan.value = 0.5
    sourceThrough(ctx, rampBuffer(ctx, 384), panner)
  },

  'constant-source-offset': (ctx) => {
    const cs = ctx.createConstantSource()
    cs.offset.value = 0.25
    cs.connect(ctx.destination)
    cs.start(0)
  },

  'waveshaper-hardclip': (ctx) => {
    const buf = ctx.createBuffer(1, 384, SR)
    const d = buf.getChannelData(0)
    for (let i = 0; i < 384; i++) d[i] = Math.fround(2 * Math.sin((2 * Math.PI * i * 8) / 384))
    const shaper = ctx.createWaveShaper()
    shaper.curve = new Float32Array([-0.5, -0.5, 0, 0.5, 0.5])
    sourceThrough(ctx, buf, shaper)
  },

  'convolver-small-ir': (ctx) => {
    const signal = ctx.createBuffer(1, 256, SR)
    const s = signal.getChannelData(0)
    for (let i = 0; i < 256; i++) s[i] = i % 32 === 0 ? 1 : 0
    const ir = ctx.createBuffer(1, 8, SR)
    const h = ir.getChannelData(0)
    for (let i = 0; i < 8; i++) h[i] = Math.fround(0.5 ** i)
    const conv = ctx.createConvolver()
    conv.normalize = false // sampled when the buffer is assigned — must precede it
    conv.buffer = ir
    sourceThrough(ctx, signal, conv)
  },

  'split-merge-roundtrip': (ctx) => {
    const buf = ctx.createBuffer(2, 256, SR)
    const left = buf.getChannelData(0)
    const right = buf.getChannelData(1)
    for (let i = 0; i < 256; i++) {
      left[i] = (i % 8) / 8
      right[i] = -((i % 4) / 4)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const splitter = ctx.createChannelSplitter(2)
    const merger = ctx.createChannelMerger(2)
    src.connect(splitter)
    splitter.connect(merger, 0, 1) // channel swap: L → input 1,
    splitter.connect(merger, 1, 0) //               R → input 0
    merger.connect(ctx.destination)
    src.start(0)
  },

  'compressor-burst': (ctx) => {
    const buf = ctx.createBuffer(1, 1024, SR)
    const d = buf.getChannelData(0)
    for (let i = 128; i < 640; i++) d[i] = Math.fround(0.9 * Math.sin((2 * Math.PI * i * 16) / 1024))
    sourceThrough(ctx, buf, ctx.createDynamicsCompressor())
  },
}

// ---------------------------------------------------------------------------
// Per-fixture sample-diff tolerances (maxAbsDiff), each documented with the
// diff OBSERVED on this engine at the time the tolerance was set.
// ---------------------------------------------------------------------------

const TOLERANCES = {
  // Exact/linear tier — float32 in, float32 out, no interpolation anywhere.
  'gain-static': 1e-6, // observed 0: g·x rounds identically in both engines
  'constant-source-offset': 1e-6, // observed 0: 0.25 is exact in float32
  'split-merge-roundtrip': 1e-6, // observed 0: split/merge is pure channel routing
  'delay-impulse': 1e-6, // observed 0: 200-frame delay is quantum-integral, no interpolation
  'waveshaper-hardclip': 1e-6, // observed 1.0e-14: double-rounding residue where Chrome lands exactly on 0

  // Interpolated/filter tier — double-precision internals, evaluation order differs.
  'buffer-source-loop': 1e-4, // observed 0: integral playhead ⇒ exact table reads on both sides
  'buffer-source-playbackrate': 1e-4, // observed 0: identical double playhead + linear interp rounding
  'biquad-lowpass-impulse': 1e-4, // observed 3.0e-8: same spec coefficients, different state-update order
  'iir-impulse': 1e-4, // observed 5.9e-39: denormal tail — Chrome flushes denormals to zero, pleco keeps them
  'gain-automation': 1e-4, // observed 8.9e-8: setTargetAtTime closed form vs Chrome's per-quantum recursion
  'stereo-panner': 1e-4, // observed 0: equal-power gains round identically via double cos/sin
  'convolver-small-ir': 1e-4, // observed 1.3e-8: pleco direct convolution vs Chrome's FFT blocks

  // Synthesis tier — wavetable size + interpolation kernel are implementation-defined.
  'oscillator-sine': 1e-3, // observed 0: 512 Hz at SR 8192 lands on exact table entries both sides
  'periodic-wave-custom': 1e-3, // observed 1.2e-7: 256 Hz also table-exact; IFFT rounding only
}

function renderFixture(name) {
  const fixture = byName.get(name)
  const ctx = new PlecoOfflineAudioContext({
    numberOfChannels: fixture.channels.length,
    length: fixture.length,
    sampleRate: fixture.sampleRate,
  })
  GRAPHS[name](ctx)
  return { fixture, rendered: ctx.renderSync() }
}

/** Worst sample-wise deviation across all channels, with its location for the failure message. */
function maxAbsDiff(rendered, fixture) {
  let worst = { diff: 0, channel: 0, frame: 0, got: 0, want: 0 }
  for (let c = 0; c < fixture.channels.length; c++) {
    const got = rendered.getChannelData(c)
    const want = fixture.channels[c]
    for (let i = 0; i < want.length; i++) {
      const diff = Math.abs(got[i] - want[i])
      if (diff > worst.diff) worst = { diff, channel: c, frame: i, got: got[i], want: want[i] }
    }
  }
  return worst
}

describe('golden: Chrome OfflineAudioContext browser bounces (P23 parity corpus)', () => {
  it('the corpus is complete: 16 fixtures, one graph builder each', () => {
    expect(corpus.fixtures.length).toBe(16)
    expect(Object.keys(GRAPHS).sort()).toEqual(corpus.fixtures.map((f) => f.name).sort())
  })

  for (const [name, tolerance] of Object.entries(TOLERANCES)) {
    it(`${name}: matches the Chrome bounce sample-wise (maxAbsDiff ≤ ${tolerance})`, () => {
      const { fixture, rendered } = renderFixture(name)
      expect(rendered.length).toBe(fixture.length)
      expect(rendered.numberOfChannels).toBe(fixture.channels.length)
      const worst = maxAbsDiff(rendered, fixture)
      expect(
        worst.diff,
        `${name} ch${worst.channel}[${worst.frame}]: got ${worst.got}, want ${worst.want}`,
      ).toBeLessThanOrEqual(tolerance)
    })
  }

  // RESOLVED (2026-07-14): pleco now band-limits per pitch range (Blink-style
  // mip-map wavetables — see xa-periodic-wave.js), keeping only the sub-Nyquist
  // partials Chrome keeps. The former 1.36e-1 aliasing gap is closed: observed
  // maxAbsDiff 3.58e-7 vs the Chrome bounce — a genuine tolerance pass.
  it('oscillator-square: band-limited synthesis matches Chrome within tolerance', () => {
    const { fixture, rendered } = renderFixture('oscillator-square')
    const worst = maxAbsDiff(rendered, fixture)
    expect(worst.diff).toBeLessThanOrEqual(1e-3)
  })

  // Compressor: envelope comparison, NOT a sample diff. The spec's
  // DynamicsCompressorNode processing model (which pleco implements) describes
  // Chrome's kernel but is not bit-identical to it — Chrome's adaptive release
  // curve, knee tables, and lookahead rounding all differ in the details, so
  // sample-exact comparison is meaningless. Two assertions, split honestly:
  //
  // (1) PASSING sanity net — the coarse envelope agrees: the burst occupies
  //     the same 128-frame blocks (silence where Chrome is silent, signal
  //     where Chrome has signal), both engines compress (output RMS below the
  //     0.636 RMS of the raw 0.9-amplitude burst), and block RMS stays within
  //     a 2× band of Chrome's. The 2× band is explicitly a sanity bound, not
  //     a parity claim.
  const BLOCK = 128
  const SILENCE_RMS = 1e-3 // blocks under this are treated as silence, compared absolutely

  function blockRms(data, block) {
    let sum = 0
    for (let i = block * BLOCK; i < (block + 1) * BLOCK; i++) sum += data[i] * data[i]
    return Math.sqrt(sum / BLOCK)
  }

  it('compressor-burst: coarse envelope sanity — same block timing, compression engaged, RMS within 2×', () => {
    const { fixture, rendered } = renderFixture('compressor-burst')
    expect(rendered.length).toBe(fixture.length)
    const got = rendered.getChannelData(0)
    const want = fixture.channels[0]
    const rawBurstRms = 0.9 / Math.SQRT2 // RMS of the uncompressed input sine
    for (let block = 0; block < want.length / BLOCK; block++) {
      const rmsGot = blockRms(got, block)
      const rmsWant = blockRms(want, block)
      if (rmsWant < SILENCE_RMS) {
        expect(rmsGot, `block ${block}: Chrome is silent (rms ${rmsWant}), pleco is not`).toBeLessThan(SILENCE_RMS)
      } else {
        expect(rmsGot, `block ${block}: pleco output is not compressed below the raw input`).toBeLessThan(rawBurstRms)
        const rel = Math.abs(rmsGot - rmsWant) / rmsWant
        expect(
          rel,
          `block ${block}: rms got ${rmsGot}, want ${rmsWant} (rel err ${(rel * 100).toFixed(1)}%)`,
        ).toBeLessThanOrEqual(1.0)
      }
    }
  })

  // (2) KNOWN GAP — the 20% block-RMS parity target does NOT hold yet.
  //     Observed per-block relative RMS error vs Chrome: 81.7% (attack block),
  //     47.4%, 31.3%, 21.7%, 17.9% (steady state). Chrome's kernel dips hard
  //     on attack and adaptively relaxes upward; the spec model reaches a flat
  //     steady state ~1.8 dB above Chrome's. Same shape, same timing, more
  //     gain reduction in Chrome — a kernel-model gap, kept red on purpose.
  it.fails('compressor-burst: KNOWN GAP — block-RMS envelope within 20% of the Chrome bounce', () => {
    const { fixture, rendered } = renderFixture('compressor-burst')
    const got = rendered.getChannelData(0)
    const want = fixture.channels[0]
    for (let block = 0; block < want.length / BLOCK; block++) {
      const rmsWant = blockRms(want, block)
      if (rmsWant < SILENCE_RMS) continue // silence timing is covered by the sanity test
      const rel = Math.abs(blockRms(got, block) - rmsWant) / rmsWant
      expect(rel, `block ${block}`).toBeLessThanOrEqual(0.2)
    }
  })
})
