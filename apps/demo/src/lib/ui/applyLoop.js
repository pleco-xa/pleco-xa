import { enqueueToast } from './toastQueue.js'

export function applyLoop(buf, loop, op, subOps, {
  audioProcessor,
  drawWaveform,
  updateLoopInfo,
  updateTrackInfo,
  currentTrackName = '',
  setCurrentBuffer,
  restart = false,
  startTimelineAnimation,
  startWaveformAnimation,
} = {}) {
  if (!buf || !loop || !audioProcessor) return
  if (typeof setCurrentBuffer === 'function') {
    setCurrentBuffer(buf)
  }
  const start = loop.startSample / buf.length
  const end = loop.endSample / buf.length
  audioProcessor.setLoopPoints(start, end)
  if (typeof updateLoopInfo === 'function') updateLoopInfo({ start, end })
  if (typeof drawWaveform === 'function')
    drawWaveform(buf, 'waveformCanvas', { start, end })
  const status = op === 'randomLocal' && Array.isArray(subOps)
    ? subOps.join(' → ')
    : op
  if (typeof updateTrackInfo === 'function')
    updateTrackInfo(currentTrackName, status)
  if (typeof enqueueToast === 'function') enqueueToast(status)
  if (restart) {
    audioProcessor.stop()
    audioProcessor.play(buf).catch(() => {})
    if (typeof startTimelineAnimation === 'function') startTimelineAnimation()
    if (typeof startWaveformAnimation === 'function') startWaveformAnimation()
  }
}
