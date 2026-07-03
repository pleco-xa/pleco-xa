import { describe, it, expect } from 'vitest'
import {
  transition_uniform,
  transition_loop,
  transition_cycle,
  transition_local,
  viterbi_discriminative,
} from '../../src/sequence/index.js'
import { loadFixture, expectClose } from './helpers.js'

const fixture = loadFixture('sequence_extra')

/** Reshape a flat row-major array into nested rows. */
function reshape(flat, rows, cols) {
  const out = []
  for (let i = 0; i < rows; i++) out.push(flat.slice(i * cols, (i + 1) * cols))
  return out
}

/** Dispatch a transition-matrix fixture case to the matching constructor. */
function buildTransition(input) {
  switch (input.fn) {
    case 'transition_uniform':
      return transition_uniform(input.n_states)
    case 'transition_loop':
      return transition_loop(input.n_states, input.prob)
    case 'transition_cycle':
      return transition_cycle(input.n_states, input.prob)
    case 'transition_local':
      return transition_local(input.n_states, input.width, input.window, input.wrap)
    default:
      throw new Error(`unhandled transition fixture: ${input.fn}`)
  }
}

describe('sequence parity vs librosa 0.11 (transition_* + viterbi_discriminative)', () => {
  for (const c of fixture.cases) {
    const { fn } = c.input

    if (fn === 'viterbi_discriminative') {
      it('viterbi_discriminative: exact integer path agreement', () => {
        const [nStates, nFrames] = c.input.shape
        const prob = reshape(c.input.prob, nStates, nFrames)
        const transition = reshape(c.input.transition, nStates, nStates)
        const path = viterbi_discriminative(prob, transition)
        expect(path).toEqual(c.expected_path)
      })
      continue
    }

    it(`${fn}: matrix within 1e-6 of librosa`, () => {
      const matrix = buildTransition(c.input)
      // Rows must be proper probability distributions (each sums to 1).
      for (const row of matrix) {
        const s = row.reduce((a, v) => a + v, 0)
        expect(s).toBeCloseTo(1, 6)
      }
      expectClose(matrix.flat(), c.expected, { rtol: 0, atol: 1e-6, label: fn })
    })
  }

  // The fixture uses a uniform p_state, which cannot distinguish dividing by
  // the prior (librosa) from multiplying by it. This golden pins the Bayes
  // direction: with p_state=[0.9, 0.1] the likelihood P(state|obs)/p_state
  // makes state 1 win both frames despite its lower raw posterior. A
  // multiply-by-prior implementation would decode [0, 0].
  it('viterbi_discriminative divides by p_state (librosa Bayes correction)', () => {
    const path = viterbi_discriminative(
      [
        [0.8, 0.6],
        [0.2, 0.4],
      ],
      transition_uniform(2),
      [0.9, 0.1],
    )
    expect(path).toEqual([1, 1])
  })

  // Regression guard for the inverted-cycle bug: the SELF-transition
  // probability must land on the diagonal, the remainder one step forward.
  it('transition_cycle puts the self-probability on the diagonal', () => {
    const t = transition_cycle(4, 0.9)
    expect(t[0][0]).toBeCloseTo(0.9, 12)
    expect(t[0][1]).toBeCloseTo(0.1, 12)
    expect(t[3][3]).toBeCloseTo(0.9, 12)
    expect(t[3][0]).toBeCloseTo(0.1, 12)
  })

  // Failure paths throw with diagnostics rather than returning garbage.
  it('constructors reject invalid inputs', () => {
    expect(() => transition_uniform(0)).toThrow(/positive integer/)
    expect(() => transition_loop(1, 0.5)).toThrow(/> 1/)
    expect(() => transition_loop(3, 1.5)).toThrow(/\[0, 1\]/)
    expect(() => transition_cycle(4, [0.9, 0.9])).toThrow(/length equal to n_states/)
    expect(() => transition_local(5, 3, 'hann')).toThrow(/unsupported window/)
    expect(() => transition_local(5, 0)).toThrow(/>= 1/)
  })
})
