/**
 * Loop-descriptor helpers for the play layer.
 * A loop descriptor is `{ startSample, endSample }` over a buffer.
 */

import { beatTrack } from '../scripts/xa-beat.js';
import { findPreciseLoop } from '../loop/precise.js';
import { findMusicalLoop } from '../scripts/xa-downbeat.js';

/**
 * Return a loop spanning the entire buffer. Performs NO detection — this is
 * the explicit "whole buffer" descriptor used by `resetLoop`.
 * @param {{length: number}} buffer
 * @returns {{startSample: number, endSample: number}}
 */
export function fullBufferLoop(buffer) {
  return { startSample: 0, endSample: buffer.length };
}

/**
 * Detect loop points and return a real sample-range descriptor.
 *
 * This is the SYNCHRONOUS play-layer entry point. It runs the same
 * beat-tracked precise / bar-aligned pipeline as `loop.detect()`'s 'fast'
 * strategy (src/loop/fast.js): beat tracking for tempo, an onset-pair precise
 * search, then a within-strategy bar-aligned search, and finally the same
 * documented first-half heuristic. It returns a genuine `{ startSample,
 * endSample }` sub-range — it does NOT return the whole buffer for detectable
 * material (that is what the old stub did, and what `fullBufferLoop` is for).
 *
 * It stays synchronous (rather than awaiting the async `loop.detect()`)
 * because the play layer needs a mutable descriptor it can assign into
 * (`loop.endSample = …`); it therefore drives the same synchronous detection
 * primitives directly.
 *
 * @param {{getChannelData: Function, sampleRate: number, length: number}} buffer
 * @returns {{startSample: number, endSample: number}}
 */
export function detectLoop(buffer) {
  const audioData = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;

  const { tempo } = beatTrack(audioData, sampleRate, { hopLength: 256 });
  const barDuration = tempo > 0 ? (60 / tempo) * 4 : 0;

  let startSec = null;
  let endSec = null;

  if (barDuration > 0) {
    // Precise onset-pair search first (exact boundaries).
    const precise = findPreciseLoop(audioData, sampleRate, tempo, {
      minLoopDuration: barDuration * 0.8,
      maxLoopDuration: barDuration * 2.5,
      searchStart: 2.6,
      searchEnd: 0.6,
    });

    if (precise && precise.score > 0.5) {
      startSec = precise.start;
      endSec = precise.end;
    } else {
      // Within-strategy fallback: bar-aligned search.
      const musical = findMusicalLoop(audioData, sampleRate, tempo, {
        preferredBars: 4,
        minBars: 2,
        maxBars: 8,
      });
      if (musical) {
        startSec = musical.start;
        endSec = musical.end;
      }
    }
  }

  let startSample = Math.round(startSec * sampleRate);
  let endSample = Math.round(endSec * sampleRate);

  // Documented last-resort heuristic (mirrors src/loop/fast.js): the first
  // half of the material, capped at 4 bars. Still a real sub-range — this
  // path never returns the whole buffer as a "detected" loop.
  if (
    !Number.isFinite(startSample) ||
    !Number.isFinite(endSample) ||
    endSample <= startSample
  ) {
    const halfBuffer = Math.floor(totalSamples / 2);
    const fourBars =
      barDuration > 0 ? Math.round(barDuration * 4 * sampleRate) : halfBuffer;
    startSample = 0;
    endSample = Math.min(fourBars || halfBuffer, halfBuffer);
  }

  startSample = Math.max(0, Math.min(startSample, totalSamples));
  endSample = Math.max(startSample, Math.min(endSample, totalSamples));
  return { startSample, endSample };
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
