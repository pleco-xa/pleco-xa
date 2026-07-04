import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import { melspectrogram } from '../../src/scripts/xa-mel.js'
import { pcen } from '../../src/scripts/xa-advanced.js'

function flatten(matrix) {
  const rows = matrix.length
  const cols = matrix[0].length
  const out = new Float64Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[r * cols + c] = matrix[r][c]
  }
  return out
}

// Reference pcen applied to a mel power-spectrogram, defaults throughout:
//   S = melspectrogram(y, sr, n_fft, hop, n_mels, power=2.0)
//   P = pcen(S, sr=22050, hop=512, gain=0.98, bias=2, power=0.5,
//            time_constant=0.4, eps=1e-6, max_size=1)
//
// The fixture feeds pcen the mel spectrogram, so pleco's mel front-end (f32
// STFT + Slaney filterbank) is inside the loop. The pcen math added on top —
// sqrt-steady-state smoother coefficient, filter warm-up delay state
// (M[-1]=1, i.e. delay = 1-b), log-space AGC (eps+M)^-gain, and the
// expm1/log1p compression branch — is exact: feeding the reference's own mel
// into this pcen reproduces the fixture to 9.0e-8 (float64 round-off).
// End-to-end from pleco's mel the max deviation is 1.8e-7 here, so pcen is
// not the bottleneck and the mel-inherited residual is tiny on this signal.
// rtol 1e-3 / atol 1e-4 gates the combined pipeline with ~1000x headroom.
describe('golden: pcen vs committed reference fixture (on melspectrogram)', () => {
  const fx = loadFixture('pcen')

  for (const c of fx.cases) {
    const { sr, n_fft, hop_length, n_mels } = c.input
    it(`pcen(melspectrogram(n_mels=${n_mels})) matches reference ground truth`, () => {
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
        2.0, // power (mel power spectrogram)
        n_mels,
      )

      const P = pcen(S, sr, hop_length)

      expect(P.length, 'pcen rows').toBe(n_mels)
      expect(P.length * P[0].length, 'pcen elements').toBe(c.expected.length)

      expectClose(flatten(P), c.expected, {
        label: 'pcen',
        rtol: 1e-3,
        atol: 1e-4,
      })
    })
  }
})
