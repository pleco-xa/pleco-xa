/**
 * Clean loop analysis using a recurrence matrix
 * No BPM dependencies, just pure audio structure analysis
 */

/**
 * Main loop detection using recurrence matrix - clean and minimal
 */
import { debugLog } from './debug.js'
export async function recurrenceLoopAnalysis(audioBuffer) {
  console.time('recurrence_loop_analysis')

  try {
    // Use xa-style recurrence matrix for loop detection
    const { recurrenceLoopDetection } = await import('./xa-recurrence.js')
    const result = await recurrenceLoopDetection(audioBuffer)

    console.timeEnd('recurrence_loop_analysis')
    debugLog(
      `Recurrence detection: ${result.loopStart.toFixed(3)}s - ${result.loopEnd.toFixed(3)}s`,
    )

    return result
  } catch (error) {
    console.error('Recurrence matrix failed:', error)

    // Minimal fallback
    const duration = audioBuffer.duration
    return {
      loopStart: 0,
      loopEnd: Math.min(5.0, duration),
      confidence: 50,
      bpm: 120,
      musicalDivision: 2,
    }
  }
}
