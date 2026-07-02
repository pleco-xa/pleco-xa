import { fastBPMDetect } from '../scripts/analysis/BPMDetector.ts';
import { randomSequence } from './loopPlayground.js';
import { GibClock } from './GibClock.js';

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
