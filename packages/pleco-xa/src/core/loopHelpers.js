/**
 * Pure loop-descriptor helpers for the play layer.
 * A loop descriptor is `{ startSample, endSample }` over a buffer.
 */

/**
 * Return a loop spanning the entire buffer.
 * This performs NO detection — it is the honest name for what the old
 * `detectLoop` stub always did (return the full range).
 * @param {{length: number}} buffer
 * @returns {{startSample: number, endSample: number}}
 */
export function fullBufferLoop(buffer) {
  return { startSample: 0, endSample: buffer.length };
}

/**
 * @deprecated Misleading name kept for play-layer compatibility: this has
 * never detected anything — it returns the full buffer range. Use
 * `fullBufferLoop` for this behavior, or `loop.detect()`
 * (src/loop/detect.js) for real loop detection.
 */
export function detectLoop(buffer) {
  return fullBufferLoop(buffer);
}

export function halfLoop(loop) {
  const mid = loop.startSample + Math.floor((loop.endSample - loop.startSample) / 2);
  return { startSample: loop.startSample, endSample: mid };
}

export function doubleLoop(loop, maxSamples) {
  const len = loop.endSample - loop.startSample;
  const end = Math.min(loop.endSample + len, maxSamples);
  return { startSample: loop.startSample, endSample: end };
}

export function moveForward(loop, steps, maxSamples) {
  const len = loop.endSample - loop.startSample;
  const start = Math.min(loop.startSample + steps, maxSamples - len);
  return { startSample: start, endSample: start + len };
}

export function resetLoop(buffer) {
  return fullBufferLoop(buffer);
}

export function reverseBufferSection(buffer, start, end) {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    let i = 0;
    let j = end - start - 1;
    while (i < j) {
      const a = data[start + i];
      data[start + i] = data[start + j];
      data[start + j] = a;
      i++;
      j--;
    }
  }
  return buffer;
}
