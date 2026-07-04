import { fastBPMDetect } from '../scripts/analysis/BPMDetector.js';
import { randomSequence } from './loopPlayground.js';
import { GibClock } from './GibClock.js';

/**
 * Start a per-bar glitch sequence over the buffer.
 * @param {AudioBuffer|Object} audioBuffer - buffer to glitch (required)
 * @param {Object} [options]
 * @param {number} [options.maxOpsPerBar=1] - random ops applied per bar
 * @param {(result: Object) => void} [options.onUpdate] - called with each step result
 * @returns {() => void} stop function
 */
export function startBeatGlitch(audioBuffer, { maxOpsPerBar = 1, onUpdate } = {}) {
  if (!audioBuffer) throw new Error('audioBuffer required');
  const bpm = fastBPMDetect(audioBuffer);
  const barMs = (60 / bpm) * 4 * 1000;
  const clock = new GibClock(barMs);

  clock.start(() => {
    const seq = randomSequence(audioBuffer, { steps: maxOpsPerBar });
    for (const step of seq) {
      const res = step();
      if (typeof onUpdate === 'function') onUpdate(res);
    }
  });

  return () => clock.stop();
}
