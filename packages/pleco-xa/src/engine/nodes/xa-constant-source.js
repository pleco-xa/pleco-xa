/**
 * engine/nodes/xa-constant-source.js — PlecoConstantSourceNode (P09).
 *
 * Spec-shaped ConstantSourceNode (spec § The ConstantSourceNode Interface): an
 * AudioScheduledSourceNode whose output is nominally the constant value of its
 * `offset` AudioParam — "It is useful as a constant source node in general and
 * can be used as if it were a constructible AudioParam by automating its
 * offset or connecting another node to it." Spec node table: 0 inputs,
 * 1 output, channelCount 2 / channelCountMode 'max' / channelInterpretation
 * 'speakers', tail-time No; "The single output of this node consists of one
 * channel (mono)."
 *
 * `offset` (readonly attribute): defaultValue 1, a-rate, nominal range
 * [most-negative-single-float, most-positive-single-float]. Each active frame
 * of the output is the offset's computedValue AT THAT CONTEXT FRAME —
 * automation runs on the absolute context clock, and modulation inputs
 * connected to `offset` sum in through the param's own fillBlock, so this node
 * composes as a modulation source into other AudioParams (connect(param)).
 *
 * Constructor dictionary: ConstantSourceOptions { float offset = 1 } — per the
 * spec IDL it does NOT extend AudioNodeOptions, so channelCount /
 * channelCountMode / channelInterpretation are UNKNOWN dictionary members here
 * and are ignored per WebIDL (the attributes stay settable afterwards). A
 * passed `offset` sets the param's `value` ATTRIBUTE (initialize-the-AudioNode
 * step 3.1) — defaultValue stays 1, non-finite throws TypeError via the value
 * setter's WebIDL float conversion, and non-number rejection is pleco
 * strictness (no ToNumber coercion), documented in xa-param.js.
 *
 * Precision note (the checklist's "high-precision output block"): the offset
 * curve is computed in double precision end-to-end inside
 * PlecoAudioParam.fillBlock and crosses exactly ONE float32 boundary — the
 * store into the render block (Math.fround via the Float32Array write). The
 * reference implementation instead swaps a Float64Array into its output
 * buffer; pleco keeps PlecoAudioBuffer's float32 contract because AudioParam
 * values are float32 at every spec boundary already (method arguments, the
 * value attribute, and the modulated param's own float32 mix stage), so a
 * float64 block would carry no additional information.
 *
 * Mono-output override: PlecoScheduledSourceNode._process allocates its block
 * `channelCount` wide, but this node's output is fixed at ONE channel
 * regardless of the channelCount attribute (which keeps its spec default 2).
 * Rather than fork the base's scheduling logic (start/stop windowing,
 * past-time clamping, ended dispatch), _process delegates to super and then
 * takes channel 0 into a mono block — a lossless float32 copy, one extra
 * per-quantum allocation (the engine already allocates blocks per quantum;
 * checklist divergence #16).
 */
import { PlecoScheduledSourceNode, coerceNodeOptions} from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'

export class PlecoConstantSourceNode extends PlecoScheduledSourceNode {
  #offset

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — ConstantSourceOptions: {offset} ONLY (no
   *   AudioNodeOptions members, per the spec IDL — unknown members are ignored).
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    // Spec node table defaults (channelCount 2, mode 'max', interpretation
    // 'speakers') are the PlecoNode defaults; the base forces numberOfInputs 0.
    super(context, { numberOfOutputs: 1 })
    this.#offset = new PlecoAudioParam({ defaultValue: 1, context })
    const offset = options === null || options === undefined ? undefined : options.offset
    if (offset !== undefined) this.#offset.value = offset // init step 3.1 → the value-attribute algorithm
    this._offsetBlock = new Float32Array(RENDER_QUANTUM)
  }

  /** Readonly. The offset AudioParam (spec: `readonly attribute AudioParam offset`). */
  get offset() {
    return this.#offset
  }

  /**
   * Mono-output override — the base handles ALL scheduling (start/stop
   * windowing, clamping, `ended`) and allocates channelCount-wide; the spec
   * fixes this node's single output at one channel, so take channel 0.
   */
  _process() {
    const block = super._process()
    if (block.numberOfChannels === 1) return block
    const out = createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
    out.getChannelData(0).set(block.getChannelData(0))
    return out
  }

  /**
   * Active-window DSP: frame k of the block carries the offset computedValue
   * at absolute context frame blockStart + k (fillBlock renders the whole
   * quantum from the block start, so the automation clock — not the elapsed
   * play time — indexes the curve). Always produces `count` frames: a constant
   * source never exhausts; only stop() ends it.
   */
  _dsp(output, offset, count) {
    const values = this.#offset.fillBlock(this._offsetBlock, this.context.currentTime)
    const dst = output.getChannelData(0)
    for (let j = 0; j < count; j++) dst[offset + j] = values[offset + j]
    return count
  }
}
