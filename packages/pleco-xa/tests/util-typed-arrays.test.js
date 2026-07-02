import { describe, it, expect } from 'vitest'
import { frame, validAudio, normalize, tiny } from '../src/scripts/xa-util.js'

// Float32Array is the platform's native audio type; these used to silently
// return [] (frame) or throw "not finite everywhere" (validAudio/normalize).
describe('xa-util typed-array support', () => {
  const y = new Float32Array([0.5, -0.25, 0.75, 0.1, -0.6, 0.3])

  it('frame() slices Float32Array into real frames', () => {
    const frames = frame(y, { frameLength: 4, hopLength: 2 })
    expect(frames.length).toBe(2)
    expect(Array.from(frames[0])).toEqual([0.5, -0.25, 0.75, 0.1].map(Math.fround))
    expect(frames[1].length).toBe(4)
  })

  it('validAudio() accepts finite Float32Array and rejects NaN', () => {
    expect(validAudio(y)).toBe(true)
    expect(() => validAudio(new Float32Array([1, NaN]))).toThrow(/finite/)
  })

  it('validAudio() rejects multichannel when mono=true, including typed rows', () => {
    expect(() => validAudio([new Float32Array(4), new Float32Array(4)], true)).toThrow(/mono/)
  })

  it('normalize() handles Float32Array (inf-norm default)', () => {
    const out = normalize(y)
    expect(Math.max(...Array.from(out).map(Math.abs))).toBeCloseTo(1.0, 6)
  })

  it('normalize() handles 2D arrays with Float32Array rows', () => {
    const out = normalize([new Float32Array([1, 2]), new Float32Array([3, 4])], { axis: -1 })
    expect(out.length).toBe(2)
    for (const row of out) for (const v of Array.from(row)) expect(Number.isFinite(v)).toBe(true)
  })

  it('tiny() matches np.finfo(float32).tiny', () => {
    expect(tiny()).toBeCloseTo(1.1754943508222875e-38, 45)
  })
})
