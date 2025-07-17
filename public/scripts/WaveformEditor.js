/**
 * Interactive waveform editor class
 * Part of Pleco Xa audio analysis engine
 */

export class WaveformEditor {
  constructor(canvas, audioBuffer, analysis) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.audioBuffer = audioBuffer
    this.analysis = analysis
    this.loopStart = analysis.loopStart
    this.loopEnd = analysis.loopEnd
    this.isDragging = false
    this.dragTarget = null

    this.setupInteraction()
    this.draw()
  }

  setupInteraction() {
    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const time = (x / this.canvas.width) * this.audioBuffer.duration

      // Check if clicking near loop markers
      const startX =
        (this.loopStart / this.audioBuffer.duration) * this.canvas.width
      const endX =
        (this.loopEnd / this.audioBuffer.duration) * this.canvas.width

      if (Math.abs(x - startX) < 10) {
        this.isDragging = true
        this.dragTarget = 'start'
      } else if (Math.abs(x - endX) < 10) {
        this.isDragging = true
        this.dragTarget = 'end'
      } else {
        // Set new loop point
        if (Math.abs(x - startX) < Math.abs(x - endX)) {
          this.loopStart = time
        } else {
          this.loopEnd = time
        }
        this.draw()
        this.onLoopChange()
      }
    })

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const rect = this.canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const time = Math.max(
          0,
          Math.min(
            this.audioBuffer.duration,
            (x / this.canvas.width) * this.audioBuffer.duration,
          ),
        )

        if (this.dragTarget === 'start') {
          this.loopStart = Math.min(time, this.loopEnd - 0.1)
        } else if (this.dragTarget === 'end') {
          this.loopEnd = Math.max(time, this.loopStart + 0.1)
        }

        this.draw()
        this.onLoopChange()
      }
    })

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false
      this.dragTarget = null
    })
  }

  draw() {
    const data = this.audioBuffer.getChannelData(0)
    const step = Math.ceil(data.length / this.canvas.width)

    this.ctx.fillStyle = '#000'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Draw waveform
    this.ctx.strokeStyle = '#00ff00'
    this.ctx.lineWidth = 1
    this.ctx.beginPath()

    for (let i = 0; i < this.canvas.width; i++) {
      const slice = data.slice(i * step, (i + 1) * step)
      const min = Math.min(...slice)
      const max = Math.max(...slice)

      const yMin = ((min + 1) * this.canvas.height) / 2
      const yMax = ((max + 1) * this.canvas.height) / 2

      this.ctx.moveTo(i, yMin)
      this.ctx.lineTo(i, yMax)
    }

    this.ctx.stroke()

    // Draw loop region
    const startX =
      (this.loopStart / this.audioBuffer.duration) * this.canvas.width
    const endX = (this.loopEnd / this.audioBuffer.duration) * this.canvas.width

    this.ctx.fillStyle = 'rgba(0, 255, 0, 0.1)'
    this.ctx.fillRect(startX, 0, endX - startX, this.canvas.height)

    // Draw loop markers
    this.ctx.strokeStyle = '#44ff44'
    this.ctx.lineWidth = 2
    this.ctx.beginPath()
    this.ctx.moveTo(startX, 0)
    this.ctx.lineTo(startX, this.canvas.height)
    this.ctx.stroke()

    this.ctx.strokeStyle = '#ff4444'
    this.ctx.beginPath()
    this.ctx.moveTo(endX, 0)
    this.ctx.lineTo(endX, this.canvas.height)
    this.ctx.stroke()
  }

  onLoopChange() {
    // Update display and trigger events
    const event = new CustomEvent('loopChange', {
      detail: {
        loopStart: this.loopStart,
        loopEnd: this.loopEnd,
        duration: this.loopEnd - this.loopStart,
      },
    })
    this.canvas.dispatchEvent(event)
  }
}
