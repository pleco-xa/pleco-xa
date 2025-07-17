import { detectBPM } from '../scripts/xa-bpm-detection.js';
import { fastBPMDetect } from '../scripts/xa-beat.js';
import { fastLoopAnalysis } from '../scripts/xa-loop.js';

self.onmessage = async (event) => {
  const arrayBuffer = event.data;
  if (!(arrayBuffer instanceof ArrayBuffer)) return;

  try {
    self.postMessage({ progress: 0 });

    const ctx = new OfflineAudioContext(1, 1, 44100);
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    self.postMessage({ progress: 0.5 });

    const bpmResult = fastBPMDetect(audioBuffer);
    self.postMessage({ progress: 0.75, bpm: bpmResult });

    let loop = null;
    try {
      loop = await fastLoopAnalysis(audioBuffer);
    } catch (err) {
      // ignore loop errors
    }

    self.postMessage({ bpm: bpmResult, loopPoints: loop, progress: 1 });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
