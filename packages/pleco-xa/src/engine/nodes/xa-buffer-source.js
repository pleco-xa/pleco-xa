/**
 * engine/nodes/xa-buffer-source.js — PlecoAudioBufferSourceNode.
 *
 * The looper's replay voice: plays a PlecoAudioBuffer through the graph via a
 * persistent fractional read cursor with linear interpolation, so varispeed
 * (playbackRate / detune) will be click-free. Slice-1 exercises the integer-rate
 * path (rate = 1 → the cursor lands on sample boundaries, interpolation is exact
 * and lossless); loop wrap arrives with the loop slice (its own test). `buffer`
 * is set-once — "acquire the content" — matching Web Audio's one-shot source.
 */
import { PlecoScheduledSourceNode } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'

export class PlecoAudioBufferSourceNode extends PlecoScheduledSourceNode {
  constructor(context) {
    super(context, { channelCount: 1 })
    this._buffer = null
    this._cursor = 0
    this.playbackRate = new PlecoAudioParam({ defaultValue: 1, context })
    this.detune = new PlecoAudioParam({ defaultValue: 0, context })
  }

  get buffer() {
    return this._buffer
  }

  set buffer(b) {
    if (this._buffer !== null) throw new Error('AudioBufferSourceNode.buffer is set-once')
    if (b == null || typeof b.getChannelData !== 'function') {
      throw new TypeError('AudioBufferSourceNode.buffer must be an AudioBuffer-shaped object')
    }
    this._buffer = b
    this.channelCount = b.numberOfChannels
  }

  _dsp(output, offset, count) {
    const buf = this._buffer
    if (buf === null) return 0
    const len = buf.length
    const step =
      (buf.sampleRate / this.context.sampleRate) *
      this.playbackRate.value *
      Math.pow(2, this.detune.value / 1200)
    const channels = this.channelCount
    let produced = 0

    for (let j = 0; j < count; j++) {
      if (this._cursor >= len) break
      const i0 = Math.floor(this._cursor)
      const frac = this._cursor - i0
      for (let c = 0; c < channels; c++) {
        const data = buf.getChannelData(c)
        const dst = output.getChannelData(c)
        if (frac === 0) {
          dst[offset + j] = data[i0]
        } else {
          const a = data[i0]
          const b = i0 + 1 < len ? data[i0 + 1] : a
          dst[offset + j] = a + (b - a) * frac
        }
      }
      this._cursor += step
      produced++
    }
    return produced
  }
}
