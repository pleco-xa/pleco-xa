// demoSequences.js
import {
  halfLoop,
  doubleLoop,
  reverseBufferSection,
  detectLoop,
} from './loopHelpers.js';

export function signatureDemo(buffer) {
  const steps = [];
  let loop = detectLoop(buffer);

  const push = (op, mutator) => {
    steps.push({
      op,
      fn: () => {
        mutator();
        return { buffer, loop, op };
      },
    });
  };

  // Simple, clear signature sequence
  // Phase 1: Narrow down to small loop
  push('half', () => { loop = halfLoop(loop); });
  push('half', () => { loop = halfLoop(loop); });
  push('half', () => { loop = halfLoop(loop); });
  push('reverse', () => { buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample); });
  
  // Phase 2: Move around and reverse
  push('move forward', () => {
    const duration = loop.endSample - loop.startSample;
    const newStart = loop.startSample + duration;
    const newEnd = loop.endSample + duration;
    if (newEnd <= buffer.length) {
      loop = { startSample: newStart, endSample: newEnd };
    }
  });
  push('reverse', () => { buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample); });
  
  push('move forward', () => {
    const duration = loop.endSample - loop.startSample;
    const newStart = loop.startSample + duration;
    const newEnd = loop.endSample + duration;
    if (newEnd <= buffer.length) {
      loop = { startSample: newStart, endSample: newEnd };
    }
  });
  push('reverse', () => { buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample); });
  
  // Phase 3: Grow back up
  push('double', () => { loop = doubleLoop(loop, buffer.length); });
  push('reverse', () => { buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample); });
  push('double', () => { loop = doubleLoop(loop, buffer.length); });
  push('reverse', () => { buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample); });
  push('double', () => { loop = doubleLoop(loop, buffer.length); });
  
  // Phase 4: Final moves and finish
  push('move forward', () => {
    const duration = loop.endSample - loop.startSample;
    const newStart = loop.startSample + duration;
    const newEnd = loop.endSample + duration;
    if (newEnd <= buffer.length) {
      loop = { startSample: newStart, endSample: newEnd };
    }
  });
  push('reverse', () => { buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample); });

  return steps;
}
