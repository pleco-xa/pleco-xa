import { describe, it, expect } from 'vitest'
import { loadFixture } from './helpers.js'
import { tempo, beat_track, BeatTracker } from '../../src/scripts/xa-beat-tracker.js'
import { onset_strength } from '../../src/scripts/xa-onset.js'

/**
 * Golden gates against committed reference fixtures (tools/goldens/tempo_beats.json):
 *   - expected_tempo:      reference tempo estimate (hop=512)
 *   - expected_beat_tempo: tempo returned by the reference beat tracker
 *   - expected_beats:      beat frames from the reference beat tracker (hop=512)
 *
 * The fixture values ARE the target (117.45 for the 120-BPM click is
 * the reference's lag-quantized answer — we match the committed reference
 * ground truth, not the nominal BPM).
 *
 * Gate: tempo within 2% relative; beats within ±1 frame per beat.
 * Currently achieved: 0% tempo error and exact frame agreement — asserted
 * at the achieved (tighter) level so regressions surface immediately.
 */
describe('golden: tempo/beat_track vs committed reference fixture (tempo_beats)', () => {
  const fx = loadFixture('tempo_beats')

  for (const c of fx.cases) {
    const { signal, sr, true_bpm } = c.input

    it(`tempo(${signal}) matches reference tempo within 2% (achieved: exact)`, () => {
      const y = new Float32Array(c.input.y)
      const est = tempo(y, { sr })

      // Required gate: 2% relative
      const relErr = Math.abs(est - c.expected_tempo) / c.expected_tempo
      expect(relErr, `tempo rel error for ${signal} (true ${true_bpm} BPM)`).toBeLessThan(0.02)

      // Achieved level: bit-exact lag-bin agreement with the reference
      expect(est).toBeCloseTo(c.expected_tempo, 10)
    })

    it(`beat_track(${signal}) matches reference tempo + beat frames (achieved: exact frames)`, () => {
      const y = new Float32Array(c.input.y)
      const { tempo: bpm, beats } = beat_track(y, sr)

      const relErr = Math.abs(bpm - c.expected_beat_tempo) / c.expected_beat_tempo
      expect(relErr, `beat_track tempo rel error for ${signal}`).toBeLessThan(0.02)

      // Required gate: same beat count, every beat within ±1 frame
      expect(beats.length, 'beat count').toBe(c.expected_beats.length)
      for (let i = 0; i < beats.length; i++) {
        expect(
          Math.abs(beats[i] - c.expected_beats[i]),
          `beat[${i}] frame deviation`,
        ).toBeLessThanOrEqual(1)
      }

      // Achieved level: exact frame agreement
      expect(beats).toEqual(c.expected_beats)
    })

    it(`beat_track(${signal}) accepts a pre-computed median-aggregated onset envelope`, () => {
      const y = new Float32Array(c.input.y)
      const env = onset_strength(y, { sr, aggregate: 'median' })
      const { beats } = beat_track(null, sr, { onsetEnvelope: env })
      expect(beats).toEqual(c.expected_beats)
    })

    it(`BeatTracker class wrapper reproduces beat_track(${signal})`, () => {
      const y = new Float32Array(c.input.y)
      const tracker = new BeatTracker()
      const { tempo: bpm, beats } = tracker.beatTrack({ y, sr })
      expect(bpm).toBeCloseTo(c.expected_beat_tempo, 10)
      expect(beats).toEqual(c.expected_beats)
    })
  }

  it('beat_track unit conversion: samples = frames * hop, time = frames * hop / sr', () => {
    const c = fx.cases[0]
    const y = new Float32Array(c.input.y)
    const sr = c.input.sr
    const frames = beat_track(y, sr, { units: 'frames' }).beats
    const samples = beat_track(y, sr, { units: 'samples' }).beats
    const times = beat_track(y, sr, { units: 'time' }).beats
    expect(samples).toEqual(frames.map((f) => f * 512))
    expect(times).toEqual(frames.map((f) => (f * 512) / sr))
  })

  it('beat_track on silence returns 0 BPM and no beats (reference semantics)', () => {
    const silence = new Float32Array(22050 * 3)
    const { tempo: bpm, beats } = beat_track(silence, 22050)
    expect(bpm).toBe(0)
    expect(beats).toEqual([])
  })

  it('never fabricates: invalid inputs throw instead of returning defaults', () => {
    expect(() => tempo(null, {})).toThrow()
    expect(() => tempo(new Float32Array(0), {})).toThrow()
    expect(() => tempo(new Float32Array(1024), { sr: 0 })).toThrow()
    expect(() => beat_track(null, 22050)).toThrow()
    expect(() => beat_track(new Float32Array(22050), 22050, { units: 'bogus' })).toThrow()
    expect(() => beat_track(new Float32Array(22050), -1)).toThrow()
  })
})
