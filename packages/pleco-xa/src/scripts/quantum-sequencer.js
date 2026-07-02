// Quantum vector-based sequencer
import { detectLoop } from '../core/index.js';
import { applyQuantumOp } from './audio-ops-extended.js';
import { quantumRhythm } from '../core/vector-rhythm.js';
import { allPresets, randomPreset } from './beat-presets.js';

/* returns full op-array ready for playback */
export function buildQuantumOpList(steps = 128, injections = 4) {
  // 1. raw seed - basic operations
  const seed = Array.from({ length: steps }, () =>
    ['half','double','move','reverse'][Math.random()*4|0]
  );

  // 2. quantum warp - transform through vector space
  let ops = quantumRhythm(seed, 5);

  // 3. inject accent bars at random positions
  for (let i = 0; i < injections; i++) {
    const bar = randomPreset();
    const where = Math.floor(Math.random() * (ops.length - bar.length));
    ops.splice(where, bar.length, ...bar);
  }
  
  return ops;
}

/* Build executable sequence from operation list */
export function buildQuantumSequence(buffer, opList) {
  let loop = detectLoop(buffer);
  const sequence = [];
  
  for (let i = 0; i < opList.length; i++) {
    const op = opList[i];
    
    const fn = () => {
      const result = applyQuantumOp(op, buffer, loop);
      buffer = result.buffer;
      loop = result.loop;
      
      return {
        buffer: result.buffer,
        loop: result.loop,
        op: `quantum-${op}-${i+1}`
      };
    };
    fn.op = op;
    sequence.push(fn);
  }
  
  return sequence;
}

/* poor-man's scheduler with quantum timing */
export async function playQuantumOps(buffer, ctx, applyLoop, beatMs = 160) {
  let loop = detectLoop(buffer);
  const ops = buildQuantumOpList(128, 4); // 128 steps, 4 preset injections
  console.log('🌌 Quantum sequence:', ops.join(' '));

  // Track quantum state for dynamic timing
  let quantumPhase = 0;
  let complexity = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    ({ buffer, loop } = applyQuantumOp(op, buffer, loop));
    applyLoop(buffer, loop, op);
    
    // Quantum timing based on operation complexity and phase
    quantumPhase += 0.1;
    
    let timing = beatMs;
    
    // Adjust timing based on operation type
    if (op === 'stutter') timing *= 0.5; // Stutters are fast
    if (op === 'fractal') timing *= 1.5; // Fractals need time to develop
    if (op === 'silence') timing *= 0.3; // Quick silence
    if (op === 'phase') timing *= 0.8;   // Phase shifts are snappy
    
    // Add quantum oscillation to timing
    const quantumMod = 1 + (Math.sin(quantumPhase) * 0.3);
    timing *= quantumMod;
    
    // Complexity tracking for adaptive behavior
    if (['stutter', 'fractal', 'phase'].includes(op)) {
      complexity++;
    } else if (op === 'silence') {
      complexity = Math.max(0, complexity - 1);
    }
    
    // When complexity gets high, occasionally add breathing space
    if (complexity > 5 && Math.random() < 0.3) {
      timing *= 2;
      complexity = 0;
    }
    
    // Anti-micro-stutter protection - more aggressive for quantum
    const minTiming = 100; // Higher minimum for quantum operations
    const maxQuantumSequence = 3; // Lower tolerance 
    if (timing < minTiming) {
      const quantumCount = (window.quantumSequenceCount || 0) + 1;
      window.quantumSequenceCount = quantumCount;
      
      if (quantumCount > maxQuantumSequence) {
        timing = beatMs * 2; // Longer quantum breathing space
        window.quantumSequenceCount = 0;
        console.log('🌌 Quantum field stabilized - breaking micro-loop');
      }
    } else {
      window.quantumSequenceCount = 0;
    }
    
    // Additional quantum safety - absolute minimum
    timing = Math.max(timing, 90);
    
    await new Promise(r => setTimeout(r, Math.abs(timing)));
  }
}