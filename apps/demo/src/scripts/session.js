/**
 * demo-session — the single shared state object for the demo app.
 *
 * Wave 6: replaces the old window.* global bus (window.currentAudioBuffer,
 * window.audioContext, window.applyLoop, window.audioProcessor,
 * window.currentBPM, window.drawWaveform). Components import this module and
 * read/write session fields directly; cross-component notifications go
 * through the tiny event emitter below.
 *
 * Vite bundles every processed <script> on a page against one module graph,
 * so all components share this single instance.
 */

const listeners = new Map()

export const session = {
  /** @type {AudioContext|null} shared Web Audio context (set on first load) */
  audioContext: null,
  /** @type {AudioBuffer|null} the buffer currently loaded/being manipulated */
  currentBuffer: null,
  /** @type {AudioBuffer|null} pristine copy kept for nudge/reveal operations */
  originalBuffer: null,
  /** the audio processor created by initAudioProcessor() in AudioAnalyzer */
  audioProcessor: null,
  /** @type {{start:number, end:number}} normalized loop bounds */
  currentLoop: { start: 0, end: 1 },
  /** @type {number|null} latest BPM estimate shown in the UI */
  bpm: null,
  /**
   * applyLoop(buffer, loop, op, subOps) — installed by AudioAnalyzer once the
   * page is initialized; other components call it to push a manipulation
   * result into playback + UI.
   * @type {Function|null}
   */
  applyLoop: null,

  /** Subscribe to a session event ('buffer' | 'loop' | 'bpm'). */
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(fn)
    return () => this.off(event, fn)
  },

  off(event, fn) {
    listeners.get(event)?.delete(fn)
  },

  emit(event, payload) {
    listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload)
      } catch (err) {
        console.error(`session listener for '${event}' failed:`, err)
      }
    })
  },

  /** Set the active buffer and notify listeners. */
  setBuffer(buffer) {
    this.currentBuffer = buffer
    this.emit('buffer', buffer)
  },

  /** Set the normalized loop bounds and notify listeners. */
  setLoop(loop) {
    this.currentLoop = loop
    this.emit('loop', loop)
  },

  /** Set the current BPM estimate and notify listeners. */
  setBpm(bpm) {
    this.bpm = bpm
    this.emit('bpm', bpm)
  },
}
