export class BaseNode<T extends AudioNode> {
  node: T
  constructor(node: T) {
    this.node = node
  }
  connect(dest: BaseNode<AudioNode> | AudioNode) {
    this.node.connect(dest instanceof BaseNode ? dest.node : dest)
    return dest
  }
}

export class SamplerNode extends BaseNode<AudioBufferSourceNode> {
  constructor(
    context: AudioContext,
    buffer: AudioBuffer,
    loopStart = 0,
    loopEnd?: number,
  ) {
    const node = context.createBufferSource()
    node.buffer = buffer
    node.loop = true
    node.loopStart = loopStart
    if (loopEnd) node.loopEnd = loopEnd
    super(node)
  }
  start(when = 0) {
    this.node.start(when)
  }
}

export class GainNodeWrapper extends BaseNode<GainNode> {
  constructor(context: AudioContext, value = 1) {
    const g = context.createGain()
    g.gain.value = value
    super(g)
  }
}

export class FilterNodeWrapper extends BaseNode<BiquadFilterNode> {
  constructor(
    context: AudioContext,
    type: BiquadFilterType = 'lowpass',
    freq = 440,
  ) {
    const f = context.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    super(f)
  }
}

export function detectLoop(buffer: AudioBuffer) {
  const data = buffer.getChannelData(0)
  const sr = buffer.sampleRate
  const window = Math.min(Math.floor(sr * 0.5), Math.floor(data.length / 2))
  let best = 0
  let bestScore = -Infinity
  for (let offset = 0; offset < window; offset++) {
    let score = 0
    for (let i = 0; i < window - offset; i++) {
      score += data[i] * data[i + offset]
    }
    if (score > bestScore) {
      bestScore = score
      best = offset
    }
  }
  return {
    loopStart: 0,
    loopEnd: (window + best) / sr,
  }
}

export function applyCrossfade(buffer: AudioBuffer, fadeSeconds = 0.05) {
  const sr = buffer.sampleRate
  const fade = Math.min(Math.floor(fadeSeconds * sr), buffer.length / 2)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < fade; i++) {
      const fadeIn = i / fade
      const fadeOut = (fade - i) / fade
      data[i] *= fadeIn
      data[data.length - 1 - i] *= fadeOut
    }
  }
  return buffer
}

export function bindControl(
  element: HTMLElement,
  param: AudioParam,
  min = 0,
  max = 1,
) {
  const handler = (e: MouseEvent) => {
    const rect = element.getBoundingClientRect()
    const ratio = (e.clientY - rect.top) / rect.height
    param.value = min + (1 - ratio) * (max - min)
  }
  element.addEventListener('mousemove', handler)
  return () => element.removeEventListener('mousemove', handler)
}
