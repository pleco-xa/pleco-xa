// @ts-check
/**
 * Live Peak Extractor for real-time audio analysis
 * Part of Pleco-XA audio analysis toolkit
 */

export class LivePeakExtractor {
  constructor(audioContext) {
    this.audioContext = audioContext
    this.analyser = null
    this.isRunning = false
    this.callback = null
  }

  connect(audioSource, callback) {
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.3

    const bufferLength = this.analyser.frequencyBinCount
    this.timeDataArray = new Uint8Array(this.analyser.fftSize)
    this.freqDataArray = new Uint8Array(bufferLength)

    // Connect to audio source
    audioSource.connect(this.analyser)
    this.analyser.connect(this.audioContext.destination)

    this.callback = callback
    this.isRunning = true
    this.extractPeakData()
  }

  extractPeakData() {
    if (!this.isRunning || !this.analyser) return

    // Get time domain data (actual waveform)
    this.analyser.getByteTimeDomainData(this.timeDataArray)
    this.analyser.getByteFrequencyData(this.freqDataArray)

    // Calculate peak amplitude
    let peak = 0
    for (let i = 0; i < this.timeDataArray.length; i++) {
      const amplitude = Math.abs(this.timeDataArray[i] - 128) / 128
      if (amplitude > peak) peak = amplitude
    }

    // Calculate RMS
    let sumSquares = 0
    for (let i = 0; i < this.timeDataArray.length; i++) {
      const amplitude = (this.timeDataArray[i] - 128) / 128
      sumSquares += amplitude * amplitude
    }
    const rms = Math.sqrt(sumSquares / this.timeDataArray.length)

    // Call callback with peak data
    if (this.callback) {
      this.callback({
        peak: peak,
        rms: rms,
        timeData: this.timeDataArray,
        freqData: this.freqDataArray,
      })
    }

    // Continue extraction
    requestAnimationFrame(() => this.extractPeakData())
  }

  stop() {
    this.isRunning = false
    if (this.analyser) {
      this.analyser.disconnect()
      this.analyser = null
    }
  }
}
