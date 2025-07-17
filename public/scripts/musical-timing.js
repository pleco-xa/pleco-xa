// @ts-check
/**
 * Musical timing and beat alignment functions
 * Part of Pleco Xa audio analysis engine
 */

/**
 * Calculate how well a loop length aligns with musical timing
 * @param {number} loopLength - Length of loop in seconds
 * @param {number} bpm - Beats per minute
 * @returns {number} Alignment score (0-1, higher is better)
 */
export function calculateBeatAlignment(loopLength, bpm) {
  const beatDuration = 60 / bpm
  const beatsInLoop = loopLength / beatDuration

  // Prefer whole numbers of beats, half beats, or whole bars
  const beatAlignment = 1 - Math.abs(beatsInLoop - Math.round(beatsInLoop))

  // Extra boost for common musical divisions (1, 2, 4, 8, 16 beats)
  const commonDivisions = [1, 2, 4, 8, 16]
  const nearestDivision = commonDivisions.reduce((prev, curr) =>
    Math.abs(curr - beatsInLoop) < Math.abs(prev - beatsInLoop) ? curr : prev,
  )

  const divisionBonus = Math.max(
    0,
    1 - Math.abs(nearestDivision - beatsInLoop) / 2,
  )

  return beatAlignment * 0.7 + divisionBonus * 0.3
}
