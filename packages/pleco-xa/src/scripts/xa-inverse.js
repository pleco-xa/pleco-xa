/**
 * Librosa-compatible Inverse Transforms for JavaScript
 * Convert features back to audio or spectrograms
 */

import { mel_filterbank } from './xa-mel.js'
import { griffinlim } from './xa-advanced.js'
import { db_to_power } from './xa-convert.js'

/**
 * Approximate STFT magnitude from a Mel power spectrogram.
 *
 * DIVERGENCE NOTE: librosa solves a non-negative least squares problem
 * (nnls(mel_basis, M)); this implementation uses the filterbank TRANSPOSE as
 * a pseudo-inverse — a rough approximation. Spectral shape (per-frame peak
 * location, cosine similarity vs |stft|) survives; absolute magnitudes do not.
 * @param {Array} M - Mel spectrogram [n_mels x n_frames]
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} power - Power for the spectrogram (2.0 for power, 1.0 for magnitude)
 * @param {Object} kwargs - Additional arguments for mel_filterbank
 * @returns {Array} Approximate STFT magnitude [n_freq x n_frames]
 */
export function mel_to_stft(M, sr = 22050, n_fft = 2048, power = 2.0, kwargs = {}) {
  const n_mels = M.length
  const n_frames = M[0] ? M[0].length : 0

  // Get mel filterbank [n_mels x n_freq]
  const mel_basis = mel_filterbank(sr, n_fft, n_mels, kwargs.fmin || 0, kwargs.fmax || sr/2, kwargs.norm || 'slaney', kwargs.htk || false)

  // Transpose filterbank for pseudo-inverse [n_freq x n_mels]
  const n_freq = mel_basis[0].length
  const mel_basis_T = Array(n_freq).fill(null).map(() => new Float32Array(n_mels))
  for (let i = 0; i < n_mels; i++) {
    for (let j = 0; j < n_freq; j++) {
      mel_basis_T[j][i] = mel_basis[i][j]
    }
  }

  // Approximate inverse using transpose (pseudo-inverse would be better but more complex)
  // S = mel_basis^T @ M
  const S = Array(n_freq).fill(null).map(() => new Float32Array(n_frames))
  for (let f = 0; f < n_freq; f++) {
    for (let t = 0; t < n_frames; t++) {
      let sum = 0
      for (let m = 0; m < n_mels; m++) {
        sum += mel_basis_T[f][m] * M[m][t]
      }
      S[f][t] = Math.max(0, sum) // Ensure non-negative
    }
  }

  // Convert power back to magnitude if needed
  if (power !== 1.0) {
    for (let f = 0; f < n_freq; f++) {
      for (let t = 0; t < n_frames; t++) {
        S[f][t] = Math.pow(S[f][t], 1.0 / power)
      }
    }
  }

  return S
}

/**
 * Invert a mel power spectrogram to audio using Griffin-Lim
 * @param {Array} M - Mel spectrogram [n_mels x n_frames]
 * @param {number} sr - Sample rate
 * @param {number} n_fft - FFT size
 * @param {number} hop_length - Hop length
 * @param {number} win_length - Window length
 * @param {string} window - Window type
 * @param {boolean} center - Center the frames
 * @param {string} pad_mode - Padding mode
 * @param {number} power - Power for spectrogram (2.0 for power, 1.0 for magnitude)
 * @param {number} n_iter - Number of Griffin-Lim iterations
 * @param {number|null} length - Output length
 * @param {*} dtype - Data type (unused in JS)
 * @param {Object} kwargs - Additional mel_filterbank arguments
 * @returns {Float32Array} Reconstructed audio
 */
export function mel_to_audio(
  M,
  sr = 22050,
  n_fft = 2048,
  hop_length = null,
  win_length = null,
  window = 'hann',
  center = true,
  pad_mode = 'constant',
  power = 2.0,
  n_iter = 32,
  length = null,
  dtype = null,
  kwargs = {}
) {
  if (hop_length === null) hop_length = Math.floor(n_fft / 4)
  if (win_length === null) win_length = n_fft

  // Convert mel to STFT magnitude
  const S = mel_to_stft(M, sr, n_fft, power, kwargs)

  // Use Griffin-Lim to reconstruct audio
  return griffinlim(
    S,
    n_iter,
    hop_length,
    win_length,
    n_fft,
    window,
    center,
    dtype,
    length,
    pad_mode,
    0.99, // momentum
    'random', // init
    null // random_state
  )
}

/**
 * Invert Mel-frequency cepstral coefficients to approximate a Mel power spectrogram
 * @param {Array} mfcc - MFCC matrix [n_mfcc x n_frames]
 * @param {number} n_mels - Number of Mel filters
 * @param {number} dct_type - DCT type (2 or 3)
 * @param {string|null} norm - DCT normalization
 * @param {number} ref - Reference value for dB conversion
 * @param {number} lifter - Liftering coefficient (0 to disable)
 * @returns {Array} Mel power spectrogram [n_mels x n_frames]
 */
export function mfcc_to_mel(
  mfcc,
  n_mels = 128,
  dct_type = 2,
  norm = 'ortho',
  ref = 1.0,
  lifter = 0
) {
  const n_mfcc = mfcc.length
  const n_frames = mfcc[0] ? mfcc[0].length : 0

  // Copy MFCC to avoid modifying input
  let mfcc_unliftered = mfcc.map(row => Float32Array.from(row))

  // Reverse liftering if applied — librosa indexing: sin(pi * (i + 1) / L)
  // (matches the corrected xa-mel lifter_mfcc; the old sin(pi*i/L) was an
  // off-by-one that left c0 unweighted)
  if (lifter > 0) {
    const lifter_weights = new Float32Array(n_mfcc)
    for (let i = 0; i < n_mfcc; i++) {
      lifter_weights[i] = 1 + (lifter / 2) * Math.sin((Math.PI * (i + 1)) / lifter)
    }

    // Divide by lifter weights to reverse the effect
    for (let i = 0; i < n_mfcc; i++) {
      for (let t = 0; t < n_frames; t++) {
        mfcc_unliftered[i][t] /= lifter_weights[i]
      }
    }
  }

  // Zero-padded inverse DCT along the mel axis — librosa does
  // scipy.fftpack.idct(mfcc, type=2, norm='ortho', n=n_mels): the n_mfcc
  // coefficients are zero-padded to n_mels, then a DCT-III (the inverse of
  // the ortho DCT-II used by the forward mfcc) expands each frame to n_mels.
  // The old code called xa-mel idct(coeffs, type, norm) as idct(frame,
  // n_mels, type, norm) — n_mels landed in `type` and threw 'Unsupported DCT
  // type: 128'; and idct cannot expand length anyway. Only the librosa
  // default (dct_type=2, norm='ortho') is implemented; anything else throws
  // honestly instead of silently mis-scaling.
  if (dct_type !== 2 || norm !== 'ortho') {
    throw new Error(
      `mfcc_to_mel: only dct_type=2 with norm='ortho' is implemented ` +
        `(got dct_type=${dct_type}, norm=${norm})`,
    )
  }

  const mel_db = Array(n_mels).fill(null).map(() => new Float32Array(n_frames))
  const scale0 = Math.sqrt(1 / n_mels)
  const scaleK = Math.sqrt(2 / n_mels)
  const kMax = Math.min(n_mfcc, n_mels) // scipy truncates when n < input length

  for (let t = 0; t < n_frames; t++) {
    for (let m = 0; m < n_mels; m++) {
      // DCT-III of the zero-padded coefficient vector (padded terms are 0)
      let acc = scale0 * mfcc_unliftered[0][t]
      for (let k = 1; k < kMax; k++) {
        acc +=
          scaleK *
          mfcc_unliftered[k][t] *
          Math.cos((Math.PI * k * (2 * m + 1)) / (2 * n_mels))
      }
      mel_db[m][t] = acc
    }
  }

  // Convert from dB back to power
  const mel_power = Array(n_mels).fill(null).map(() => new Float32Array(n_frames))
  for (let m = 0; m < n_mels; m++) {
    for (let t = 0; t < n_frames; t++) {
      mel_power[m][t] = db_to_power(mel_db[m][t], ref)
    }
  }

  return mel_power
}

/**
 * Convert Mel-frequency cepstral coefficients to a time-domain audio signal
 * @param {Array} mfcc - MFCC matrix [n_mfcc x n_frames]
 * @param {number} n_mels - Number of Mel filters
 * @param {number} dct_type - DCT type
 * @param {string|null} norm - DCT normalization
 * @param {number} ref - Reference value for dB conversion
 * @param {number} lifter - Liftering coefficient
 * @param {Object} kwargs - Additional arguments for mel_to_audio
 * @returns {Float32Array} Reconstructed audio
 */
export function mfcc_to_audio(
  mfcc,
  n_mels = 128,
  dct_type = 2,
  norm = 'ortho',
  ref = 1.0,
  lifter = 0,
  kwargs = {}
) {
  // Convert MFCC to Mel spectrogram
  const mel_spec = mfcc_to_mel(mfcc, n_mels, dct_type, norm, ref, lifter)

  // Convert Mel spectrogram to audio
  return mel_to_audio(
    mel_spec,
    kwargs.sr || 22050,
    kwargs.n_fft || 2048,
    kwargs.hop_length || null,
    kwargs.win_length || null,
    kwargs.window || 'hann',
    kwargs.center !== undefined ? kwargs.center : true,
    kwargs.pad_mode || 'constant',
    kwargs.power || 2.0,
    kwargs.n_iter || 32,
    kwargs.length || null,
    kwargs.dtype || null,
    kwargs
  )
}
