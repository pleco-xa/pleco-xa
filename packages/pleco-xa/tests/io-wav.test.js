import { describe, it, expect } from 'vitest'
import { encodeWav, decodeWav } from '../src/io/wav.js'

function sine(n, freq, sr, gain = 0.8) {
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) y[i] = gain * Math.sin((2 * Math.PI * freq * i) / sr)
  return y
}

describe('io/wav: single codec', () => {
  it('mono encode→decode round-trips within 16-bit quantization', () => {
    const y = sine(1000, 440, 22050)
    const { channels, sampleRate } = decodeWav(encodeWav([y], 22050))
    expect(sampleRate).toBe(22050)
    expect(channels.length).toBe(1)
    expect(channels[0].length).toBe(1000)
    for (let i = 0; i < y.length; i++) {
      expect(Math.abs(channels[0][i] - y[i])).toBeLessThan(1 / 32000)
    }
  })

  it('stereo interleaving is sample-accurate per channel (the corruption regression)', () => {
    const left = sine(500, 440, 44100)
    const right = sine(500, 880, 44100, 0.4)
    const { channels } = decodeWav(encodeWav([left, right], 44100))
    for (let i = 0; i < 500; i++) {
      expect(Math.abs(channels[0][i] - left[i])).toBeLessThan(1 / 32000)
      expect(Math.abs(channels[1][i] - right[i])).toBeLessThan(1 / 32000)
    }
  })

  it('rejects mismatched channel lengths and non-WAV input', () => {
    expect(() => encodeWav([new Float32Array(4), new Float32Array(5)], 44100)).toThrow(/equal length/)
    expect(() => decodeWav(new ArrayBuffer(64))).toThrow(/RIFF/)
  })
})
