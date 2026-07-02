import { describe, it, expect } from 'vitest'
import { pitchBasedCompress, tempoBasedCompress } from '../src/scripts/compression.js'
import { fft } from '../src/scripts/xa-fft.js'

const SR = 22050
const N_FFT = 8192
// Bin-aligned test tone: exactly bin 160 of an 8192-point FFT at 22050 Hz
const F0 = (160 * SR) / N_FFT // ≈ 430.66 Hz

function makeBuffer(lengthSamples = SR) {
  const data = new Float32Array(lengthSamples)
  for (let i = 0; i < lengthSamples; i++) {
    data[i] = 0.8 * Math.sin((2 * Math.PI * F0 * i) / SR)
  }
  return {
    numberOfChannels: 1,
    length: lengthSamples,
    sampleRate: SR,
    duration: lengthSamples / SR,
    getChannelData: () => data,
  }
}

/** Dominant frequency via FFT peak over an interior window. */
function dominantFrequency(samples) {
  const start = Math.max(0, Math.floor((samples.length - N_FFT) / 2))
  const frame = samples.slice(start, start + N_FFT)
  const spec = fft(frame)
  let peakBin = 1
  let peakMag = 0
  for (let k = 1; k < N_FFT / 2; k++) {
    const m = Math.hypot(spec[k].real, spec[k].imag)
    if (m > peakMag) {
      peakMag = m
      peakBin = k
    }
  }
  return (peakBin * SR) / N_FFT
}

describe('tempoBasedCompress honesty (pitch-preserving contract)', () => {
  it('changes duration by the requested ratio', async () => {
    const ratio = 0.8
    const buffer = makeBuffer()
    const out = await tempoBasedCompress(buffer, ratio)
    // time_stretch(rate = 1/ratio) contract: round(n * ratio)
    expect(out.length).toBe(Math.round(buffer.length * ratio))
    expect(out.numberOfChannels).toBe(1)
    expect(out.sampleRate).toBe(SR)
  })

  it('preserves pitch: dominant frequency unchanged within 2%', async () => {
    const buffer = makeBuffer()
    const out = await tempoBasedCompress(buffer, 0.8)
    const f = dominantFrequency(out.getChannelData(0))
    expect(Math.abs(f - F0) / F0).toBeLessThan(0.02)
  })

  it('output is finite everywhere', async () => {
    const out = await tempoBasedCompress(makeBuffer(SR / 2), 1.25)
    const data = out.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      if (!Number.isFinite(data[i])) expect.fail(`non-finite sample at ${i}`)
    }
  })

  it('throws on non-positive ratio instead of falling back', async () => {
    await expect(tempoBasedCompress(makeBuffer(1024), 0)).rejects.toThrow()
    await expect(tempoBasedCompress(makeBuffer(1024), -1)).rejects.toThrow()
  })
})

describe('pitchBasedCompress honesty (resample: pitch and tempo move together)', () => {
  it('shifts the dominant frequency by 1/ratio — the documented behavior', async () => {
    const ratio = 0.8
    const out = await pitchBasedCompress(makeBuffer(), ratio)
    expect(out.length).toBe(Math.floor(SR * ratio))
    const f = dominantFrequency(out.getChannelData(0))
    // resample keeps the header rate, so pitch rises by 1/0.8 = 1.25x
    expect(Math.abs(f - F0 / ratio) / (F0 / ratio)).toBeLessThan(0.02)
  })
})
