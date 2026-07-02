import { describe, it, expect } from 'vitest'
import { createRmsMeter, createFluxAnalyzer } from '../src/streaming/analyzers.js'

function sine(nSamples, sr, freq, gain) {
  const y = new Float32Array(nSamples)
  for (let i = 0; i < nSamples; i++) {
    y[i] = gain * Math.sin((2 * Math.PI * freq * i) / sr)
  }
  return y
}

describe('streaming: createRmsMeter', () => {
  it('reports RMS ≈ gain/√2 for a steady sine, pushed in uneven chunks', () => {
    const sr = 22050
    const gain = 0.5
    const meter = createRmsMeter({ frameSize: 2048, hop: 512 })
    const y = sine(sr, sr, 441, gain) // 441 Hz → whole periods per frame

    // Push in awkward chunk sizes to exercise the incremental buffering
    const values = []
    let pos = 0
    for (const size of [100, 1337, 4096, 511, 8192]) {
      values.push(...meter.push(y.subarray(pos, pos + size)))
      pos += size
    }
    values.push(...meter.push(y.subarray(pos)))

    expect(values.length).toBeGreaterThan(10)
    const expected = gain / Math.SQRT2
    for (const v of values) {
      expect(Math.abs(v - expected)).toBeLessThan(0.01 * expected)
    }

    const { current, frameCount, pendingSamples } = meter.read()
    expect(current).toBe(values[values.length - 1])
    expect(frameCount).toBe(values.length)
    // exactly floor((N - frameSize) / hop) + 1 frames
    expect(frameCount).toBe(Math.floor((sr - 2048) / 512) + 1)
    expect(pendingSamples).toBeLessThan(2048)
  })

  it('emits identical values regardless of chunking', () => {
    const y = sine(22050, 22050, 220, 0.8)
    const a = createRmsMeter({ frameSize: 1024, hop: 256 })
    const b = createRmsMeter({ frameSize: 1024, hop: 256 })

    const all = a.push(y)
    const chunked = []
    for (let i = 0; i < y.length; i += 777) {
      chunked.push(...b.push(y.subarray(i, Math.min(i + 777, y.length))))
    }
    expect(chunked).toEqual(all)
  })

  it('reset clears state; invalid params and chunks throw', () => {
    const meter = createRmsMeter({ frameSize: 512, hop: 128 })
    meter.push(new Float32Array(2048))
    meter.reset()
    expect(meter.read()).toEqual({ current: null, frameCount: 0, pendingSamples: 0 })

    expect(() => createRmsMeter({ frameSize: 0 })).toThrow()
    expect(() => createRmsMeter({ hop: -4 })).toThrow()
    expect(() => createRmsMeter({ frameSize: 512.5 })).toThrow()
    expect(() => meter.push(null)).toThrow()
  })
})

describe('streaming: createFluxAnalyzer', () => {
  it('spikes at an amplitude step and stays low in steady state', () => {
    const sr = 22050
    const nFft = 1024
    const hop = 256
    const analyzer = createFluxAnalyzer({ nFft, hop })

    // 0.5 s quiet sine, then 0.5 s loud sine — step at sample sr/2
    const quiet = sine(sr / 2, sr, 430.664, 0.05) // bin-centered: 430.664 = 20 * sr / 1024
    const loud = sine(sr / 2, sr, 430.664, 0.9)
    const flux = [...analyzer.push(quiet), ...analyzer.push(loud)]

    const stepSample = sr / 2
    const stepFrame = Math.floor((stepSample - nFft) / hop) + 1 // first frame containing the step

    // Peak flux must land where the step enters the analysis frames
    let peakIdx = 0
    for (let i = 1; i < flux.length; i++) {
      if (flux[i] > flux[peakIdx]) peakIdx = i
    }
    expect(peakIdx).toBeGreaterThanOrEqual(stepFrame)
    expect(peakIdx).toBeLessThanOrEqual(stepFrame + Math.ceil(nFft / hop))

    // Spike dominates steady-state flux by an order of magnitude
    const steady = flux.slice(2, stepFrame - 1)
    const steadyMax = Math.max(...steady)
    expect(flux[peakIdx]).toBeGreaterThan(10 * Math.max(steadyMax, 1e-12))

    // First frame has no predecessor → flux 0
    expect(flux[0]).toBe(0)
  })

  it('is chunk-size invariant and worker-safe (no DOM/AudioContext use)', () => {
    const y = sine(8192, 22050, 441, 0.7)
    const a = createFluxAnalyzer({ nFft: 512, hop: 128 })
    const b = createFluxAnalyzer({ nFft: 512, hop: 128 })

    const all = a.push(y)
    const chunked = []
    for (let i = 0; i < y.length; i += 333) {
      chunked.push(...b.push(y.subarray(i, Math.min(i + 333, y.length))))
    }
    expect(chunked.length).toBe(all.length)
    for (let i = 0; i < all.length; i++) {
      expect(Math.abs(chunked[i] - all[i])).toBeLessThan(1e-4)
    }
  })

  it('reset clears spectral memory; invalid params throw', () => {
    const analyzer = createFluxAnalyzer({ nFft: 512, hop: 512 })
    const y = sine(1024, 22050, 441, 0.9)
    analyzer.push(y)
    analyzer.reset()
    expect(analyzer.read()).toEqual({ current: null, frameCount: 0, pendingSamples: 0 })
    // after reset, first frame is again flux 0 (no phantom previous spectrum)
    expect(analyzer.push(y)[0]).toBe(0)

    expect(() => createFluxAnalyzer({ nFft: 0 })).toThrow()
    expect(() => createFluxAnalyzer({ hop: 1.5 })).toThrow()
  })
})
