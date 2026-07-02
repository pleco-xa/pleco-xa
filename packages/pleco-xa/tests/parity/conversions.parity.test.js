import { describe, it, expect } from 'vitest'
import { loadFixture, expectClose } from './helpers.js'
import * as convert from '../../src/scripts/xa-convert.js'

const fx = loadFixture('conversions')
const wfx = loadFixture('weighting')
const ffx = loadFixture('fft_frequencies')

function run(input) {
  switch (input.fn) {
    case 'hz_to_mel': return convert.hz_to_mel(input.hz, input.htk)
    case 'mel_to_hz': return convert.mel_to_hz(input.mel, input.htk)
    case 'hz_to_midi': return convert.hz_to_midi(input.hz)
    case 'midi_to_hz': return convert.midi_to_hz(input.midi)
    case 'amplitude_to_db': return convert.amplitude_to_db(input.S, input.ref, 1e-5, null)
    case 'power_to_db': return convert.power_to_db(input.S, input.ref, 1e-10, null)
    case 'db_to_amplitude': return convert.db_to_amplitude(input.db)
    case 'db_to_power': return convert.db_to_power(input.db)
    case 'frames_to_time': return convert.frames_to_time(input.frames, input.sr, input.hop_length)
    case 'time_to_frames': return convert.time_to_frames(input.times, input.sr, input.hop_length)
    case 'samples_to_frames': return convert.samples_to_frames(input.samples, input.hop_length)
    default: throw new Error(`unmapped fixture fn ${input.fn}`)
  }
}

describe('parity: conversions (librosa.core.convert)', () => {
  for (const c of fx.cases) {
    it(`${c.input.fn}(${JSON.stringify(c.input).slice(0, 60)}...)`, () => {
      expectClose(run(c.input), c.expected, { label: c.input.fn, rtol: 1e-5, atol: 1e-6 })
    })
  }

  it('hz_to_mel accepts Float32Array input (typed-array dispatch)', () => {
    const hzCase = fx.cases.find(c => c.input.fn === 'hz_to_mel' && !c.input.htk)
    const out = convert.hz_to_mel(new Float32Array(hzCase.input.hz), false)
    for (const v of Array.from(out)) expect(Number.isFinite(v)).toBe(true)
    expectClose(out, hzCase.expected, { label: 'hz_to_mel(Float32Array)', rtol: 1e-5, atol: 1e-6 })
  })
})

describe('parity: frequency weighting curves', () => {
  const W = { A: convert.a_weighting, B: convert.b_weighting, C: convert.c_weighting, D: convert.d_weighting }
  for (const c of wfx.cases) {
    it(`${c.input.kind}-weighting matches librosa`, () => {
      expectClose(W[c.input.kind](c.input.frequencies, -Infinity), c.expected, { label: `${c.input.kind}-weighting`, rtol: 1e-4, atol: 1e-4 })
    })
  }
})

describe('parity: fft_frequencies', () => {
  for (const c of ffx.cases) {
    it(`fft_frequencies(sr=${c.input.sr}, n_fft=${c.input.n_fft})`, () => {
      expectClose(convert.fft_frequencies(c.input.sr, c.input.n_fft), c.expected, { label: 'fft_frequencies', rtol: 1e-6, atol: 1e-6 })
    })
  }
})
