import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import {
  spectral_centroid,
  spectral_bandwidth,
  spectral_rolloff,
  spectral_flatness,
  spectral_contrast,
  rms,
  zero_crossing_rate,
} from '../../src/feature/spectral.js'

/**
 * Test-local double-precision STFT magnitude (hann periodic, center,
 * constant pad — reference defaults).
 *
 * Why not the production stft? The fixture descriptors were computed by
 * the reference implementation from ITS |stft|. The reference FFT's noise
 * floor in near-silent bins is coherent with the exact result (bandwidth
 * moves <2e-5 between the reference's f32 and f64 STFTs), while our
 * production f32 recursive FFT has a larger incoherent floor (~3e-5 abs)
 * that bandwidth/contrast amplify on quasi-pure tones. An f64 DFT here
 * reconstructs the reference S faithfully so the fixtures gate the
 * DESCRIPTOR math tightly; the production-stft end-to-end path is exercised
 * separately below at a looser tolerance.
 * (Verified: the reference fed our S reproduces our outputs to the last digit.)
 */
function f64MagSpectrogram(y, n_fft, hop_length) {
  const pad = Math.floor(n_fft / 2)
  const sig = new Float64Array(y.length + 2 * pad)
  for (let i = 0; i < y.length; i++) sig[pad + i] = y[i]

  const win = new Float64Array(n_fft)
  for (let i = 0; i < n_fft; i++) win[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / n_fft))

  const nFrames = Math.floor((sig.length - n_fft) / hop_length) + 1
  const nBins = n_fft / 2 + 1
  const S = Array.from({ length: nBins }, () => new Float64Array(nFrames))

  const re = new Float64Array(n_fft)
  const im = new Float64Array(n_fft)
  for (let t = 0; t < nFrames; t++) {
    const base = t * hop_length
    for (let i = 0; i < n_fft; i++) {
      re[i] = sig[base + i] * win[i]
      im[i] = 0
    }
    fftInPlace(re, im)
    for (let f = 0; f < nBins; f++) S[f][t] = Math.hypot(re[f], im[f])
  }
  return S
}

/** Iterative radix-2 complex FFT, double precision, in place. */
function fftInPlace(re, im) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wRe = Math.cos(ang)
    const wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]
        const uIm = im[i + k]
        const vRe = re[i + k + len / 2] * curRe - im[i + k + len / 2] * curIm
        const vIm = re[i + k + len / 2] * curIm + im[i + k + len / 2] * curRe
        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + len / 2] = uRe - vRe
        im[i + k + len / 2] = uIm - vIm
        const nextRe = curRe * wRe - curIm * wIm
        curIm = curRe * wIm + curIm * wRe
        curRe = nextRe
      }
    }
  }
}

function flatten(matrix) {
  const rows = matrix.length
  const cols = matrix[0].length
  const out = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = matrix[r][c]
  }
  return out
}

describe('golden: spectral descriptors vs committed reference fixtures (S input)', () => {
  const fx = loadFixture('spectral_features')

  for (const c of fx.cases) {
    const { signal, sr, n_fft, hop_length } = c.input
    const y = new Float32Array(c.input.y)
    const S = f64MagSpectrogram(y, n_fft, hop_length)

    // Achieved max deviations (f64 S reconstruction, worst of both signals):
    //   centroid 2.4e-4 Hz abs · bandwidth 1.3e-4 Hz abs · rolloff exact ·
    //   flatness 3.3e-7 rel · contrast 2.3e-6 dB abs · rms 3.7e-8 abs ·
    //   zcr exact. Tolerances below keep ~10x+ headroom over measurement.

    it(`spectral_centroid(${signal}) matches reference ground truth`, () => {
      const out = spectral_centroid(null, { S, sr })
      expectClose(out, c.centroid, { label: 'centroid', rtol: 1e-6, atol: 1e-3 })
    })

    it(`spectral_bandwidth(${signal}) matches reference ground truth`, () => {
      const out = spectral_bandwidth(null, { S, sr })
      expectClose(out, c.bandwidth, { label: 'bandwidth', rtol: 1e-6, atol: 1e-3 })
    })

    it(`spectral_rolloff(${signal}) matches reference ground truth`, () => {
      const out = spectral_rolloff(null, { S, sr })
      // bin-quantized: must land on the exact FFT bin the reference found
      expectClose(out, c.rolloff, { label: 'rolloff', rtol: 0, atol: 1e-9 })
    })

    it(`spectral_flatness(${signal}) matches reference ground truth`, () => {
      const out = spectral_flatness(null, { S })
      expectClose(out, c.flatness, { label: 'flatness', rtol: 1e-6, atol: 1e-7 })
    })

    it(`spectral_contrast(${signal}) matches reference ground truth (shape + values)`, () => {
      const out = spectral_contrast(null, { S, sr })
      expect(out.length, 'contrast bands').toBe(c.contrast_shape[0])
      expect(out[0].length, 'contrast frames').toBe(c.contrast_shape[1])
      expectClose(flatten(out), c.contrast, { label: 'contrast', rtol: 1e-5, atol: 1e-3 })
    })

    it(`rms(S=${signal}) matches reference ground truth`, () => {
      const out = rms(null, { S })
      expectClose(out, c.rms, { label: 'rms', rtol: 1e-6, atol: 1e-8 })
    })

    it(`zero_crossing_rate(${signal}) matches reference ground truth`, () => {
      const out = zero_crossing_rate(y)
      // pure time-domain counting: exact
      expectClose(out, c.zcr, { label: 'zcr', rtol: 0, atol: 1e-12 })
    })
  }
})

describe('golden: y-input path through the production f32 stft', () => {
  const fx = loadFixture('spectral_features')

  for (const c of fx.cases) {
    const { signal, sr } = c.input
    const y = new Float32Array(c.input.y)

    // End-to-end wiring check: y → scripts/xa-fft stft → descriptor.
    // The f32 recursive FFT noise floor costs accuracy on near-silent bins,
    // so tolerances here are the wave-level 2e-3 target.
    it(`spectral_centroid(y=${signal}) via production stft`, () => {
      const out = spectral_centroid(y, { sr })
      expectClose(out, c.centroid, { label: 'centroid-y', rtol: 2e-3, atol: 2e-3 })
    })

    it(`spectral_flatness(y=${signal}) via production stft`, () => {
      const out = spectral_flatness(y, {})
      expectClose(out, c.flatness, { label: 'flatness-y', rtol: 2e-3, atol: 2e-3 })
    })
  }
})

describe('feature/spectral failure paths', () => {
  it('throws when neither y nor S is provided', () => {
    expect(() => spectral_centroid(null, {})).toThrow(/must be provided/)
    expect(() => rms(null, {})).toThrow(/Either y or S/)
  })

  it('rms throws on frame_length/S mismatch', () => {
    const S = [new Float64Array(4), new Float64Array(4), new Float64Array(4)]
    expect(() => rms(null, { S, frame_length: 2048 })).toThrow(/frame_length/)
  })

  it('rolloff rejects out-of-range roll_percent', () => {
    expect(() => spectral_rolloff(null, { S: [[1]], roll_percent: 1.5 })).toThrow(
      /roll_percent/,
    )
  })
})
