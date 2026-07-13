/**
 * engine/nodes/xa-channel-splitter.js — PlecoChannelSplitterNode.
 *
 * Spec (§ The ChannelSplitterNode Interface): 1 input, numberOfOutputs outputs
 * (ChannelSplitterOptions.numberOfOutputs, default 6, IndexSizeError outside
 * [1, 32] per § createChannelSplitter). Output k is a mono stream carrying
 * channel k of the input; outputs beyond the input's channel count are
 * silence ("Any outputs which are not 'active' will output silence").
 *
 * Locked AudioNode attributes (spec audionode.include table + the constraint
 * tables in § AudioNode Attributes): channelCount == numberOfOutputs with
 * "channelCount constraints" (InvalidStateError on any attempt to change),
 * channelCountMode 'explicit' with "channelCountMode constraints"
 * (InvalidStateError), channelInterpretation 'discrete' with
 * "channelInterpretation constraints" (InvalidStateError). Because the input
 * therefore mixes to exactly numberOfOutputs channels with 'discrete'
 * fill-then-zero rules, channel k of the mixed input block IS the spec's
 * "active channel k or silence" for every output.
 *
 * This is the first node whose outputs carry DIFFERENT blocks: _process()
 * returns the full per-output set (an array of mono blocks) which _tick()
 * memoizes once per currentTime, and the _tickOutput(index) override selects
 * from it — so fanning several outputs to several consumers still computes
 * the split exactly once per quantum.
 */
import { PlecoNode, CHANNEL_COUNT_MODES, CHANNEL_INTERPRETATIONS } from '../xa-node.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { indexSizeError, invalidStateError } from '../xa-errors.js'

export class PlecoChannelSplitterNode extends PlecoNode {
  constructor(context, options = {}) {
    const { numberOfOutputs = 6 } = options
    if (!Number.isInteger(numberOfOutputs) || numberOfOutputs < 1 || numberOfOutputs > 32) {
      throw indexSizeError(
        `PlecoChannelSplitterNode: numberOfOutputs must be an integer in [1, 32], got ${numberOfOutputs}`,
      )
    }
    // The constructor dictionary must respect the same locked-attribute
    // constraints as assignment (spec: initialization applies AudioNodeOptions
    // through the constraint checks), so validate before construction. WebIDL
    // dictionary enum conversion runs FIRST: a string outside the enum is a
    // binding TypeError (the xa-node.js house pattern) — only a VALID value
    // that differs from the locked one reaches the InvalidStateError check.
    const channelCount = options.channelCount ?? numberOfOutputs
    if (channelCount !== numberOfOutputs) {
      throw invalidStateError(
        `PlecoChannelSplitterNode: channelCount must equal numberOfOutputs (${numberOfOutputs}), got ${channelCount}`,
      )
    }
    const channelCountMode = options.channelCountMode ?? 'explicit'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoChannelSplitterNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (channelCountMode !== 'explicit') {
      throw invalidStateError(
        `PlecoChannelSplitterNode: channelCountMode must be 'explicit', got ${channelCountMode}`,
      )
    }
    const channelInterpretation = options.channelInterpretation ?? 'discrete'
    if (!CHANNEL_INTERPRETATIONS.includes(channelInterpretation)) {
      throw new TypeError(
        `PlecoChannelSplitterNode: channelInterpretation must be 'speakers' | 'discrete', got ${channelInterpretation}`,
      )
    }
    if (channelInterpretation !== 'discrete') {
      throw invalidStateError(
        `PlecoChannelSplitterNode: channelInterpretation must be 'discrete', got ${channelInterpretation}`,
      )
    }
    super(context, {
      numberOfInputs: 1,
      numberOfOutputs,
      channelCount,
      channelCountMode,
      channelInterpretation,
    })
  }

  // Spec constraint hooks — every attempt to CHANGE a locked attribute is an
  // InvalidStateError; re-assigning the locked value passes through unchanged.
  _validateChannelCount(v) {
    if (v !== this.numberOfOutputs) {
      throw invalidStateError(
        `PlecoChannelSplitterNode: channelCount is locked to numberOfOutputs (${this.numberOfOutputs})`,
      )
    }
  }

  _validateChannelCountMode(v) {
    if (v !== 'explicit') {
      throw invalidStateError("PlecoChannelSplitterNode: channelCountMode is locked to 'explicit'")
    }
  }

  _validateChannelInterpretation(v) {
    if (v !== 'discrete') {
      throw invalidStateError("PlecoChannelSplitterNode: channelInterpretation is locked to 'discrete'")
    }
  }

  /**
   * Compute the full split set for the quantum: one mono block per output,
   * block k carrying input channel k. The input arrives already mixed to
   * exactly numberOfOutputs channels ('explicit' + locked channelCount) with
   * 'discrete' rules, so channels beyond the connected sources are silence;
   * an unconnected input arrives as one silent channel, leaving every block
   * silent. _tick() memoizes the returned array once per currentTime.
   */
  _process(input) {
    const blocks = []
    for (let k = 0; k < this.numberOfOutputs; k++) {
      const mono = createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
      if (k < input.numberOfChannels) mono.getChannelData(0).set(input.getChannelData(k))
      blocks.push(mono)
    }
    return blocks
  }

  /** Select output `outputIndex`'s mono block from the memoized split set. */
  _tickOutput(outputIndex) {
    const blocks = this._tick()
    if (Array.isArray(blocks)) return blocks[outputIndex]
    // Feedback-cycle guard path: _tick() muted the pull to a single silent
    // block shaped by channelCount — every splitter output is mono silence.
    return createPlecoAudioBuffer(1, RENDER_QUANTUM, this.context.sampleRate)
  }
}
