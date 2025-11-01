// Extended audio operations including quantum rhythm operations
import {
  halfLoop, doubleLoop, moveForward, reverseBufferSection, resetLoop, detectLoop
} from '../core/index.js';

/* -------- NEW quantum operations ---------- */
export function stutter(loop, buffer, repeats = 3) {
  const span = Math.min(0.01 * buffer.sampleRate,
                        loop.endSample - loop.startSample);
  const chan0 = buffer.getChannelData(0);
  const slice = chan0.slice(loop.startSample, loop.startSample + span);
  for (let r = 0; r < repeats; r++) {
    slice.forEach((v, i) => {
      const targetIndex = loop.startSample + r * span + i;
      if (targetIndex < chan0.length) {
        chan0[targetIndex] = v;
      }
    });
  }
  return { buffer, loop };
}

export function phase(loop, buffer, offset = 0.02) {
  const shift = Math.floor(offset * buffer.sampleRate);
  const len = buffer.length;
  loop = {
    startSample: (loop.startSample + shift) % len,
    endSample: (loop.endSample + shift) % len
  };
  return { buffer, loop };
}

export function fractal(loop, buffer) {
  const mid = Math.floor((loop.startSample + loop.endSample) / 2);
  buffer = reverseBufferSection(buffer, loop.startSample, mid);
  return { buffer, loop };
}

export const applyQuantumOp = (op, buffer, loop) => {
  switch (op) {
    case 'half':
      if (loop.endSample - loop.startSample >= 2 * (10 / 1000) * buffer.sampleRate) {
        loop = halfLoop(loop);
      }
      break;
    case 'double':
      loop = doubleLoop(loop, buffer.length);
      break;
    case 'move':
      const duration = loop.endSample - loop.startSample;
      const newStart = loop.startSample + duration;
      const newEnd = loop.endSample + duration;
      if (newEnd <= buffer.length) {
        loop = { startSample: newStart, endSample: newEnd };
      }
      break;
    case 'reverse':
      buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample);
      break;
    case 'reset':
      loop = resetLoop(buffer);
      break;
    case 'stutter':
      ({ buffer, loop } = stutter(loop, buffer, 4));
      break;
    case 'phase':
      ({ buffer, loop } = phase(loop, buffer, 0.1));
      break;
    case 'fractal':
      ({ buffer, loop } = fractal(loop, buffer));
      break;
    case 'silence':
      // noop - treat as rest
      break;
    default:
      console.warn('Unknown quantum op', op);
  }
  return { buffer, loop };
};