import { _amax, _amin } from '../scripts/_arrstat.js'
/**
 * playback/ops.js — buffer-level loop playback operations (Wave 6).
 *
 * These are the loop-speed / gap / reverse operations that previously lived
 * inline in the demo's AudioAnalyzer component, hoisted verbatim (same math,
 * same edge behavior) into the library as pure functions.
 *
 * Universal-runtime contract:
 *   - Inputs are AudioBuffer-shaped objects: { numberOfChannels, length,
 *     sampleRate, getChannelData(channel) }. Real AudioBuffers qualify.
 *   - No DOM, no window, no AudioContext. Output buffers are allocated via an
 *     injectable `createBuffer(numberOfChannels, length, sampleRate)` factory;
 *     the default factory returns a plain AudioBuffer-shaped object backed by
 *     Float32Arrays (Node/worker safe). Browser callers that need a genuine
 *     AudioBuffer pass `{ createBuffer: (ch, len, sr) => ctx.createBuffer(ch, len, sr) }`.
 *   - Loop descriptors are normalized: { start, end } with 0 <= start < end <= 1.
 *   - Invalid input throws immediately (API law 6) — no silent fallbacks.
 */

/**
 * Default pure buffer factory: an AudioBuffer-shaped object backed by
 * Float32Array channels. Safe in Node, workers, and browsers.
 */
export function createBufferLike(numberOfChannels, length, sampleRate) {
  const channels = []
  for (let c = 0; c < numberOfChannels; c++) {
    channels.push(new Float32Array(length))
  }
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData(channel) {
      return channels[channel]
    },
  }
}

function resolveFactory(opts) {
  const factory = opts && opts.createBuffer
  if (factory !== undefined && typeof factory !== 'function') {
    throw new Error('playback: options.createBuffer must be a function')
  }
  return factory || createBufferLike
}

function assertBuffer(buffer, fn) {
  if (
    !buffer ||
    typeof buffer.getChannelData !== 'function' ||
    !(buffer.length > 0) ||
    !(buffer.sampleRate > 0)
  ) {
    throw new Error(
      `playback.${fn}: buffer must be AudioBuffer-shaped ` +
        '({ numberOfChannels, length, sampleRate, getChannelData }).',
    )
  }
}

function assertLoop(loop, fn) {
  if (
    !loop ||
    !Number.isFinite(loop.start) ||
    !Number.isFinite(loop.end) ||
    loop.start < 0 ||
    loop.end > 1 ||
    !(loop.end > loop.start)
  ) {
    throw new Error(
      `playback.${fn}: loop must be normalized { start, end } with ` +
        `0 <= start < end <= 1 (got ${JSON.stringify(loop)}).`,
    )
  }
}

/**
 * Half speed (time stretch) a loop section. The loop region is stretched to
 * 2x its length (linear interpolation), so the returned buffer is LONGER by
 * one loop length. Content before/after the loop is preserved.
 *
 * @param {AudioBuffer|Object} audioBuffer
 * @param {{start:number, end:number}} loopData - normalized loop
 * @param {{createBuffer?: Function}} [opts]
 * @returns {Object} new buffer (length = old length + loopLength)
 */
export function halfSpeedLoop(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'halfSpeedLoop')
  assertLoop(loopData, 'halfSpeedLoop')
  const createBuffer = resolveFactory(opts)

  const startSample = Math.floor(loopData.start * audioBuffer.length)
  const endSample = Math.floor(loopData.end * audioBuffer.length)
  const loopLength = endSample - startSample
  const stretchedLength = loopLength * 2 // Double the length for half speed

  // Create new buffer with extra space for stretched audio
  const newLength = audioBuffer.length + stretchedLength - loopLength
  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    newLength,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy data before the loop
    for (let i = 0; i < startSample; i++) {
      outputData[i] = inputData[i]
    }

    // Stretch the loop section (simple linear interpolation)
    for (let i = 0; i < stretchedLength; i++) {
      const srcIndex = startSample + (i * loopLength) / stretchedLength
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, endSample - 1)
      const fraction = srcIndex - srcIndexFloor

      const sample1 = inputData[srcIndexFloor] || 0
      const sample2 = inputData[srcIndexCeil] || 0
      outputData[startSample + i] = sample1 + (sample2 - sample1) * fraction
    }

    // Copy data after the loop
    const outputOffset = startSample + stretchedLength
    for (let i = endSample; i < audioBuffer.length; i++) {
      const outputIndex = outputOffset + (i - endSample)
      if (outputIndex < newLength) {
        outputData[outputIndex] = inputData[i]
      }
    }
  }

  return newBuffer
}

/**
 * Half speed quantz: time-stretch the loop content at half speed but MASK it
 * to the original loop window, so the track length never changes. Only the
 * first half of the loop's source material is heard (the "hidden half" can be
 * revealed with revealHiddenHalf / revealFirstHalf).
 *
 * @returns {Object} new buffer (same length as input)
 */
export function halfSpeedQuantzLoop(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'halfSpeedQuantzLoop')
  assertLoop(loopData, 'halfSpeedQuantzLoop')
  const createBuffer = resolveFactory(opts)

  const startSample = Math.floor(loopData.start * audioBuffer.length)
  const endSample = Math.floor(loopData.end * audioBuffer.length)
  const loopLength = endSample - startSample

  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy data before the loop unchanged
    for (let i = 0; i < startSample; i++) {
      outputData[i] = inputData[i]
    }

    // Apply half speed stretch within loop boundaries (mask/clip effect)
    for (let i = 0; i < loopLength; i++) {
      const stretchedInputPos = i * 0.5 // Half speed = half position in source
      const srcIndex = startSample + stretchedInputPos
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, endSample - 1)
      const fraction = srcIndex - srcIndexFloor

      if (srcIndexFloor < endSample) {
        const sample1 = inputData[srcIndexFloor] || 0
        const sample2 = inputData[srcIndexCeil] || 0
        outputData[startSample + i] = sample1 + (sample2 - sample1) * fraction
      } else {
        outputData[startSample + i] = 0 // Silence if beyond source material
      }
    }

    // Copy data after the loop unchanged
    for (let i = endSample; i < audioBuffer.length; i++) {
      outputData[i] = inputData[i]
    }
  }

  return newBuffer
}

/**
 * Double speed quantz — gapless: compress the loop content at 2x speed into
 * half the space and shift everything after it left to close the gap. The
 * returned buffer is SHORTER.
 *
 * @returns {{buffer: Object, newLoopEnd: number}} new buffer + the new
 *   normalized loop end (loop start is unchanged)
 */
export function doubleSpeedQuantzLoop(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'doubleSpeedQuantzLoop')
  assertLoop(loopData, 'doubleSpeedQuantzLoop')
  const createBuffer = resolveFactory(opts)

  const startSample = Math.floor(loopData.start * audioBuffer.length)
  const endSample = Math.floor(loopData.end * audioBuffer.length)
  const loopLength = endSample - startSample

  const compressedLoopLength = Math.floor(loopLength / 2)
  const gapSize = loopLength - compressedLoopLength

  const newBufferLength = audioBuffer.length - gapSize
  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    newBufferLength,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy data before the loop unchanged
    for (let i = 0; i < startSample; i++) {
      outputData[i] = inputData[i]
    }

    // Compress the loop content at 2x speed (fits into half the space)
    for (let i = 0; i < compressedLoopLength; i++) {
      const compressedInputPos = i * 2.0
      const srcIndex = startSample + compressedInputPos
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, endSample - 1)
      const fraction = srcIndex - srcIndexFloor

      if (srcIndexFloor < endSample) {
        const sample1 = inputData[srcIndexFloor] || 0
        const sample2 = inputData[srcIndexCeil] || 0
        outputData[startSample + i] = sample1 + (sample2 - sample1) * fraction
      } else {
        outputData[startSample + i] = 0
      }
    }

    // Copy data after the original loop end, shifted left to close the gap
    const afterStartInInput = endSample
    const afterStartInOutput = startSample + compressedLoopLength
    for (let i = 0; i < audioBuffer.length - endSample; i++) {
      if (afterStartInOutput + i < newBufferLength) {
        outputData[afterStartInOutput + i] = inputData[afterStartInInput + i]
      }
    }
  }

  const newLoopEnd = (startSample + compressedLoopLength) / newBufferLength

  return { buffer: newBuffer, newLoopEnd }
}

/**
 * Double speed unquantz: compress the loop content at 2x speed IN PLACE
 * (track length unchanged), leaving either a natural glitch tail or — in
 * fractal mode when there is not enough room after the loop — writing only
 * the first half of the window so previously-layered content is preserved
 * (the matryoshka effect).
 *
 * @param {{fractal?: boolean, createBuffer?: Function}} [opts]
 * @returns {Object} new buffer (same length as input)
 */
export function doubleSpeedUnquantzLoop(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'doubleSpeedUnquantzLoop')
  assertLoop(loopData, 'doubleSpeedUnquantzLoop')
  const createBuffer = resolveFactory(opts)
  const fractal = opts.fractal !== undefined ? !!opts.fractal : true

  const startSample = Math.floor(loopData.start * audioBuffer.length)
  const endSample = Math.floor(loopData.end * audioBuffer.length)
  const loopLength = endSample - startSample

  // Check if there's enough room after loop for natural glitch
  const availableAfterLoop = audioBuffer.length - endSample
  const hasEnoughRoomForGlitch = availableAfterLoop >= loopLength

  let writeLength
  if (hasEnoughRoomForGlitch) {
    writeLength = loopLength
  } else if (fractal) {
    // Not enough room + fractal mode ON — write to first half only
    writeLength = Math.floor(loopLength / 2)
  } else {
    writeLength = loopLength
  }

  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy data before the loop unchanged
    for (let i = 0; i < startSample; i++) {
      outputData[i] = inputData[i]
    }

    // FIRST: copy the entire loop region to preserve existing content
    for (let i = 0; i < loopLength; i++) {
      outputData[startSample + i] = inputData[startSample + i]
    }

    // THEN: overwrite only the writeLength portion with compressed data
    for (let i = 0; i < writeLength; i++) {
      const compressedInputPos = i * 2.0
      const srcIndex = startSample + compressedInputPos
      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, audioBuffer.length - 1)
      const fraction = srcIndex - srcIndexFloor

      if (srcIndexFloor < audioBuffer.length) {
        const sample1 = inputData[srcIndexFloor] || 0
        const sample2 = inputData[srcIndexCeil] || 0
        outputData[startSample + i] = sample1 + (sample2 - sample1) * fraction
      } else {
        outputData[startSample + i] = 0
      }
    }

    // Copy data after the loop unchanged
    for (let i = endSample; i < audioBuffer.length; i++) {
      outputData[i] = inputData[i]
    }
  }

  return newBuffer
}

/**
 * Detect a gap (silence across all channels) after the loop end.
 *
 * @param {{silenceThreshold?: number, minGapSize?: number}} [opts]
 * @returns {{start:number, end:number, size:number}|null} sample-indexed gap,
 *   or null when no qualifying gap exists (an honest "nothing found", not an
 *   error).
 */
export function detectGap(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'detectGap')
  assertLoop(loopData, 'detectGap')
  const silenceThreshold =
    opts.silenceThreshold !== undefined ? opts.silenceThreshold : 0.01
  const minGapSize = opts.minGapSize !== undefined ? opts.minGapSize : 100

  const endSample = Math.floor(loopData.end * audioBuffer.length)

  // Check if there's enough space after the loop to have a gap
  if (endSample + minGapSize >= audioBuffer.length) {
    return null
  }

  // For each channel, find the first silence region after endSample
  const silenceRegions = []
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    let silenceStart = -1
    let found = false
    for (let i = endSample; i < audioBuffer.length; i++) {
      if (Math.abs(data[i]) < silenceThreshold) {
        if (silenceStart === -1) {
          silenceStart = i
        }
      } else {
        if (silenceStart !== -1 && i - silenceStart >= minGapSize) {
          silenceRegions.push({ start: silenceStart, end: i })
          found = true
          break
        }
        silenceStart = -1
      }
    }
    // Check if silence extends to the end
    if (
      !found &&
      silenceStart !== -1 &&
      audioBuffer.length - silenceStart >= minGapSize
    ) {
      silenceRegions.push({ start: silenceStart, end: audioBuffer.length })
    } else if (!found && silenceStart === -1) {
      return null
    }
  }

  if (silenceRegions.length === 0) return null

  // Intersection of silence regions across all channels
  const gapStart = _amax(silenceRegions.map((r) => r.start))
  const gapEnd = _amin(silenceRegions.map((r) => r.end))
  if (gapEnd - gapStart < minGapSize) {
    return null
  }

  return { start: gapStart, end: gapEnd, size: gapEnd - gapStart }
}

/**
 * Close a detected gap by shifting the audio after it left.
 * The normalized loop end is preserved as-is (legacy demo behavior).
 *
 * @returns {{buffer: Object, newLoopEnd: number, gapSize: number}|null}
 *   null when no gap was detected.
 */
export function closeGapLeft(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'closeGapLeft')
  assertLoop(loopData, 'closeGapLeft')
  const createBuffer = resolveFactory(opts)

  const gap = detectGap(audioBuffer, loopData, opts)
  if (!gap) return null

  const newBufferLength = audioBuffer.length - gap.size
  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    newBufferLength,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy everything before the gap
    for (let i = 0; i < gap.start; i++) {
      outputData[i] = inputData[i]
    }

    // Copy everything after the gap, shifted left
    for (let i = gap.end; i < audioBuffer.length; i++) {
      outputData[i - gap.size] = inputData[i]
    }
  }

  return { buffer: newBuffer, newLoopEnd: loopData.end, gapSize: gap.size }
}

/**
 * Close a detected gap by removing it and rescaling the loop end to the
 * shorter buffer (content after the gap keeps its absolute position relative
 * to the loop end).
 *
 * @returns {{buffer: Object, newLoopEnd: number, gapSize: number}|null}
 */
export function closeGapRight(audioBuffer, loopData, opts = {}) {
  assertBuffer(audioBuffer, 'closeGapRight')
  assertLoop(loopData, 'closeGapRight')
  const createBuffer = resolveFactory(opts)

  const gap = detectGap(audioBuffer, loopData, opts)
  if (!gap) return null

  const newBufferLength = audioBuffer.length - gap.size
  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    newBufferLength,
    audioBuffer.sampleRate,
  )

  const endSample = Math.floor(loopData.end * audioBuffer.length)

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy everything before the loop end
    for (let i = 0; i < endSample; i++) {
      outputData[i] = inputData[i]
    }

    // Skip the gap and copy the rest
    for (let i = gap.end; i < audioBuffer.length; i++) {
      const outputIndex = i - gap.size
      if (outputIndex < newBufferLength) {
        outputData[outputIndex] = inputData[i]
      }
    }
  }

  const newLoopEnd = loopData.end * (newBufferLength / audioBuffer.length)

  return { buffer: newBuffer, newLoopEnd, gapSize: gap.size }
}

/**
 * Reverse a sample range of a buffer WITHOUT mutating the input
 * (copy-then-reverse; contrast with the in-place core reverseBufferSection).
 *
 * @param {number} startSample - inclusive start of the section
 * @param {number} endSample - exclusive end of the section
 * @returns {Object} new buffer (same length as input)
 */
export function reverseSection(audioBuffer, startSample, endSample, opts = {}) {
  assertBuffer(audioBuffer, 'reverseSection')
  if (
    !Number.isFinite(startSample) ||
    !Number.isFinite(endSample) ||
    startSample < 0 ||
    endSample > audioBuffer.length ||
    !(endSample > startSample)
  ) {
    throw new Error(
      `playback.reverseSection: invalid sample range [${startSample}, ${endSample}] ` +
        `for buffer of length ${audioBuffer.length}.`,
    )
  }
  const createBuffer = resolveFactory(opts)

  const newBuffer = createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel)
    const newData = newBuffer.getChannelData(channel)

    newData.set(originalData)

    const loopLength = endSample - startSample
    for (let i = 0; i < loopLength; i++) {
      const originalIndex = startSample + i
      const reversedIndex = startSample + (loopLength - 1 - i)
      newData[originalIndex] = originalData[reversedIndex]
    }
  }

  return newBuffer
}

/**
 * Reveal the "hidden" second half of a half-speed-quantz'd loop: replace the
 * loop window with the SECOND half of the original loop content, half-speed
 * stretched (optionally reversed). Used by the demo's nudge toggle.
 *
 * @param {Object} currentBuffer - the processed buffer currently playing
 * @param {Object} originalBuffer - the unprocessed source buffer
 * @param {{start:number, end:number}} loopData - normalized loop
 * @param {{reverse?: boolean, createBuffer?: Function}} [opts]
 * @returns {Object} new buffer (same length as currentBuffer)
 */
export function revealHiddenHalf(currentBuffer, originalBuffer, loopData, opts = {}) {
  assertBuffer(currentBuffer, 'revealHiddenHalf')
  assertBuffer(originalBuffer, 'revealHiddenHalf')
  assertLoop(loopData, 'revealHiddenHalf')
  const createBuffer = resolveFactory(opts)
  const shouldReverse = !!opts.reverse

  const startSample = Math.floor(loopData.start * currentBuffer.length)
  const endSample = Math.floor(loopData.end * currentBuffer.length)
  const loopLength = endSample - startSample

  const newBuffer = createBuffer(
    currentBuffer.numberOfChannels,
    currentBuffer.length,
    currentBuffer.sampleRate,
  )

  for (let channel = 0; channel < currentBuffer.numberOfChannels; channel++) {
    const currentData = currentBuffer.getChannelData(channel)
    const originalData = originalBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy everything from current buffer
    for (let i = 0; i < currentBuffer.length; i++) {
      outputData[i] = currentData[i]
    }

    // Replace loop section with the "hidden half" from the original,
    // half-speed processed (and optionally reversed)
    for (let i = 0; i < loopLength; i++) {
      const halfSpeedPos = i * 0.5
      const originalHalfOffset = loopLength / 2 // Start from second half of original
      const nudgeStartSample = Math.floor(loopData.start * originalBuffer.length)
      const srcIndex = nudgeStartSample + originalHalfOffset + halfSpeedPos

      const srcIndexFloor = Math.floor(srcIndex)
      const nudgeEndSample = Math.floor(loopData.end * originalBuffer.length)
      const srcIndexCeil = Math.min(srcIndexFloor + 1, nudgeEndSample - 1)
      const fraction = srcIndex - srcIndexFloor

      if (
        srcIndexFloor < nudgeEndSample &&
        srcIndexFloor >= nudgeStartSample + originalHalfOffset
      ) {
        const sample1 = originalData[srcIndexFloor] || 0
        const sample2 = originalData[srcIndexCeil] || 0
        const interpolatedSample = sample1 + (sample2 - sample1) * fraction

        if (shouldReverse) {
          const reversedIndex = startSample + (loopLength - 1 - i)
          outputData[reversedIndex] = interpolatedSample
        } else {
          outputData[startSample + i] = interpolatedSample
        }
      }
    }
  }

  return newBuffer
}

/**
 * Reveal the FIRST half of a half-speed-quantz'd loop (counterpart of
 * revealHiddenHalf; toggles the nudge back).
 *
 * @returns {Object} new buffer (same length as currentBuffer)
 */
export function revealFirstHalf(currentBuffer, originalBuffer, loopData, opts = {}) {
  assertBuffer(currentBuffer, 'revealFirstHalf')
  assertBuffer(originalBuffer, 'revealFirstHalf')
  assertLoop(loopData, 'revealFirstHalf')
  const createBuffer = resolveFactory(opts)
  const shouldReverse = !!opts.reverse

  const startSample = Math.floor(loopData.start * currentBuffer.length)
  const endSample = Math.floor(loopData.end * currentBuffer.length)
  const loopLength = endSample - startSample

  const newBuffer = createBuffer(
    currentBuffer.numberOfChannels,
    currentBuffer.length,
    currentBuffer.sampleRate,
  )

  for (let channel = 0; channel < currentBuffer.numberOfChannels; channel++) {
    const currentData = currentBuffer.getChannelData(channel)
    const originalData = originalBuffer.getChannelData(channel)
    const outputData = newBuffer.getChannelData(channel)

    // Copy everything from current buffer
    for (let i = 0; i < currentBuffer.length; i++) {
      outputData[i] = currentData[i]
    }

    // Replace loop section with the "first half" from the original,
    // half-speed processed (and optionally reversed)
    for (let i = 0; i < loopLength; i++) {
      const halfSpeedPos = i * 0.5
      const nudgeStartSample = Math.floor(loopData.start * originalBuffer.length)
      const srcIndex = nudgeStartSample + halfSpeedPos

      const srcIndexFloor = Math.floor(srcIndex)
      const srcIndexCeil = Math.min(
        srcIndexFloor + 1,
        nudgeStartSample + loopLength / 2 - 1,
      )
      const fraction = srcIndex - srcIndexFloor

      if (srcIndexFloor < nudgeStartSample + loopLength / 2) {
        const sample1 = originalData[srcIndexFloor] || 0
        const sample2 = originalData[srcIndexCeil] || 0
        const interpolatedSample = sample1 + (sample2 - sample1) * fraction

        if (shouldReverse) {
          const reversedIndex = startSample + (loopLength - 1 - i)
          outputData[reversedIndex] = interpolatedSample
        } else {
          outputData[startSample + i] = interpolatedSample
        }
      }
    }
  }

  return newBuffer
}
