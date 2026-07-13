/**
 * engine/nodes/xa-gain.js — PlecoGainNode.
 *
 * Multiplies its (already-summed) input block by the a-rate `gain` param, per
 * sample per channel. This one node backs loop feedback level, output level, and
 * the de-click ramps once param automation lands.
 */
import { PlecoNode } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'

export class PlecoGainNode extends PlecoNode {
  constructor(context, options = {}) {
    // channelCount inherits the AudioNode default 2 (spec GainNode table: cc 2, mode 'max').
    super(context, { ...options, numberOfInputs: 1, numberOfOutputs: 1 })
    this.gain = new PlecoAudioParam({ defaultValue: 1, context })
    this._gainBlock = new Float32Array(RENDER_QUANTUM)
  }

  _process(input) {
    const g = this.gain.fillBlock(this._gainBlock)
    // Output channel count follows the input's computedNumberOfChannels.
    const channels = input.numberOfChannels
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, this.context.sampleRate)
    for (let c = 0; c < channels; c++) {
      const src = input.getChannelData(c)
      const dst = out.getChannelData(c)
      for (let i = 0; i < RENDER_QUANTUM; i++) dst[i] = src[i] * g[i]
    }
    return out
  }
}
