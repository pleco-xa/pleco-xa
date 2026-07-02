/**
 * playback/ops.js — unit tests for the Wave 6 hoisted loop playback DSP.
 *
 * These operations were hoisted verbatim from the demo's AudioAnalyzer inline
 * script; the tests lock the pure math: half speed doubles the loop-region
 * duration, reverse round-trips, and gap close removes a detected gap on a
 * synthetic signal.
 */
import { describe, it, expect } from 'vitest'
import {
  createBufferLike,
  halfSpeedLoop,
  halfSpeedQuantzLoop,
  doubleSpeedQuantzLoop,
  doubleSpeedUnquantzLoop,
  detectGap,
  closeGapLeft,
  closeGapRight,
  reverseSection,
} from '../src/playback/ops.js'

const SR = 1000 // 1 kHz keeps sample<->second math obvious

/** Build a buffer-like from per-channel arrays. */
function makeBuffer(channelArrays, sampleRate = SR) {
  const buf = createBufferLike(
    channelArrays.length,
    channelArrays[0].length,
    sampleRate,
  )
  channelArrays.forEach((arr, c) => buf.getChannelData(c).set(arr))
  return buf
}

/** Monotonic ramp 1..n (nonzero everywhere so gap detection sees signal). */
function ramp(n, offset = 1) {
  return Float32Array.from({ length: n }, (_, i) => (i + offset) / n)
}

describe('playback.halfSpeedLoop', () => {
  it('doubles the duration of the loop region (buffer grows by one loop length)', () => {
    const input = makeBuffer([ramp(1000)])
    const loop = { start: 0.2, end: 0.6 } // samples 200..600, loopLength 400

    const out = halfSpeedLoop(input, loop)

    expect(out.length).toBe(1000 + 400) // + one loop length
    expect(out.duration).toBeCloseTo(input.duration + 400 / SR, 6)
  })

  it('stretches content at half rate: output[start + 2k] === input[start + k]', () => {
    const data = ramp(1000)
    const input = makeBuffer([data])
    const loop = { start: 0.2, end: 0.6 }
    const startSample = 200

    const out = halfSpeedLoop(input, loop)
    const outData = out.getChannelData(0)

    // Every even output index in the stretched region maps exactly onto a
    // source sample (srcIndex integral, fraction 0 — no interpolation error).
    for (let k = 0; k < 380; k += 20) {
      expect(outData[startSample + 2 * k]).toBeCloseTo(data[startSample + k], 6)
    }
    // Pre-loop content untouched
    expect(outData[0]).toBeCloseTo(data[0], 6)
    expect(outData[199]).toBeCloseTo(data[199], 6)
    // Post-loop content shifted right by one loop length
    expect(outData[startSample + 800]).toBeCloseTo(data[600], 6)
    expect(outData[1399]).toBeCloseTo(data[999], 6)
  })

  it('rejects invalid loops loudly', () => {
    const input = makeBuffer([ramp(100)])
    expect(() => halfSpeedLoop(input, { start: 0.5, end: 0.2 })).toThrow(
      /normalized/,
    )
    expect(() => halfSpeedLoop(null, { start: 0, end: 1 })).toThrow(
      /AudioBuffer-shaped/,
    )
  })
})

describe('playback.halfSpeedQuantzLoop', () => {
  it('preserves total length and stretches only the first half of loop content', () => {
    const data = ramp(1000)
    const input = makeBuffer([data])
    const loop = { start: 0.2, end: 0.6 }
    const startSample = 200

    const out = halfSpeedQuantzLoop(input, loop)

    expect(out.length).toBe(1000)
    const outData = out.getChannelData(0)
    // output[start + 2k] === input[start + k] within the masked window
    for (let k = 0; k < 200; k += 10) {
      expect(outData[startSample + 2 * k]).toBeCloseTo(data[startSample + k], 6)
    }
    // Content outside the loop is untouched
    expect(outData[100]).toBeCloseTo(data[100], 6)
    expect(outData[700]).toBeCloseTo(data[700], 6)
  })
})

describe('playback.doubleSpeedQuantzLoop', () => {
  it('compresses the loop 2x, shortens the buffer, and reports the new loop end', () => {
    const data = ramp(1000)
    const input = makeBuffer([data])
    const loop = { start: 0.2, end: 0.6 } // loopLength 400 → compressed 200

    const { buffer: out, newLoopEnd } = doubleSpeedQuantzLoop(input, loop)

    expect(out.length).toBe(1000 - 200) // gapSize = 400 - 200
    const outData = out.getChannelData(0)
    // Compressed region reads source at 2x
    for (let k = 0; k < 200; k += 10) {
      expect(outData[200 + k]).toBeCloseTo(data[200 + 2 * k], 6)
    }
    // Content after the loop is shifted left, gapless
    expect(outData[400]).toBeCloseTo(data[600], 6)
    expect(outData[799]).toBeCloseTo(data[999], 6)
    // New loop end = (start + compressed) / newLength
    expect(newLoopEnd).toBeCloseTo(400 / 800, 6)
  })
})

describe('playback.doubleSpeedUnquantzLoop', () => {
  it('keeps the track length and compresses within the loop window', () => {
    const data = ramp(1000)
    const input = makeBuffer([data])
    const loop = { start: 0.2, end: 0.6 }

    const out = doubleSpeedUnquantzLoop(input, loop, { fractal: true })

    expect(out.length).toBe(1000)
    const outData = out.getChannelData(0)
    // Enough room after loop (400 available >= 400 loop) → full write at 2x
    for (let k = 0; k < 200; k += 10) {
      expect(outData[200 + k]).toBeCloseTo(data[200 + 2 * k], 6)
    }
    // Outside the loop untouched
    expect(outData[100]).toBeCloseTo(data[100], 6)
    expect(outData[900]).toBeCloseTo(data[900], 6)
  })

  it('fractal mode writes only the first half when there is no room for a glitch tail', () => {
    const data = ramp(1000)
    const input = makeBuffer([data])
    const loop = { start: 0.2, end: 0.9 } // 700 loop, only 100 after → no room

    const out = doubleSpeedUnquantzLoop(input, loop, { fractal: true })
    const outData = out.getChannelData(0)

    // First half of the window: compressed content
    expect(outData[200]).toBeCloseTo(data[200], 6)
    expect(outData[300]).toBeCloseTo(data[400], 6)
    // Second half of the window (beyond writeLength 350): original preserved
    expect(outData[200 + 350]).toBeCloseTo(data[200 + 350], 6)
    expect(outData[200 + 600]).toBeCloseTo(data[200 + 600], 6)
  })
})

describe('playback.reverseSection', () => {
  it('reverses the section without mutating the input', () => {
    const data = ramp(100)
    const input = makeBuffer([data])

    const out = reverseSection(input, 20, 60)
    const outData = out.getChannelData(0)

    expect(outData[20]).toBeCloseTo(data[59], 6)
    expect(outData[59]).toBeCloseTo(data[20], 6)
    expect(outData[10]).toBeCloseTo(data[10], 6)
    expect(outData[80]).toBeCloseTo(data[80], 6)
    // Input untouched
    expect(input.getChannelData(0)[20]).toBeCloseTo(data[20], 6)
  })

  it('round-trips: reversing twice restores the original', () => {
    const data = ramp(200)
    const input = makeBuffer([data])

    const once = reverseSection(input, 30, 170)
    const twice = reverseSection(once, 30, 170)
    const restored = twice.getChannelData(0)

    for (let i = 0; i < 200; i++) {
      expect(restored[i]).toBeCloseTo(data[i], 6)
    }
  })

  it('rejects invalid ranges loudly', () => {
    const input = makeBuffer([ramp(100)])
    expect(() => reverseSection(input, 60, 20)).toThrow(/invalid sample range/)
    expect(() => reverseSection(input, 0, 200)).toThrow(/invalid sample range/)
  })
})

describe('playback gap detection and closing', () => {
  /** signal [0..600) = ramp, [600..900) = silence, [900..1000) = ones */
  function gappedBuffer() {
    const data = new Float32Array(1000)
    data.set(ramp(600), 0)
    // 600..900 stays 0 (the gap)
    for (let i = 900; i < 1000; i++) data[i] = 1
    return makeBuffer([data])
  }

  it('detectGap finds the silent region after the loop end', () => {
    const input = gappedBuffer()
    const gap = detectGap(input, { start: 0.1, end: 0.6 })

    expect(gap).not.toBeNull()
    expect(gap.start).toBe(600)
    expect(gap.end).toBe(900)
    expect(gap.size).toBe(300)
  })

  it('detectGap returns null when there is no gap', () => {
    const input = makeBuffer([ramp(1000)])
    expect(detectGap(input, { start: 0.1, end: 0.6 })).toBeNull()
  })

  it('closeGapLeft removes the detected gap on a synthetic signal', () => {
    const input = gappedBuffer()
    const loop = { start: 0.1, end: 0.6 }

    const result = closeGapLeft(input, loop)

    expect(result).not.toBeNull()
    expect(result.gapSize).toBe(300)
    expect(result.buffer.length).toBe(700)
    const outData = result.buffer.getChannelData(0)
    // Content before the gap intact
    expect(outData[599]).toBeCloseTo(input.getChannelData(0)[599], 6)
    // Tail shifted left over the gap — the gap is gone
    expect(outData[600]).toBeCloseTo(1, 6)
    expect(outData[699]).toBeCloseTo(1, 6)
    // And the closed buffer no longer has a detectable gap after the loop end
    expect(
      detectGap(result.buffer, { start: loop.start, end: result.newLoopEnd }),
    ).toBeNull()
  })

  it('closeGapRight removes the gap and rescales the loop end', () => {
    const input = gappedBuffer()
    const loop = { start: 0.1, end: 0.6 }

    const result = closeGapRight(input, loop)

    expect(result).not.toBeNull()
    expect(result.gapSize).toBe(300)
    expect(result.buffer.length).toBe(700)
    expect(result.newLoopEnd).toBeCloseTo(0.6 * (700 / 1000), 6)
    const outData = result.buffer.getChannelData(0)
    expect(outData[600]).toBeCloseTo(1, 6)
  })

  it('closeGapLeft returns null (honestly) when no gap exists', () => {
    const input = makeBuffer([ramp(1000)])
    expect(closeGapLeft(input, { start: 0.1, end: 0.6 })).toBeNull()
  })
})
