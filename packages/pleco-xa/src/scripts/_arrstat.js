/**
 * Stack-safe array min/max.
 *
 * `Math.max(...arr)` / `Math.min(...arr)` spread the array as function
 * arguments, which throws `RangeError: Maximum call stack size exceeded`
 * once the array is longer than the engine's argument limit (~65k–125k).
 * On audio- or spectrum-length arrays that is a routine crash, so these
 * loop-based equivalents are used everywhere in place of the spread form.
 * Behavior is identical (including the empty-array case: max → -Infinity,
 * min → +Infinity, matching Math.max()/Math.min()).
 *
 * @param {ArrayLike<number>} arr
 * @returns {number}
 */
export function _amax(arr) {
  let m = -Infinity
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i]
  return m
}

/**
 * @param {ArrayLike<number>} arr
 * @returns {number}
 */
export function _amin(arr) {
  let m = Infinity
  for (let i = 0; i < arr.length; i++) if (arr[i] < m) m = arr[i]
  return m
}
