import { describe, it, expect } from 'vitest'
import { eigh, laplacian } from '../../src/linalg/index.js'
import { loadFixture, expectClose } from './helpers.js'

const fixture = loadFixture('linalg')
const eighCase = fixture.cases.find((c) => c.input.fn === 'eigh')
const lapCase = fixture.cases.find((c) => c.input.fn === 'laplacian_normed')

/** Reshape a flat row-major array into nested rows. */
function reshape(flat, n) {
  const out = []
  for (let i = 0; i < n; i++) out.push(flat.slice(i * n, (i + 1) * n))
  return out
}

/** Flatten rows-of-arrays row-major. */
function flatten(rows) {
  const out = []
  for (const row of rows) for (const v of row) out.push(v)
  return out
}

/** V (columns = eigenvectors) · diag(vals) · Vᵀ — reconstruct the matrix. */
function reconstruct(vectors, values, n) {
  const out = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let k = 0; k < n; k++) s += vectors[i][k] * values[k] * vectors[j][k]
      out[i][j] = s
    }
  }
  return out
}

/** Vᵀ · V — should be identity for an orthonormal basis. */
function gram(vectors, n) {
  const out = Array.from({ length: n }, () => new Float64Array(n))
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      let s = 0
      for (let i = 0; i < n; i++) s += vectors[i][a] * vectors[i][b]
      out[a][b] = s
    }
  }
  return out
}

describe('eigh parity vs scipy.linalg.eigh (symmetric, cyclic Jacobi)', () => {
  const n = eighCase.input.n
  const A = reshape(eighCase.input.A, n)

  it('eigenvalues ascending within 1e-6 (fixture is float32-precision)', () => {
    const { values } = eigh(A)
    // strictly ascending
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
    expectClose(values, eighCase.eigenvalues, {
      rtol: 1e-6,
      atol: 1e-6,
      label: 'eigh eigenvalues',
    })
  })

  it('reconstruction V·diag(vals)·Vᵀ ≈ A within 1e-9', () => {
    const { values, vectors } = eigh(A)
    const R = reconstruct(vectors, values, n)
    expectClose(flatten(R), eighCase.reconstruct, {
      rtol: 0,
      atol: 1e-9,
      label: 'eigh reconstruction',
    })
  })

  it('orthonormality Vᵀ·V ≈ I within 1e-9', () => {
    const { vectors } = eigh(A)
    const G = gram(vectors, n)
    const I = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) I.push(i === j ? 1 : 0)
    expectClose(flatten(G), I, { rtol: 0, atol: 1e-9, label: 'eigh Vᵀ·V' })
  })

  it('accepts { flat, n } and 2D input identically', () => {
    const flatRes = eigh({ flat: eighCase.input.A, n })
    const twoDRes = eigh(A)
    expectClose(flatRes.values, twoDRes.values, {
      rtol: 0,
      atol: 1e-12,
      label: 'eigh flat-vs-2D',
    })
  })

  it('throws on a non-symmetric matrix with diagnostics', () => {
    expect(() => eigh([[1, 2], [3, 4]])).toThrow(/not symmetric/)
  })

  it('throws on a non-square matrix', () => {
    expect(() => eigh([[1, 2, 3], [4, 5, 6]])).toThrow(/square/)
  })

  it('handles the 1×1 trivial case', () => {
    const { values, vectors } = eigh([[7]])
    expect(Array.from(values)).toEqual([7])
    expect(vectors).toEqual([[1]])
  })
})

describe('laplacian parity vs scipy.sparse.csgraph.laplacian(normed=True)', () => {
  const n = lapCase.input.n
  const W = reshape(lapCase.input.W, n)

  it('L matches scipy within 1e-9', () => {
    const L = laplacian(W, { normed: true })
    expectClose(flatten(L), lapCase.expected, {
      rtol: 0,
      atol: 1e-9,
      label: 'laplacian L',
    })
  })

  it('eigh(L) eigenvalues match scipy L_eigenvalues within 1e-6', () => {
    const L = laplacian(W, { normed: true })
    const { values } = eigh(L)
    expectClose(values, lapCase.L_eigenvalues, {
      rtol: 1e-6,
      atol: 1e-6,
      label: 'laplacian eigenvalues',
    })
  })

  it('diagonal is all-ones for a fully-connected graph', () => {
    const L = laplacian(W, { normed: true })
    for (let i = 0; i < n; i++) expect(L[i][i]).toBeCloseTo(1, 12)
  })

  it('isolated node gets a zero diagonal (scipy convention)', () => {
    // Node 0 has no edges; nodes 1-2 are connected.
    const L = laplacian(
      [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 0],
      ],
      { normed: true },
    )
    expect(L[0][0]).toBe(0)
    expect(L[1][1]).toBeCloseTo(1, 12)
    expect(L[1][2]).toBeCloseTo(-1, 12)
  })

  it('accepts { flat, n } input', () => {
    const L = laplacian({ flat: lapCase.input.W, n })
    expectClose(flatten(L), lapCase.expected, {
      rtol: 0,
      atol: 1e-9,
      label: 'laplacian flat',
    })
  })

  it('throws on a non-square matrix', () => {
    expect(() => laplacian([[1, 2, 3], [4, 5, 6]])).toThrow(/square/)
  })
})
