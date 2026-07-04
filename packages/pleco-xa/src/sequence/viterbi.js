/**
 * Viterbi decoding.
 *
 * Provides `viterbi` (from observation likelihoods) and `viterbi_discriminative`
 * (from p_state-normalized posteriors).
 * The core recursion runs entirely in the log domain for numerical stability
 * and breaks argmax ties toward the lowest state index, matching numpy's
 * `np.argmax` — required for exact integer path agreement.
 *
 * viterbi_discriminative applies Bayes' rule: the
 * observation likelihood is proportional to P(state | obs) / P(state), i.e. in
 * log space `log(prob) - log(p_state)` (DIVIDE by the prior). An older pleco
 * copy multiplied by the prior, inverting the correction for any non-uniform
 * p_state; this module divides.
 *
 * Validated against committed reference fixtures
 * (viterbi_discriminative path — exact integer agreement).
 */

// Log-domain underflow floor. A dtype `tiny` is idiomatic; 1e-10 is a safe
// floor that leaves every well-conditioned decode (probabilities and
// transitions away from 0) numerically exact on the argmax path.
const LOG_FLOOR = 1e-10

const logFloor = (x) => Math.log(Math.max(x, LOG_FLOOR))

/**
 * Core Viterbi recursion over log-domain inputs.
 *
 * @param {ArrayLike<ArrayLike<number>>} logProb - log P[obs(t) | state=s],
 *   indexed [state][frame].
 * @param {ArrayLike<ArrayLike<number>>} logTrans - log transition, [from][to].
 * @param {ArrayLike<number>} logPInit - log initial distribution, [state].
 * @returns {{ path: number[], logp: number }}
 */
function _viterbi(logProb, logTrans, logPInit) {
  const nStates = logProb.length
  const nFrames = logProb[0].length

  // Value table and backpointers (typed-array first-class hot path).
  const value = Array.from({ length: nStates }, () => new Float64Array(nFrames))
  const ptr = Array.from({ length: nStates }, () => new Int32Array(nFrames))

  for (let s = 0; s < nStates; s++) {
    value[s][0] = logPInit[s] + logProb[s][0]
  }

  for (let t = 1; t < nFrames; t++) {
    for (let s = 0; s < nStates; s++) {
      // max_k value[k, t-1] + log_trans[k, s]; strict > keeps the lowest k on
      // ties, matching np.argmax.
      let best = -Infinity
      let arg = 0
      for (let k = 0; k < nStates; k++) {
        const cand = value[k][t - 1] + logTrans[k][s]
        if (cand > best) {
          best = cand
          arg = k
        }
      }
      value[s][t] = best + logProb[s][t]
      ptr[s][t] = arg
    }
  }

  // Terminal state = argmax over the last column (lowest index on ties).
  let last = 0
  let lastVal = value[0][nFrames - 1]
  for (let s = 1; s < nStates; s++) {
    if (value[s][nFrames - 1] > lastVal) {
      lastVal = value[s][nFrames - 1]
      last = s
    }
  }

  const path = new Array(nFrames)
  path[nFrames - 1] = last
  for (let t = nFrames - 2; t >= 0; t--) {
    path[t] = ptr[path[t + 1]][t + 1]
  }

  return { path, logp: lastVal }
}

/**
 * Viterbi decoding from observation likelihoods.
 *
 * @param {ArrayLike<ArrayLike<number>>} prob - P[obs(t) | state=s], indexed
 *   [state][frame]; non-negative.
 * @param {ArrayLike<ArrayLike<number>>} transition - Row-stochastic transition
 *   matrix [n_states x n_states].
 * @param {ArrayLike<number>|null} [p_init=null] - Initial state distribution;
 *   uniform when null.
 * @param {boolean} [return_logp=false] - Also return the log-probability of the
 *   decoded path.
 * @returns {number[]|{states: number[], logp: number}}
 */
export function viterbi(prob, transition, p_init = null, return_logp = false) {
  const nStates = prob.length
  if (nStates === 0 || prob[0].length === 0) {
    throw new Error('viterbi: prob must be a non-empty [n_states x n_frames] matrix')
  }
  if (transition.length !== nStates) {
    throw new Error(
      `viterbi: transition.shape must be (n_states, n_states)=(${nStates}, ${nStates})`,
    )
  }

  const pInit = p_init === null ? new Array(nStates).fill(1.0 / nStates) : p_init
  if (pInit.length !== nStates) {
    throw new Error(`viterbi: p_init must have length n_states=${nStates}`)
  }

  const logProb = Array.from(prob, (row) => Array.from(row, logFloor))
  const logTrans = Array.from(transition, (row) => Array.from(row, logFloor))
  const logPInit = Array.from(pInit, logFloor)

  const { path, logp } = _viterbi(logProb, logTrans, logPInit)
  return return_logp ? { states: path, logp } : path
}

/**
 * Viterbi decoding from discriminative (mutually exclusive) state posteriors.
 *
 * Observation likelihood ∝ P(state | obs) / P(state); computed in
 * log space as `log(prob) - log(p_state)`. This function forms the ratio and
 * defers the log/decoding to `viterbi`.
 *
 * @param {ArrayLike<ArrayLike<number>>} prob - P[state=s | obs(t)], indexed
 *   [state][frame]; each frame (column) should sum to 1.
 * @param {ArrayLike<ArrayLike<number>>} transition - Row-stochastic transition
 *   matrix [n_states x n_states].
 * @param {ArrayLike<number>|null} [p_state=null] - Marginal state distribution;
 *   uniform when null.
 * @param {ArrayLike<number>|null} [p_init=null] - Initial state distribution;
 *   uniform when null.
 * @param {boolean} [return_logp=false] - Also return the (unnormalized)
 *   log-probability of the decoded path.
 * @returns {number[]|{states: number[], logp: number}}
 */
export function viterbi_discriminative(
  prob,
  transition,
  p_state = null,
  p_init = null,
  return_logp = false,
) {
  const nStates = prob.length
  if (nStates === 0 || prob[0].length === 0) {
    throw new Error('viterbi_discriminative: prob must be a non-empty [n_states x n_frames] matrix')
  }

  const pState = p_state === null ? new Array(nStates).fill(1.0 / nStates) : p_state
  if (pState.length !== nStates) {
    throw new Error(`viterbi_discriminative: p_state must have length n_states=${nStates}`)
  }

  // Bayes correction: divide the posterior by the marginal prior.
  const genProb = Array.from(prob, (row, i) =>
    Array.from(row, (p) => {
      const clipped = Math.min(Math.max(p, LOG_FLOOR), 1 - LOG_FLOOR)
      return clipped / pState[i]
    }),
  )

  return viterbi(genProb, transition, p_init, return_logp)
}
