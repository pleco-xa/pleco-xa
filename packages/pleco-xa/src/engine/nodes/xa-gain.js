/**
 * engine/nodes/xa-gain.js — PlecoGainNode (P09).
 *
 * Spec-shaped GainNode (spec § The GainNode Interface): 1 input, 1 output,
 * channelCount 2 / channelCountMode 'max' / channelInterpretation 'speakers'
 * (the spec node table), tail-time No. "Each sample of each channel of the
 * input data of the GainNode MUST be multiplied by the computedValue of the
 * gain AudioParam" — the multiply runs per sample per channel against the real
 * automation curve rendered by PlecoAudioParam.fillBlock (a-rate per-frame
 * evaluation, k-rate first-frame hold, plus any connected modulation inputs
 * summed into the computedValue). This one node backs loop feedback level,
 * output level, and the de-click ramps.
 *
 * Constructor dictionary: GainOptions : AudioNodeOptions { float gain = 1.0 }.
 * Per the spec's initialize-the-AudioNode algorithm (step 3.1), a dictionary
 * member that names an AudioParam sets that param's `value` ATTRIBUTE — the
 * param's defaultValue stays 1, and the value setter's spec side effect
 * (setValueAtTime(v, currentTime)) applies, so later ramps anchor to the
 * constructed value. The setter's WebIDL float conversion supplies the
 * TypeError for non-finite values; rejecting non-number values outright
 * (e.g. gain: '0.5') instead of coercing via WebIDL ToNumber is deliberate
 * pleco strictness, documented in xa-param.js. AudioNodeOptions members pass
 * through to PlecoNode (invalid enum in the CONSTRUCTOR dictionary throws
 * TypeError; invalid enum ATTRIBUTE assignment is silently ignored — the
 * house WebIDL rules).
 *
 * `gain` is a readonly attribute (getter only — assignment throws in strict
 * mode), matching `readonly attribute AudioParam gain`.
 */
import { PlecoNode, coerceNodeOptions} from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'

export class PlecoGainNode extends PlecoNode {
  #gain

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — GainOptions: {gain} merged with AudioNodeOptions.
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    // WebIDL dictionary conversion: null (like undefined) is the empty dictionary.
    const { gain, ...nodeOptions } = options ?? {}
    super(context, { ...nodeOptions, numberOfInputs: 1, numberOfOutputs: 1 })
    // Spec § GainNode attributes: gain — defaultValue 1, a-rate, nominal range
    // [most-negative-single-float, most-positive-single-float] (the
    // PlecoAudioParam defaults).
    this.#gain = new PlecoAudioParam({ defaultValue: 1, context })
    if (gain !== undefined) this.#gain.value = gain // init step 3.1 → the value-attribute algorithm
    this._gainBlock = new Float32Array(RENDER_QUANTUM)
  }

  /** Readonly. The gain AudioParam (spec: `readonly attribute AudioParam gain`). */
  get gain() {
    return this.#gain
  }

  _process(input) {
    // computedValue block for this quantum: intrinsic automation curve plus
    // any connected modulation inputs, a-rate per sample-frame (or k-rate
    // first-frame hold), rendered by the param itself.
    const g = this.#gain.fillBlock(this._gainBlock, this.context.currentTime)
    // Output channel count follows the input's computedNumberOfChannels.
    const channels = input.numberOfChannels
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, this.context.sampleRate)
    for (let c = 0; c < channels; c++) {
      const src = input.getChannelData(c)
      const dst = out.getChannelData(c)
      // Double-precision product, single float32 rounding at the output store.
      for (let i = 0; i < RENDER_QUANTUM; i++) dst[i] = src[i] * g[i]
    }
    return out
  }
}
