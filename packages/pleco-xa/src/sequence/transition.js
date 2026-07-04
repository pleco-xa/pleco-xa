/**
 * Transition-matrix constructors.
 *
 * Provides transition_uniform / transition_loop / transition_cycle /
 * transition_local. Each row of the returned matrix is a proper probability
 * distribution (non-negative, sums to 1), the contract required by the
 * `viterbi*` decoders.
 *
 * transition_local follows the pipeline
 * get_window(window, width) → pad_center(n_states) → np.roll(n//2 + i + 1) →
 * off-band knockout (when wrap=False) → row-normalize — so it holds for any
 * width (odd or even), the 'triangle' and uniform ('ones') windows, and wrap
 * on/off, not just the odd-triangle case.
 *
 * Validated against committed reference fixtures (exact within 1e-6).
 * Scalar and typed-array (Float64Array / Int32Array) `prob`/`width` inputs are
 * both accepted. Invalid inputs throw with a diagnostic (never silently clamp).
 */

/** True when `x` is a finite integer strictly greater than 0. */
function isPositiveInt(x) {
  return Number.isInteger(x) && x > 0
}

/**
 * Coerce a scalar-or-iterable per-state parameter into a length-`nStates`
 * numeric array. Mirrors `np.asarray` + scalar-tile behavior.
 */
function toStateVector(value, nStates, name) {
  let vec
  if (typeof value === 'number') {
    vec = new Array(nStates).fill(value)
  } else if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    vec = Array.from(value, Number)
  } else {
    throw new Error(
      `transition: ${name} must be a number or an array of length n_states=${nStates}`,
    )
  }
  if (vec.length !== nStates) {
    throw new Error(
      `transition: ${name} must have length equal to n_states=${nStates} (got ${vec.length})`,
    )
  }
  return vec
}

/**
 * Construct a uniform transition matrix over `nStates`.
 * `transition[i][j] = 1 / nStates`.
 *
 * @param {number} nStates - Number of states (positive integer).
 * @returns {number[][]} Row-stochastic transition matrix.
 */
export function transition_uniform(nStates) {
  if (!isPositiveInt(nStates)) {
    throw new Error(`transition_uniform: n_states=${nStates} must be a positive integer`)
  }
  const p = 1.0 / nStates
  return Array.from({ length: nStates }, () => new Array(nStates).fill(p))
}

/**
 * Construct a self-loop transition matrix.
 * `transition[i][i] = p`, `transition[i][j] = (1 - p) / (nStates - 1)` for
 * `j != i`.
 *
 * @param {number} nStates - Number of states (> 1).
 * @param {number|number[]|Float64Array} prob - Self-transition probability,
 *   scalar or per-state vector. Each value must lie in [0, 1].
 * @returns {number[][]} Row-stochastic transition matrix.
 */
export function transition_loop(nStates, prob) {
  if (!(isPositiveInt(nStates) && nStates > 1)) {
    throw new Error(`transition_loop: n_states=${nStates} must be a positive integer > 1`)
  }
  const p = toStateVector(prob, nStates, 'prob')
  for (const v of p) {
    if (!(v >= 0 && v <= 1)) {
      throw new Error(`transition_loop: prob=${p} must have values in the range [0, 1]`)
    }
  }

  const trans = []
  for (let i = 0; i < nStates; i++) {
    const other = (1.0 - p[i]) / (nStates - 1)
    const row = new Array(nStates).fill(other)
    row[i] = p[i]
    trans.push(row)
  }
  return trans
}

/**
 * Construct a cyclic transition matrix.
 * `transition[i][i] = p`, `transition[i][(i + 1) mod nStates] = 1 - p`.
 *
 * NOTE: `prob` is the SELF-transition (stay) probability —
 * e.g. `transition_cycle(4, 0.9)` has 0.9 on the diagonal and 0.1 one step
 * forward. (The prior pleco implementation had this inverted.)
 *
 * @param {number} nStates - Number of states (> 1).
 * @param {number|number[]|Float64Array} prob - Self-transition probability,
 *   scalar or per-state vector. Each value must lie in [0, 1].
 * @returns {number[][]} Row-stochastic transition matrix.
 */
export function transition_cycle(nStates, prob) {
  if (!(isPositiveInt(nStates) && nStates > 1)) {
    throw new Error(`transition_cycle: n_states=${nStates} must be a positive integer > 1`)
  }
  const p = toStateVector(prob, nStates, 'prob')
  for (const v of p) {
    if (!(v >= 0 && v <= 1)) {
      throw new Error(`transition_cycle: prob=${p} must have values in the range [0, 1]`)
    }
  }

  const trans = Array.from({ length: nStates }, () => new Array(nStates).fill(0))
  for (let i = 0; i < nStates; i++) {
    trans[i][(i + 1) % nStates] = 1.0 - p[i]
    trans[i][i] = p[i]
  }
  return trans
}

/**
 * scipy.signal.windows.triang(M, sym=True) — symmetric triangular window.
 * Reproduced exactly for `transition_local(window='triangle')`.
 */
function triang(M) {
  if (!isPositiveInt(M)) {
    throw new Error(`transition_local: window width=${M} must be a positive integer`)
  }
  const half = Math.floor((M + 1) / 2)
  const w = new Array(M)
  if (M % 2 === 0) {
    for (let n = 1; n <= half; n++) w[n - 1] = (2 * n - 1.0) / M
    for (let k = 0; k < half; k++) w[half + k] = w[half - 1 - k]
  } else {
    for (let n = 1; n <= half; n++) w[n - 1] = (2 * n) / (M + 1.0)
    for (let k = 0; k < half - 1; k++) w[half + k] = w[half - 2 - k]
  }
  return w
}

/**
 * Subset of get_window needed by transition_local: the
 * triangular window and the constant ('ones') window. Other window specs throw
 * with a diagnostic rather than silently producing an unrelated matrix.
 */
function getWindow(window, width) {
  const name = typeof window === 'string' ? window.toLowerCase() : window
  if (name === 'triangle' || name === 'tri' || name === 'triang') {
    return triang(width)
  }
  if (
    name === 'ones' ||
    name === 'box' ||
    name === 'boxcar' ||
    name === 'rectangular' ||
    name === 'rect' ||
    name === 'uniform'
  ) {
    return new Array(width).fill(1)
  }
  throw new Error(
    `transition_local: unsupported window '${window}'. ` +
      `Supported: 'triangle', 'ones' (uniform).`,
  )
}

/**
 * pad_center — center `data` inside a zero array of `size`.
 * Left pad = floor((size - n) / 2). Throws when the window is wider than size.
 */
function padCenter(data, size) {
  const n = data.length
  const lpad = Math.floor((size - n) / 2)
  if (lpad < 0 || lpad + n > size) {
    throw new Error(
      `transition_local: window length ${n} cannot be centered within n_states=${size}`,
    )
  }
  const out = new Array(size).fill(0)
  for (let i = 0; i < n; i++) out[lpad + i] = data[i]
  return out
}

/** np.roll — circular shift; result[j] = arr[(j - shift) mod n]. */
function roll(arr, shift) {
  const n = arr.length
  const s = ((shift % n) + n) % n
  const out = new Array(n)
  for (let j = 0; j < n; j++) out[j] = arr[((j - s) % n + n) % n]
  return out
}

/**
 * Construct a localized transition matrix.
 * State `i` transitions only to nearby states, weighted by `window` over a band
 * of `width`. Off-band entries are zero (unless `wrap` extends locality modulo
 * `nStates`), and each row is normalized to sum to 1.
 *
 * @param {number} nStates - Number of states (> 1).
 * @param {number|number[]|Int32Array} width - Local band width, scalar or
 *   per-state vector. Each value must be >= 1.
 * @param {string} [window='triangle'] - Window shape ('triangle' or 'ones').
 * @param {boolean} [wrap=false] - Compute locality modulo nStates when true.
 * @returns {number[][]} Row-stochastic transition matrix.
 */
export function transition_local(nStates, width, window = 'triangle', wrap = false) {
  if (!(isPositiveInt(nStates) && nStates > 1)) {
    throw new Error(`transition_local: n_states=${nStates} must be a positive integer > 1`)
  }

  let widths
  if (typeof width === 'number') {
    widths = new Array(nStates).fill(width)
  } else if (ArrayBuffer.isView(width) || Array.isArray(width)) {
    widths = Array.from(width, Number)
  } else {
    throw new Error(
      `transition_local: width must be a number or array of length n_states=${nStates}`,
    )
  }
  if (widths.length !== nStates) {
    throw new Error(
      `transition_local: width must have length equal to n_states=${nStates} (got ${widths.length})`,
    )
  }
  for (const w of widths) {
    if (!(Number.isInteger(w) && w >= 1)) {
      throw new Error(`transition_local: width=${widths} must be integers >= 1`)
    }
  }

  const trans = []
  for (let i = 0; i < nStates; i++) {
    const wi = widths[i]
    const half = Math.floor(wi / 2)

    let row = padCenter(getWindow(window, wi), nStates)
    row = roll(row, Math.floor(nStates / 2) + i + 1)

    if (!wrap) {
      // Knock out the off-diagonal-band elements (slice semantics).
      const hi = Math.min(nStates, i + half + 1)
      for (let k = hi; k < nStates; k++) row[k] = 0
      const lo = Math.max(0, i - half)
      for (let k = 0; k < lo; k++) row[k] = 0
    }

    // Row-normalize.
    let sum = 0
    for (let k = 0; k < nStates; k++) sum += row[k]
    if (sum === 0) {
      throw new Error(
        `transition_local: row ${i} has zero total weight (window '${window}', width ${wi})`,
      )
    }
    for (let k = 0; k < nStates; k++) row[k] /= sum

    trans.push(row)
  }
  return trans
}
