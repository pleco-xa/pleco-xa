// @ts-check
/**
 * Kick+Snare detector for finding strong downbeats
 * Useful for electronic music, hip-hop, and other beat-driven genres
 */

import { debugLog } from './debug.js'

/**
 * Find kick+snare hit (strong transient with wide frequency content)
 */
export function findKickSnareHit(audioData, sampleRate, loop) {
  debugLog(`🥁 Looking for kick+snare hit near ${loop.start.toFixed(3)}s`)

  const searchWindow = 0.2 // Search within 200ms
  const startSample = Math.floor(
    Math.max(0, (loop.start - searchWindow * 0.5) * sampleRate),
  )
  const endSample = Math.floor(
    Math.min(audioData.length, (loop.start + searchWindow) * sampleRate),
  )

  const windowSize = 512
  const hopSize = 64

  let maxTransientScore = 0
  let maxTransientPosition = 0

  // Scan for transients
  for (let pos = startSample; pos < endSample - windowSize; pos += hopSize) {
    // Calculate transient strength (sudden energy increase)
    let prevEnergy = 0
    let currEnergy = 0

    // Previous window
    for (let i = pos - windowSize; i < pos; i++) {
      if (i >= 0) prevEnergy += audioData[i] * audioData[i]
    }
    prevEnergy /= windowSize

    // Current window
    for (let i = pos; i < pos + windowSize; i++) {
      currEnergy += audioData[i] * audioData[i]
    }
    currEnergy /= windowSize

    // Transient detection - look for sudden jump
    const transientRatio = currEnergy / (prevEnergy + 1e-10)

    // Check frequency content (kick+snare has both low and high)
    const freqScore = checkFrequencySpread(
      audioData.slice(pos, pos + windowSize),
    )

    // Combined score
    const score = transientRatio * freqScore

    if (score > maxTransientScore) {
      maxTransientScore = score
      maxTransientPosition = pos
    }
  }

  // Convert to time
  const detectedTime = maxTransientPosition / sampleRate

  // Only adjust if we found a strong transient
  if (maxTransientScore > 5.0 && Math.abs(detectedTime - loop.start) > 0.01) {
    // Add a small offset to account for transient being detected slightly early
    const adjustedTime = detectedTime + 0.02 // 20ms later to hit the actual beat center

    debugLog(
      `🥁 Found kick+snare at ${detectedTime.toFixed(3)}s (score: ${maxTransientScore.toFixed(2)})`,
    )
    debugLog(
      `🥁 Adjusted to ${adjustedTime.toFixed(3)}s (+20ms to hit beat center)`,
    )

    return {
      ...loop,
      start: adjustedTime,
      end: adjustedTime + loop.duration,
      kickSnareDetected: true,
    }
  }

  debugLog(
    `🥁 No clear kick+snare found (max score: ${maxTransientScore.toFixed(2)})`,
  )
  return null
}

/**
 * Check if audio has both low (kick) and high (snare) frequency content
 */
function checkFrequencySpread(windowData) {
  // Simple energy split - low vs high
  // const midPoint = Math.floor(windowData.length / 2)

  // Apply simple high-pass and low-pass
  let lowEnergy = 0
  let highEnergy = 0

  // Simplified frequency analysis
  for (let i = 1; i < windowData.length; i++) {
    const diff = windowData[i] - windowData[i - 1] // Simple derivative (high-pass)
    highEnergy += diff * diff
  }

  for (let i = 0; i < windowData.length; i++) {
    lowEnergy += windowData[i] * windowData[i] // Direct energy (includes low)
  }

  // Good kick+snare has both
  const hasLow = lowEnergy > 0.001
  const hasHigh = highEnergy > 0.0001

  return hasLow && hasHigh ? 2.0 : 1.0
}
