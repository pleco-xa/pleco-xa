class AudioBuffer {
  constructor({ length, numberOfChannels = 1, sampleRate }) {
    this.sampleRate = sampleRate
    this.length = length
    this.duration = length / sampleRate
    this.numberOfChannels = numberOfChannels
    this._data = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(length),
    )
  }

  getChannelData(channel) {
    return this._data[channel]
  }
}

class AudioContext {
  constructor({ sampleRate = 44100 } = {}) {
    this.sampleRate = sampleRate
  }

  createBuffer(numberOfChannels, length, sampleRate = this.sampleRate) {
    return new AudioBuffer({ length, numberOfChannels, sampleRate })
  }
}

export { AudioContext, AudioBuffer }

// Removed problematic AudioContext instantiation at module load time
