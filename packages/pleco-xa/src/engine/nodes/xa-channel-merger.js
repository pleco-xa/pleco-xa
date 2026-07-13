/**
 * engine/nodes/xa-channel-merger.js — PlecoChannelMergerNode.
 *
 * Spec (§ The ChannelMergerNode Interface): numberOfInputs inputs
 * (ChannelMergerOptions.numberOfInputs, default 6, IndexSizeError outside
 * [1, 32] per § createChannelMerger), 1 output whose stream has exactly
 * numberOfInputs channels: "each input gets downmixed into one channel (mono)
 * based on the specified mixing rule. An unconnected input still counts as
 * one silent channel in the output."
 *
 * Locked AudioNode attributes (spec audionode.include table + the constraint
 * tables in § AudioNode Attributes): channelCount 1 with "channelCount
 * constraints" (InvalidStateError on any attempt to change) and
 * channelCountMode 'explicit' with "channelCountMode constraints"
 * (InvalidStateError). channelInterpretation defaults to 'speakers' and is
 * NOT constrained for this node (the spec's channelInterpretation constraints
 * list names only ChannelSplitterNode) — it selects the mono-downmix rule
 * each input applies. The locked channelCount 1 + 'explicit' mode make the
 * input-port machinery deliver each input already downmixed to exactly one
 * channel, so _process just lays input i's mono block into output channel i.
 */
import { PlecoNode, CHANNEL_COUNT_MODES } from '../xa-node.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { indexSizeError, invalidStateError } from '../xa-errors.js'

export class PlecoChannelMergerNode extends PlecoNode {
  constructor(context, options = {}) {
    const { numberOfInputs = 6 } = options
    if (!Number.isInteger(numberOfInputs) || numberOfInputs < 1 || numberOfInputs > 32) {
      throw indexSizeError(
        `PlecoChannelMergerNode: numberOfInputs must be an integer in [1, 32], got ${numberOfInputs}`,
      )
    }
    // The constructor dictionary must respect the same locked-attribute
    // constraints as assignment (spec: initialization applies AudioNodeOptions
    // through the constraint checks), so validate before construction. WebIDL
    // dictionary enum conversion runs FIRST: a string outside the enum is a
    // binding TypeError (the xa-node.js house pattern) — only a VALID mode
    // that differs from the locked 'explicit' reaches the InvalidStateError
    // check. (channelInterpretation is unconstrained here and flows through
    // ...options to the base constructor, whose dictionary path TypeErrors
    // invalid strings.)
    const channelCount = options.channelCount ?? 1
    if (channelCount !== 1) {
      throw invalidStateError(
        `PlecoChannelMergerNode: channelCount must be 1, got ${channelCount}`,
      )
    }
    const channelCountMode = options.channelCountMode ?? 'explicit'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoChannelMergerNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (channelCountMode !== 'explicit') {
      throw invalidStateError(
        `PlecoChannelMergerNode: channelCountMode must be 'explicit', got ${channelCountMode}`,
      )
    }
    super(context, {
      ...options,
      numberOfInputs,
      numberOfOutputs: 1,
      channelCount,
      channelCountMode,
    })
  }

  // Spec constraint hooks — every attempt to CHANGE a locked attribute is an
  // InvalidStateError; re-assigning the locked value passes through unchanged.
  _validateChannelCount(v) {
    if (v !== 1) {
      throw invalidStateError('PlecoChannelMergerNode: channelCount is locked to 1')
    }
  }

  _validateChannelCountMode(v) {
    if (v !== 'explicit') {
      throw invalidStateError("PlecoChannelMergerNode: channelCountMode is locked to 'explicit'")
    }
  }

  /**
   * One argument per input, each already downmixed to mono by the input-port
   * machinery (locked channelCount 1 + 'explicit'); an unconnected input is
   * one channel of silence. Output channel i = input i's mono block.
   */
  _process(...inputs) {
    const out = createPlecoAudioBuffer(this.numberOfInputs, RENDER_QUANTUM, this.context.sampleRate)
    for (let i = 0; i < inputs.length; i++) {
      out.getChannelData(i).set(inputs[i].getChannelData(0))
    }
    return out
  }
}
