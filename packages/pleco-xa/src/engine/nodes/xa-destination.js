/**
 * engine/nodes/xa-destination.js — PlecoAudioDestinationNode.
 *
 * The graph's sole pull entry point. Its _tick() sums its inputs into the final
 * mix for the quantum (inherited pull-and-sum behavior); the context's
 * renderQuantum() calls it once per block.
 *
 * P06 spec surface (spec § The AudioDestinationNode Interface + the
 * channelCount/channelCountMode constraint tables in § The AudioNode
 * Interface):
 * - readonly `maxChannelCount` — the ceiling for the channelCount attribute.
 *   For an offline-style destination it equals the channel count determined at
 *   construction; a realtime sink (P21) passes its hardware ceiling via the
 *   `maxChannelCount` option.
 * - channelCount constraint: outside [1, maxChannelCount] → IndexSizeError.
 * - Offline-destination immutability (the default, `immutable: true`):
 *   changing channelCount OR channelCountMode to a different value →
 *   InvalidStateError. Same-value assignment stays a no-op.
 *
 * Check ordering caveat (documented, not silent): PlecoNode's channelCount
 * setter enforces the generic AudioNode rule (integer in [1, 32] →
 * NotSupportedError) BEFORE these per-node hooks run, so assigning 0 or 33+
 * surfaces NotSupportedError rather than the destination-specific
 * IndexSizeError/InvalidStateError. Both are spec "MUST throw" rules that
 * overlap; the generic one wins on ordering here.
 */
import { PlecoNode } from '../xa-node.js'
import { indexSizeError, invalidStateError } from '../xa-errors.js'

/** Engine channel ceiling — same value as PlecoAudioBuffer/PlecoNode (spec: "MUST support at least 32 channels"). */
const MAX_CHANNELS = 32

export class PlecoAudioDestinationNode extends PlecoNode {
  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options]
   * @param {number} [options.channelCount=1] — the context's channel count.
   * @param {number} [options.maxChannelCount=channelCount] — readonly ceiling
   *   for later channelCount assignment (integer in [1, 32]).
   * @param {boolean} [options.immutable=true] — offline-destination semantics:
   *   channelCount/channelCountMode may never change (InvalidStateError).
   *   A realtime destination (P21) passes false.
   */
  constructor(context, { channelCount = 1, maxChannelCount = channelCount, immutable = true } = {}) {
    // Spec (§ AudioDestinationNode): 1 in / 1 out, channelCountMode 'explicit',
    // channelInterpretation 'speakers' — the input always mixes to exactly
    // channelCount channels (the context's channel count). The output exists so
    // the summed mix can be captured (spec: "produced by summing its input");
    // its block is simply the node's _tick() result.
    super(context, {
      channelCount,
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })
    // NOTE: super() runs the channelCount setter before these fields exist —
    // the _validateChannelCount hook detects that (undefined _maxChannelCount)
    // and defers to the explicit construction checks below.
    if (!Number.isInteger(maxChannelCount) || maxChannelCount < 1 || maxChannelCount > MAX_CHANNELS) {
      throw new RangeError(
        `PlecoAudioDestinationNode: maxChannelCount must be an integer in [1, ${MAX_CHANNELS}], got ${maxChannelCount}`,
      )
    }
    if (channelCount > maxChannelCount) {
      throw indexSizeError(
        `PlecoAudioDestinationNode: channelCount ${channelCount} exceeds maxChannelCount ${maxChannelCount}`,
      )
    }
    this._maxChannelCount = maxChannelCount
    this._channelConfigImmutable = immutable === true
  }

  /** Readonly. The maximum value the channelCount attribute can be set to. */
  get maxChannelCount() {
    return this._maxChannelCount
  }

  /**
   * Spec channelCount constraints for AudioDestinationNode: on an offline
   * destination ANY change is an InvalidStateError; otherwise a value outside
   * [1, maxChannelCount] is an IndexSizeError.
   */
  _validateChannelCount(v) {
    if (this._maxChannelCount === undefined) return // construction-time call from super(); validated post-super
    if (this._channelConfigImmutable && v !== this.channelCount) {
      throw invalidStateError(
        `PlecoAudioDestinationNode: channelCount is fixed at ${this.channelCount} on an offline destination`,
      )
    }
    if (v < 1 || v > this._maxChannelCount) {
      throw indexSizeError(
        `PlecoAudioDestinationNode: channelCount must be in [1, ${this._maxChannelCount}] (maxChannelCount), got ${v}`,
      )
    }
  }

  /** Spec channelCountMode constraint: an offline destination's mode can never change (InvalidStateError). */
  _validateChannelCountMode(v) {
    if (this._channelConfigImmutable === true && v !== this.channelCountMode) {
      throw invalidStateError(
        `PlecoAudioDestinationNode: channelCountMode is fixed at '${this.channelCountMode}' on an offline destination`,
      )
    }
  }
}
