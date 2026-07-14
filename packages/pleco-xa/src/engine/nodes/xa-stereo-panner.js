/**
 * engine/nodes/xa-stereo-panner.js — PlecoStereoPannerNode.
 *
 * Spec-shaped StereoPannerNode (spec § The StereoPannerNode Interface):
 * positions the input in the stereo image with the low-cost equal-power
 * algorithm of § StereoPannerNode Panning. One input, one output; the output
 * is HARD-CODED to stereo (2 channels) regardless of the input. Node table:
 * channelCount 2, channelCountMode 'clamped-max', channelInterpretation
 * 'speakers', tail-time No — so the input port delivers at most 2 channels
 * and the per-sample math only ever sees the mono or stereo case.
 *
 * pan (readonly attribute): a-rate AudioParam, default 0, nominal range
 * [-1, 1] (-1 full left, +1 full right). The spec algorithm's step-2 clamp of
 * pan to [-1, 1] is exactly the AudioParam nominal-range clamp applied by
 * fillBlock at computedValue time — no second clamp is needed here.
 *
 * Per-sample math (§ StereoPannerNode Panning, all normative — implemented
 * verbatim, computed in double precision with the Float32Array store as the
 * float32 boundary):
 *   mono input:    x = (pan + 1) / 2
 *                  outL = input · cos(x·π/2);  outR = input · sin(x·π/2)
 *   stereo input:  x = pan + 1  if pan ≤ 0,  else  x = pan
 *                  gainL = cos(x·π/2);  gainR = sin(x·π/2)
 *     pan ≤ 0:     outL = inL + inR·gainL;   outR = inR·gainR   (R leaks into L)
 *     pan > 0:     outL = inL·gainL;         outR = inR + inL·gainR (L leaks into R)
 *   Both stereo branches are the identity at pan = 0 (the spec's ≤ places 0
 *   on the left branch: gainL = cos(π/2) is the double-precision residue
 *   ≈ 6.12e-17, so inR's leak into outL vanishes below float32 resolution).
 *
 * Constraint tables (spec § AudioNode channelCount / channelCountMode
 * constraints — note these are NotSupportedError for this node, unlike the
 * splitter/merger locks which are InvalidStateError):
 *   - channelCount cannot be greater than 2 → NotSupportedError.
 *   - channelCountMode cannot be set to 'max' → NotSupportedError.
 * Both apply on ATTRIBUTE assignment and through the constructor dictionary
 * (initialization applies AudioNodeOptions through the same constraint
 * checks). WebIDL house rules: an invalid enum STRING in the constructor
 * dictionary is a binding TypeError (conversion runs before the constraint);
 * an invalid enum string assigned to the attribute is silently ignored.
 * StereoPannerOptions.pan is a WebIDL float: non-finite → TypeError.
 * Rejecting non-number pan outright instead of coercing via WebIDL ToNumber
 * is deliberate pleco strictness, not spec behavior.
 */
import { PlecoNode, CHANNEL_COUNT_MODES, coerceNodeOptions} from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { notSupportedError } from '../xa-errors.js'

const HALF_PI = Math.PI / 2

export class PlecoStereoPannerNode extends PlecoNode {
  #pan

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — StereoPannerOptions: {pan} merged with
   *   AudioNodeOptions. Node table defaults: channelCount 2, channelCountMode
   *   'clamped-max', channelInterpretation 'speakers'.
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    options = options ?? {} // WebIDL dictionary conversion: null is the empty dictionary
    const { pan = 0, ...nodeOptions } = options
    // The base PlecoNode constructor stores channelCountMode WITHOUT running
    // the per-node constraint hook (only channelCount goes through its
    // validated setter), so the dictionary path pre-validates here — the same
    // house pattern as the splitter/merger locks. WebIDL enum conversion runs
    // FIRST: a string outside the enum is a binding TypeError; only the VALID
    //-but-forbidden 'max' reaches the NotSupportedError constraint.
    const channelCountMode = nodeOptions.channelCountMode ?? 'clamped-max'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoStereoPannerNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (channelCountMode === 'max') {
      throw notSupportedError("PlecoStereoPannerNode: channelCountMode cannot be set to 'max'")
    }
    // StereoPannerOptions.pan is a WebIDL float — non-finite is a binding
    // TypeError before the node is constructed. (Non-number rejection is
    // pleco strictness — see file header.)
    if (typeof pan !== 'number' || !Number.isFinite(pan)) {
      throw new TypeError(`PlecoStereoPannerNode: options.pan must be a finite number, got ${pan}`)
    }
    // channelCount ≤ 2 is enforced by the _validateChannelCount hook, which
    // the base constructor's validated channelCount setter runs during super().
    super(context, { ...nodeOptions, numberOfInputs: 1, numberOfOutputs: 1, channelCountMode })
    this.#pan = new PlecoAudioParam({ defaultValue: 0, minValue: -1, maxValue: 1, context })
    // Factory/constructor algorithm sets only PASSED parameters: an explicit
    // options.pan initializes the param's value (defaultValue stays 0, per
    // the spec's dictionary-member semantics); an omitted one leaves the
    // param's timeline untouched.
    if (options.pan !== undefined) this.#pan.value = pan
    this._panBlock = new Float32Array(RENDER_QUANTUM)
  }

  get pan() {
    return this.#pan
  }

  // Spec constraint hooks (§ channelCount / channelCountMode constraints) —
  // both NotSupportedError for StereoPannerNode.
  _validateChannelCount(v) {
    if (v > 2) {
      throw notSupportedError(`PlecoStereoPannerNode: channelCount cannot be greater than 2, got ${v}`)
    }
  }

  _validateChannelCountMode(v) {
    if (v === 'max') {
      throw notSupportedError("PlecoStereoPannerNode: channelCountMode cannot be set to 'max'")
    }
  }

  _process(input) {
    // computedValue block: intrinsic timeline + modulation inputs, clamped to
    // the [-1, 1] nominal range — the spec algorithm's step-2 pan clamp.
    const p = this.#pan.fillBlock(this._panBlock, this.context.currentTime)
    const out = createPlecoAudioBuffer(2, RENDER_QUANTUM, this.context.sampleRate)
    const outL = out.getChannelData(0)
    const outR = out.getChannelData(1)

    if (input.numberOfChannels === 1) {
      // Mono branch: x = (pan + 1) / 2 through cos/sin.
      const src = input.getChannelData(0)
      for (let i = 0; i < RENDER_QUANTUM; i++) {
        const x = (p[i] + 1) / 2
        outL[i] = src[i] * Math.cos(x * HALF_PI)
        outR[i] = src[i] * Math.sin(x * HALF_PI)
      }
      return out
    }

    // Stereo branches (input is at most 2 channels under the node's
    // channelCount ≤ 2 + non-'max' mode constraints).
    const inL = input.getChannelData(0)
    const inR = input.getChannelData(1)
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      const pan = p[i]
      const x = pan <= 0 ? pan + 1 : pan
      const gainL = Math.cos(x * HALF_PI)
      const gainR = Math.sin(x * HALF_PI)
      if (pan <= 0) {
        outL[i] = inL[i] + inR[i] * gainL
        outR[i] = inR[i] * gainR
      } else {
        outL[i] = inL[i] * gainL
        outR[i] = inR[i] + inL[i] * gainR
      }
    }
    return out
  }
}
