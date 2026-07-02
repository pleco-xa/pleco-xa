import {
  detectLoop,
  halfLoop,
  doubleLoop,
  moveForward,
  reverseBufferSection,
  resetLoop,
} from './loopHelpers.js';
import { GibClock } from './GibClock.js';

export function randomSequence(
  buffer,
  { durationMs = buffer.duration * 1000, minMs = 10, maxMs = buffer.duration * 1000, steps = 4 } = {},
) {
  const minSamples = Math.floor((minMs / 1000) * buffer.sampleRate);
  const maxSamples = Math.min(
    Math.floor((maxMs / 1000) * buffer.sampleRate),
    buffer.length,
  );
  const durationSamples = Math.min(
    Math.floor((durationMs / 1000) * buffer.sampleRate),
    buffer.length,
  );
  const initialSamples = Math.min(durationSamples, maxSamples);

  let loop = detectLoop(buffer);
  loop.endSample = Math.min(loop.startSample + initialSamples, buffer.length);

  const actions = [
    { op: 'move', w: 32 },
    { op: 'half', w: 20 },
    { op: 'double', w: 16 },
    { op: 'reverse', w: 12 },
    { op: 'reset', w: 20 },
  ];
  const totalW = actions.reduce((s, { w }) => s + w, 0);
  const sequence = [];

  let rightSideOperations = 0; // Track operations on right side
  
  for (let i = 0; i < steps; i++) {
    let action = 'move';
    
    // Check if loop is on right side (more than 70% towards the end)
    const currentStart = loop.startSample;
    const isOnRightSide = currentStart > (buffer.length * 0.7);
    
    if (isOnRightSide) {
      rightSideOperations++;
    } else {
      rightSideOperations = 0; // Reset counter when not on right side
    }
    
    // If too many operations on right side, reset and use left-biased operations
    if (rightSideOperations >= 4) {
      action = 'reset';
      rightSideOperations = 0;
    } else if (rightSideOperations >= 3) {
      // Execute complex sequence to move away from right side
      const complexSequence = [
        'half', 'half', 'half', 'half', 'half', 'half', // 6 halfs
        'reverse',
        'double', 'double', // 2x double
        'reverse',
        'move', 'move', // 2x forward
        'reverse',
        'half',
        'move', // forward
        'double',
        'reverse',
        'move', // forward
        'half', 'half', // 2x half
        'move', // forward
        'double', 'double', // 2x double
        'move', // forward
        'reverse',
        'reset'
      ];
      
      // Execute the complex sequence
      for (const seqOp of complexSequence) {
        switch (seqOp) {
          case 'half':
            if (loop.endSample - loop.startSample >= 2 * minSamples) {
              loop = halfLoop(loop);
            }
            break;
          case 'double':
            loop = doubleLoop(loop, maxSamples);
            break;
          case 'move': {
            const len = loop.endSample - loop.startSample;
            const maxMove = buffer.length - len;
            const step = Math.floor(Math.random() * (maxMove + 1));
            loop = moveForward(loop, step, buffer.length);
            break;
          }
          case 'reverse':
            buffer = reverseBufferSection(
              buffer,
              loop.startSample,
              loop.endSample,
            );
            break;
          case 'reset':
            loop = resetLoop(buffer);
            break;
        }
      }
      
      rightSideOperations = 0;
      i += Math.min(complexSequence.length, steps - i - 1); // Skip ahead
      action = 'move'; // Set dummy action for the regular flow
    } else if (i < 5) {
      // First 5 steps: very high chance of half (90%)
      action = Math.random() < 0.9 ? 'half' : 'move';
    } else {
      // Rest of steps: normal random distribution
      let r = Math.random() * totalW;
      let acc = 0;
      for (const { op, w } of actions) {
        acc += w;
        if (r < acc) {
          action = op;
          break;
        }
      }
    }
    
    const fn = () => {
      switch (action) {
        case 'half':
          if (loop.endSample - loop.startSample >= 2 * minSamples) {
            loop = halfLoop(loop);
          }
          break;
        case 'double':
          loop = doubleLoop(loop, maxSamples);
          break;
        case 'move': {
          const duration = loop.endSample - loop.startSample;
          const newStart = loop.startSample + duration;
          const newEnd = loop.endSample + duration;
          if (newEnd <= buffer.length) {
            loop = { startSample: newStart, endSample: newEnd };
          }
          break;
        }
        case 'reverse':
          buffer = reverseBufferSection(
            buffer,
            loop.startSample,
            loop.endSample,
          );
          break;
        case 'reset':
          loop = resetLoop(buffer);
          break;
      }
      
      // Check if we hit full or half length and trigger cocktail sequence
      const currentLength = loop.endSample - loop.startSample;
      const fullLength = buffer.length;
      const halfLength = Math.floor(fullLength / 2);
      
      if (currentLength === fullLength || Math.abs(currentLength - halfLength) < buffer.sampleRate * 0.1) {
        // Inject cocktail sequence - random mix of operations
        const cocktailOps = [];
        
        // 2-3 half loops when full width (just enough to narrow down)
        const halfCount = 2 + Math.floor(Math.random() * 2);
        for (let h = 0; h < halfCount; h++) {
          cocktailOps.push('half');
        }
        
        // 4-6 forwards interspersed with reverses (increased to spread around more)
        const forwardCount = 4 + Math.floor(Math.random() * 3);
        for (let f = 0; f < forwardCount; f++) {
          cocktailOps.push('move');
          if (Math.random() < 0.3) cocktailOps.push('reverse');
        }
        
        // 2-4 doubles with random placement (increased to grow loops back)
        const doubleCount = 2 + Math.floor(Math.random() * 3);
        for (let d = 0; d < doubleCount; d++) {
          const insertPos = Math.floor(Math.random() * cocktailOps.length);
          cocktailOps.splice(insertPos, 0, 'double');
        }
        
        // Add some resets to break out of small loops
        if (Math.random() < 0.3) {
          cocktailOps.splice(Math.floor(Math.random() * cocktailOps.length), 0, 'reset');
        }
        
        // Add final reverses and halfs
        if (Math.random() < 0.7) cocktailOps.push('reverse');
        if (Math.random() < 0.6) cocktailOps.push('half');
        if (Math.random() < 0.5) cocktailOps.push('reverse');
        
        // Execute cocktail sequence
        for (const op of cocktailOps) {
          switch (op) {
            case 'half':
              if (loop.endSample - loop.startSample >= 2 * minSamples) {
                loop = halfLoop(loop);
              }
              break;
            case 'double':
              loop = doubleLoop(loop, maxSamples);
              break;
            case 'move': {
              const duration = loop.endSample - loop.startSample;
              const newStart = loop.startSample + duration;
              const newEnd = loop.endSample + duration;
              if (newEnd <= buffer.length) {
                loop = { startSample: newStart, endSample: newEnd };
              }
              break;
            }
            case 'reverse':
              buffer = reverseBufferSection(
                buffer,
                loop.startSample,
                loop.endSample,
              );
              break;
            case 'reset':
              loop = resetLoop(buffer);
              break;
          }
        }
        
        // Skip ahead in the main sequence to account for cocktail operations
        i += Math.min(cocktailOps.length, steps - i - 1);
      }
      
      return { buffer, loop, op: action };
    };
    fn.op = action;
    sequence.push(fn);
  }

  return sequence;
}

export function randomLocal(buffer, loop, { minMs = 100 } = {}) {
  const subOps = ['reset'];
  const minSamples = Math.floor((minMs / 1000) * buffer.sampleRate);
  const apply = (op) => {
    switch (op) {
      case 'half':
        if (loop.endSample - loop.startSample >= 2 * minSamples)
          loop = halfLoop(loop);
        break;
      case 'double':
        loop = doubleLoop(loop, buffer.length);
        break;
      case 'move': {
        const duration = loop.endSample - loop.startSample;
        const newStart = loop.startSample + duration;
        const newEnd = loop.endSample + duration;
        if (newEnd <= buffer.length) {
          loop = { startSample: newStart, endSample: newEnd };
        }
        break;
      }
      case 'reverse':
        buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample);
        break;
    }
  };
  const count = 2 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const maybeHalf = () =>
      (loop.endSample - loop.startSample) / buffer.sampleRate / 2 >= minMs / 1000;
    const maybeMove = () =>
      (loop.endSample - loop.startSample) / buffer.sampleRate < buffer.duration;

    const ops = [
      maybeHalf() && 'half',
      'double',
      maybeMove() && 'move',
      'reverse',
    ].filter(Boolean);

    const op = ops[Math.floor(Math.random() * ops.length)];
    apply(op);
    subOps.push(op);
  }
  return { buffer, loop, op: 'randomLocal', subOps };
}

export function glitchBurst(buffer, {
  ctx,
  durationMs = 8000,
  minMs = 100,
  maxMs = buffer.duration * 1000,
  onUpdate = () => {}
} = {}) {
  const start = performance.now();
  let loop = detectLoop(buffer);

  const weights = [
    { op: 'move', w: 40 },
    { op: 'half', w: 25 },
    { op: 'double', w: 20 },
    { op: 'reverse', w: 15 },
  ];

  const totalW = weights.reduce((s, { w }) => s + w, 0);
  const pickOp = () => {
    const r = Math.random() * totalW;
    let sum = 0;
    for (const { op, w } of weights) {
      sum += w;
      if (r < sum) return op;
    }
    return 'move';
  };

  const applyOp = (op) => {
    switch (op) {
      case 'half':
        if ((loop.endSample - loop.startSample) / buffer.sampleRate / 2 >= minMs / 1000)
          loop = halfLoop(loop);
        break;
      case 'double':
        loop = doubleLoop(loop, buffer.length);
        break;
      case 'reverse':
        buffer = reverseBufferSection(buffer, loop.startSample, loop.endSample);
        break;
      case 'move': {
        const len = loop.endSample - loop.startSample;
        let newStart = Math.floor(Math.random() * (buffer.length - len));
        loop = { startSample: newStart, endSample: newStart + len };
        break;
      }
    }
    return [op];
  };

  const doRandomLocal = () => {
    const subOps = [];
    subOps.push('reset');
    const count = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const maybeHalf = () =>
        (loop.endSample - loop.startSample) / buffer.sampleRate / 2 >= minMs / 1000;
      const maybeMove = () =>
        (loop.endSample - loop.startSample) / buffer.sampleRate < buffer.duration;

      const candidates = [
        maybeHalf() && 'half',
        'double',
        maybeMove() && 'move',
        'reverse'
      ].filter(Boolean);

      const op = candidates[Math.floor(Math.random() * candidates.length)];
      applyOp(op);
      subOps.push(op);
    }
    return subOps;
  };

  const clock = new GibClock(100);
  let iterations = 0;

  const step = () => {
    if (performance.now() - start >= durationMs || iterations > 1000) {
      setTimeout(() => clock.stop(), 0);
      return;
    }

    iterations++;
    const op = pickOp();
    const subOps = applyOp(op);
    onUpdate(buffer, loop, op, subOps);

    clock.intervalMs = 100 + Math.random() * 100;
  };

  clock.onTick(step);
  clock.start();

  return () => clock.stop();
}
