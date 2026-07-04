import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { mel_filterbank, melspectrogram } from '../../src/scripts/xa-mel.js'

function flatten(matrix) {
  const rows = matrix.length
  const cols = matrix[0].length
  const out = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = matrix[r][c]
  }
  return out
}

describe('golden: mel filterbank vs committed reference fixture', () => {
  const fx = loadFixture('mel_filterbank')
  for (const c of fx.cases) {
    const { sr, n_fft, n_mels, htk, norm } = c.input
    it(`mel(sr=${sr}, n_fft=${n_fft}, n_mels=${n_mels}, htk=${htk}, norm=${norm}) matches reference ground truth`, () => {
      const fb = mel_filterbank(
        sr,
        n_fft,
        n_mels,
        0,
        null,
        norm === 'none' ? null : norm,
        htk,
      )
      const [nMels, nFreq] = c.expected_shape
      expect(fb.length, 'mel bands').toBe(nMels)
      expect(fb[0].length, 'freq bins').toBe(nFreq)
      // Deterministic filter math: only f32 quantization separates us from the reference
      expectClose(flatten(fb), c.expected, {
        label: 'mel-fb',
        rtol: 1e-6,
        atol: 1e-8,
      })
    })
  }
})

describe('golden: melspectrogram vs committed reference fixture', () => {
  const fx = loadFixture('melspectrogram')
  for (const c of fx.cases) {
    const { signal, sr, n_fft, hop_length, n_mels } = c.input
    it(`melspectrogram(${signal}) matches reference ground truth (n_fft=${n_fft}, hop=${hop_length}, n_mels=${n_mels})`, () => {
      const y = new Float32Array(c.input.y)
      const S = melspectrogram(
        y,
        sr,
        null, // S
        n_fft,
        hop_length,
        null, // win_length
        'hann',
        true, // center
        'constant',
        2.0, // power
        n_mels,
      )
      const [nMels, nFrames] = c.expected_shape
      expect(S.length, 'mel bands').toBe(nMels)
      expect(S[0].length, 'frames').toBe(nFrames)
      // f32 stft accumulation + f32 filterbank dot; measured max rel dev ~1e-4
      expectClose(flatten(S), c.expected, {
        label: 'melspec',
        rtol: 5e-4,
        atol: 1e-4,
      })
    })
  }
})
