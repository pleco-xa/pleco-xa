/**
 * engine/xa-errors.js — spec-named DOMException factories for the engine.
 *
 * The Web Audio spec mandates DOMExceptions with specific `name`s
 * (NotSupportedError, IndexSizeError, InvalidStateError, InvalidAccessError,
 * EncodingError) at exact validation points; where it instead mandates
 * ECMAScript natives (RangeError, TypeError) the engine keeps throwing those
 * directly. These helpers build on the native global `DOMException`
 * (Node >= 17 and every browser) — zero dependencies, no shims, no silent
 * fallbacks. Every parity slice imports its spec errors from here so a thrown
 * error's `name` is always the spec's string, testable as
 * `err.name === 'IndexSizeError'` and `err instanceof DOMException`.
 *
 * Usage: `throw indexSizeError('getChannelData: channel 5 out of range [0, 2)')`.
 */

/** DOMException named InvalidStateError — object is in the wrong state for the call. */
export function invalidStateError(message) {
  return new DOMException(message, 'InvalidStateError')
}

/** DOMException named NotSupportedError — argument outside the spec's supported/nominal range. */
export function notSupportedError(message) {
  return new DOMException(message, 'NotSupportedError')
}

/** DOMException named IndexSizeError — index (e.g. channel number) out of bounds. */
export function indexSizeError(message) {
  return new DOMException(message, 'IndexSizeError')
}

/** DOMException named InvalidAccessError — operation not allowed on this object. */
export function invalidAccessError(message) {
  return new DOMException(message, 'InvalidAccessError')
}

/** DOMException named EncodingError — audio data could not be decoded. */
export function encodingError(message) {
  return new DOMException(message, 'EncodingError')
}
