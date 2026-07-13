/**
 * tests/engine-channel-mixing.test.js — W3C channel up/down-mix tables +
 * computedNumberOfChannels (spec § channel-up-mixing-and-down-mixing,
 * § UpMix-sub, § down-mix, § ChannelCountMode).
 *
 * Expected values are hand-computed in float32 (Math.fround) mirroring the
 * spec equations exactly. Buffers are plain AudioBuffer-shaped objects — no
 * engine buffer import, matching the module's contract.
 */
import { describe, it, expect } from 'vitest'
import { mixInto, computeNumberOfChannels } from '../src/engine/xa-channel-mixing.js'

const f32 = Math.fround
const SQRT1_2 = f32(Math.SQRT1_2)

/** AudioBuffer-shaped test double from per-channel sample arrays. */
function makeBuffer(channels) {
  const data = channels.map((c) => Float32Array.from(c))
  return {
    numberOfChannels: data.length,
    length: data[0].length,
    sampleRate: 48000,
    getChannelData(c) {
      return data[c]
    },
  }
}

/** All-zero AudioBuffer-shaped destination. */
function zeros(numberOfChannels, length) {
  return makeBuffer(Array.from({ length: numberOfChannels }, () => new Array(length).fill(0)))
}

describe('mixInto — speakers up-mix (spec § UpMix-sub)', () => {
  it('1 -> 2: mono replicated into L and R', () => {
    const dest = zeros(2, 2)
    mixInto(dest, makeBuffer([[0.25, -0.5]]))
    expect(Array.from(dest.getChannelData(0))).toEqual([0.25, -0.5])
    expect(Array.from(dest.getChannelData(1))).toEqual([0.25, -0.5])
  })

  it('1 -> 4: mono into L and R only, SL/SR silent', () => {
    const dest = zeros(4, 1)
    mixInto(dest, makeBuffer([[0.75]]))
    expect(dest.getChannelData(0)[0]).toBe(0.75)
    expect(dest.getChannelData(1)[0]).toBe(0.75)
    expect(dest.getChannelData(2)[0]).toBe(0)
    expect(dest.getChannelData(3)[0]).toBe(0)
  })

  it('1 -> 5.1: mono into CENTER channel only', () => {
    const dest = zeros(6, 1)
    mixInto(dest, makeBuffer([[0.5]]))
    expect(dest.getChannelData(0)[0]).toBe(0) // L
    expect(dest.getChannelData(1)[0]).toBe(0) // R
    expect(dest.getChannelData(2)[0]).toBe(0.5) // C
    expect(dest.getChannelData(3)[0]).toBe(0) // LFE
    expect(dest.getChannelData(4)[0]).toBe(0) // SL
    expect(dest.getChannelData(5)[0]).toBe(0) // SR
  })

  it('2 -> 4: L/R pass through, SL/SR silent', () => {
    const dest = zeros(4, 1)
    mixInto(dest, makeBuffer([[0.25], [-0.75]]))
    expect(dest.getChannelData(0)[0]).toBe(0.25)
    expect(dest.getChannelData(1)[0]).toBe(-0.75)
    expect(dest.getChannelData(2)[0]).toBe(0)
    expect(dest.getChannelData(3)[0]).toBe(0)
  })

  it('2 -> 5.1: L/R pass through, C/LFE/SL/SR silent', () => {
    const dest = zeros(6, 1)
    mixInto(dest, makeBuffer([[0.25], [-0.75]]))
    expect(dest.getChannelData(0)[0]).toBe(0.25)
    expect(dest.getChannelData(1)[0]).toBe(-0.75)
    for (let c = 2; c < 6; c++) expect(dest.getChannelData(c)[0]).toBe(0)
  })

  it('4 -> 5.1: L/R to 0/1, SL/SR to 4/5, C/LFE silent', () => {
    const dest = zeros(6, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4]]))
    expect(dest.getChannelData(0)[0]).toBe(f32(0.1))
    expect(dest.getChannelData(1)[0]).toBe(f32(0.2))
    expect(dest.getChannelData(2)[0]).toBe(0)
    expect(dest.getChannelData(3)[0]).toBe(0)
    expect(dest.getChannelData(4)[0]).toBe(f32(0.3))
    expect(dest.getChannelData(5)[0]).toBe(f32(0.4))
  })
})

describe('mixInto — speakers down-mix (spec § down-mix)', () => {
  it('2 -> 1: output = 0.5 * (L + R)', () => {
    const dest = zeros(1, 2)
    mixInto(dest, makeBuffer([[0.25, 0.1], [0.5, 0.2]]))
    expect(dest.getChannelData(0)[0]).toBe(0.375) // exact in float32
    expect(dest.getChannelData(0)[1]).toBe(f32(0.5 * (f32(0.1) + f32(0.2))))
  })

  it('4 -> 1: output = 0.25 * (L + R + SL + SR)', () => {
    const dest = zeros(1, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4]]))
    expect(dest.getChannelData(0)[0]).toBe(f32(0.25 * (f32(0.1) + f32(0.2) + f32(0.3) + f32(0.4))))
  })

  it('5.1 -> 1: output = sqrt(1/2)*(L+R) + C + 0.5*(SL+SR), LFE dropped', () => {
    const dest = zeros(1, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4], [0.5], [0.6]]))
    expect(dest.getChannelData(0)[0]).toBe(
      f32(SQRT1_2 * (f32(0.1) + f32(0.2)) + f32(0.3) + 0.5 * (f32(0.5) + f32(0.6))),
    )
  })

  it('5.1 -> 1: LFE has no influence on the result', () => {
    const a = zeros(1, 1)
    const b = zeros(1, 1)
    mixInto(a, makeBuffer([[0.1], [0.2], [0.3], [0.9], [0.5], [0.6]]))
    mixInto(b, makeBuffer([[0.1], [0.2], [0.3], [-0.9], [0.5], [0.6]]))
    expect(a.getChannelData(0)[0]).toBe(b.getChannelData(0)[0])
  })

  it('4 -> 2: L = 0.5*(L+SL), R = 0.5*(R+SR)', () => {
    const dest = zeros(2, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4]]))
    expect(dest.getChannelData(0)[0]).toBe(f32(0.5 * (f32(0.1) + f32(0.3))))
    expect(dest.getChannelData(1)[0]).toBe(f32(0.5 * (f32(0.2) + f32(0.4))))
  })

  it('5.1 -> 2: L = L + sqrt(1/2)*(C+SL), R = R + sqrt(1/2)*(C+SR), LFE dropped', () => {
    const dest = zeros(2, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4], [0.5], [0.6]]))
    expect(dest.getChannelData(0)[0]).toBe(f32(f32(0.1) + SQRT1_2 * (f32(0.3) + f32(0.5))))
    expect(dest.getChannelData(1)[0]).toBe(f32(f32(0.2) + SQRT1_2 * (f32(0.3) + f32(0.6))))
  })

  it('5.1 -> 4: L = L + sqrt(1/2)*C, R = R + sqrt(1/2)*C, SL/SR pass through, LFE dropped', () => {
    const dest = zeros(4, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4], [0.5], [0.6]]))
    expect(dest.getChannelData(0)[0]).toBe(f32(f32(0.1) + SQRT1_2 * f32(0.3)))
    expect(dest.getChannelData(1)[0]).toBe(f32(f32(0.2) + SQRT1_2 * f32(0.3)))
    expect(dest.getChannelData(2)[0]).toBe(f32(0.5))
    expect(dest.getChannelData(3)[0]).toBe(f32(0.6))
  })
})

describe("mixInto — 'discrete' interpretation", () => {
  it('up-mix 2 -> 6: fills first two channels, remaining stay silent', () => {
    const dest = zeros(6, 1)
    mixInto(dest, makeBuffer([[0.25], [0.5]]), 'discrete')
    expect(dest.getChannelData(0)[0]).toBe(0.25)
    expect(dest.getChannelData(1)[0]).toBe(0.5)
    for (let c = 2; c < 6; c++) expect(dest.getChannelData(c)[0]).toBe(0)
  })

  it('down-mix 6 -> 2: first two channels straight, remaining dropped (no coefficients)', () => {
    const dest = zeros(2, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4], [0.5], [0.6]]), 'discrete')
    expect(dest.getChannelData(0)[0]).toBe(f32(0.1))
    expect(dest.getChannelData(1)[0]).toBe(f32(0.2))
  })

  it('up-mix 1 -> 2 discrete does NOT replicate: channel 1 stays silent', () => {
    const dest = zeros(2, 1)
    mixInto(dest, makeBuffer([[0.75]]), 'discrete')
    expect(dest.getChannelData(0)[0]).toBe(0.75)
    expect(dest.getChannelData(1)[0]).toBe(0)
  })
})

describe("mixInto — 'speakers' reverts to discrete for non-standard layouts (spec § ChannelInterpretation)", () => {
  it('2 -> 3: fills first two, third silent', () => {
    const dest = zeros(3, 1)
    mixInto(dest, makeBuffer([[0.25], [0.5]]))
    expect(dest.getChannelData(0)[0]).toBe(0.25)
    expect(dest.getChannelData(1)[0]).toBe(0.5)
    expect(dest.getChannelData(2)[0]).toBe(0)
  })

  it('3 -> 1: keeps channel 0, drops the rest', () => {
    const dest = zeros(1, 1)
    mixInto(dest, makeBuffer([[0.25], [0.5], [0.75]]))
    expect(dest.getChannelData(0)[0]).toBe(0.25)
  })

  it('6 -> 5: no speakers table entry — discrete fill', () => {
    const dest = zeros(5, 1)
    mixInto(dest, makeBuffer([[0.1], [0.2], [0.3], [0.4], [0.5], [0.6]]))
    for (let c = 0; c < 5; c++) {
      expect(dest.getChannelData(c)[0]).toBe(f32((c + 1) / 10))
    }
  })
})

describe('mixInto — accumulation (multiple connections sum)', () => {
  it('same-count 2 -> 2 sums straight into a non-empty destination', () => {
    const dest = makeBuffer([[0.25, 0.5], [1, -1]])
    mixInto(dest, makeBuffer([[0.25, 0.25], [-0.5, 0.5]]))
    expect(Array.from(dest.getChannelData(0))).toEqual([0.5, 0.75])
    expect(Array.from(dest.getChannelData(1))).toEqual([0.5, -0.5])
  })

  it('mono + stereo connections into a stereo input sum per channel', () => {
    const dest = zeros(2, 1)
    mixInto(dest, makeBuffer([[0.25]])) // mono up-mixed into both channels
    mixInto(dest, makeBuffer([[0.5], [-0.125]])) // stereo straight sum
    expect(dest.getChannelData(0)[0]).toBe(0.75)
    expect(dest.getChannelData(1)[0]).toBe(0.125)
  })

  it('2 -> 1 down-mix accumulates onto existing content', () => {
    const dest = makeBuffer([[0.25]])
    mixInto(dest, makeBuffer([[0.5], [1]]))
    expect(dest.getChannelData(0)[0]).toBe(f32(0.25 + 0.5 * (0.5 + 1))) // 1.0
  })

  it('mixing the same mono source twice doubles it', () => {
    const dest = zeros(1, 1)
    const src = makeBuffer([[0.375]])
    mixInto(dest, src)
    mixInto(dest, src)
    expect(dest.getChannelData(0)[0]).toBe(0.75)
  })
})

describe('mixInto — frame extents and contract', () => {
  it('mixes min(dest.length, src.length) frames, leaving the tail untouched', () => {
    const dest = zeros(1, 4)
    mixInto(dest, makeBuffer([[0.5, 0.5]]))
    expect(Array.from(dest.getChannelData(0))).toEqual([0.5, 0.5, 0, 0])
  })

  it('returns dest', () => {
    const dest = zeros(1, 1)
    expect(mixInto(dest, makeBuffer([[0.5]]))).toBe(dest)
  })

  it('throws TypeError on an invalid interpretation (no silent fallback)', () => {
    const dest = zeros(1, 1)
    expect(() => mixInto(dest, makeBuffer([[0.5]]), 'surround')).toThrow(TypeError)
  })
})

describe('computeNumberOfChannels (spec § ChannelCountMode)', () => {
  it("'max': maximum of all connections' channels; channelCount ignored", () => {
    expect(computeNumberOfChannels('max', 2, 6)).toBe(6)
    expect(computeNumberOfChannels('max', 8, 1)).toBe(1)
  })

  it("'clamped-max': as 'max', clamped to channelCount", () => {
    expect(computeNumberOfChannels('clamped-max', 2, 6)).toBe(2)
    expect(computeNumberOfChannels('clamped-max', 8, 6)).toBe(6)
    expect(computeNumberOfChannels('clamped-max', 4, 4)).toBe(4)
  })

  it("'explicit': exactly channelCount", () => {
    expect(computeNumberOfChannels('explicit', 4, 1)).toBe(4)
    expect(computeNumberOfChannels('explicit', 1, 6)).toBe(1)
  })

  it('throws TypeError on an unknown mode', () => {
    expect(() => computeNumberOfChannels('maximum', 2, 2)).toThrow(TypeError)
  })

  it('throws RangeError on non-positive-integer channelCount or maxSourceChannels', () => {
    expect(() => computeNumberOfChannels('max', 0, 2)).toThrow(RangeError)
    expect(() => computeNumberOfChannels('max', 2.5, 2)).toThrow(RangeError)
    expect(() => computeNumberOfChannels('explicit', 2, 0)).toThrow(RangeError)
    expect(() => computeNumberOfChannels('explicit', 2, NaN)).toThrow(RangeError)
  })
})

describe('mixInto — speakers table collision guard (counts outside {1,2,4,6} revert to discrete)', () => {
  it('1 -> 14 mixes discrete (fill channel 0), never the aliased 2->4 speakers key (24)', () => {
    const dest = zeros(14, 2)
    mixInto(dest, makeBuffer([[0.5, -0.25]]))
    expect(Array.from(dest.getChannelData(0))).toEqual([0.5, -0.25]) // discrete: fill in order
    for (let c = 1; c < 14; c++) {
      expect(Array.from(dest.getChannelData(c))).toEqual([0, 0]) // remainder untouched
    }
  })

  it('16 -> 2 mixes discrete (drop extra channels), never an aliased speakers key', () => {
    const dest = zeros(2, 1)
    const src = zeros(16, 1)
    src.getChannelData(0)[0] = 0.5
    src.getChannelData(1)[0] = -0.5
    src.getChannelData(15)[0] = 1 // must be dropped, not routed via any table
    mixInto(dest, src)
    expect(dest.getChannelData(0)[0]).toBe(0.5)
    expect(dest.getChannelData(1)[0]).toBe(-0.5)
  })
})
