// Enhanced algorithmic sequence operations
//
// Loop-bounds invariant (tier-2 proof-of-work repair, 2026-07-02): every op
// preserves 0 <= startSample < endSample <= buffer.length. The legacy
// versions wrapped 'move'/'phase' with independent modulos (full-width loops
// mapped to {0,0}, wrapped loops could get end < start) and let repeated
// half/fractal/stutter collapse to zero width. Repairs: clamped no-wrap
// move, circular fixed-width phase shift, and a minimum-width floor —
// shrinks that would produce a loop narrower than 1 sample are refused
// (the loop is returned unchanged) instead of emitting a degenerate state.
// Acceptance harness: examples/node/algorithmic-sequences.mjs (0/800 fuzz).
import { detectLoop, halfLoop, doubleLoop, moveForward, reverseBufferSection, resetLoop } from '../core/index.js';

// Enhanced operations with musical parameters
export function stutterLoop(loop, buffer, repeats = 4) {
    const originalLength = loop.endSample - loop.startSample;
    const stutterLength = Math.floor(originalLength / repeats);
    if (stutterLength < 1) {
        // Minimum-width floor: refuse shrinks that would collapse the loop
        return { ...loop, op: `stutter${repeats}` };
    }
    return {
        startSample: loop.startSample,
        endSample: loop.startSample + stutterLength,
        op: `stutter${repeats}`
    };
}

export function fractalSlice(loop, depth = 3) {
    let currentLoop = {...loop};
    for (let i = 0; i < depth; i++) {
        // Minimum-width floor: halving below 2 samples would hit zero width
        if (currentLoop.endSample - currentLoop.startSample < 2) break;
        currentLoop = halfLoop(currentLoop);
    }
    return {
        ...currentLoop,
        op: `fractal${depth}`
    };
}

export function phaseShift(loop, buffer, amount = 0.5) {
    const length = loop.endSample - loop.startSample;
    const shift = Math.floor(length * amount);
    // Circular displacement of the FIXED-WIDTH window: startSample wraps
    // within [0, buffer.length - length] so the loop never straddles the
    // buffer end (the old independent modulo on start/end could wrap end
    // below start, or map a full-width loop to {0,0}).
    const span = buffer.length - length;
    const startSample = span > 0 ? (loop.startSample + shift) % (span + 1) : 0;
    return {
        startSample,
        endSample: startSample + length,
        op: `phase${amount}`
    };
}

// Algorithmic sequence generators
export function generateFibonacci(steps) {
    const fib = [1, 1, 2, 3, 5, 8, 13];
    const operations = [];
    
    for (let i = 0; i < steps; i++) {
        const fibIndex = i % fib.length;
        const pattern = [
            ...Array(fib[fibIndex]).fill('half'),
            'double',
            'reverse',
            ...Array(fib[fibIndex]).fill('move'),
            'stutter4'
        ];
        operations.push(...pattern);
    }
    return operations.slice(0, steps);
}

export function generatePrimeRhythm(steps) {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19];
    const operations = [];
    
    for (let i = 0; i < steps; i++) {
        if (primes.includes(i % 20)) {
            operations.push('fractal3', 'phase0.618');
        } else {
            const patterns = [
                ['double', 'reverse', 'move'],
                ['half', 'stutter4', 'phase0.25'],
                ['reset', 'fractal2', 'move']
            ];
            operations.push(...patterns[i % patterns.length]);
        }
    }
    return operations.slice(0, steps);
}

export function generateWaveform(steps) {
    const operations = [];
    const waveFunction = (step) => Math.sin(step * 0.2) * 2;
    
    for (let i = 0; i < steps; i++) {
        const waveValue = waveFunction(i);
        
        if (waveValue > 1.5) operations.push('double', 'reverse', 'phase0.9');
        else if (waveValue > 0.5) operations.push('half', 'stutter8', 'move');
        else if (waveValue > -0.5) operations.push('fractal4', 'reverse', 'phase0.1');
        else operations.push('reset', 'stutter16', 'move');
        
        // Add polyrhythmic elements
        if (i % 7 === 0) operations.push('half', 'reverse');
        if (i % 11 === 0) operations.push('double', 'phase0.333');
    }
    return operations.slice(0, steps);
}

export function generateChaotic(steps) {
    const operations = [];
    let x = 0.5;
    const r = 3.99; // Chaotic parameter
    
    for (let i = 0; i < steps; i++) {
        x = r * x * (1 - x); // Logistic map
        
        if (x < 0.2) operations.push('fractal5', 'reverse');
        else if (x < 0.4) operations.push('stutter32', 'phase0.75');
        else if (x < 0.6) operations.push('half', 'move');
        else if (x < 0.8) operations.push('double', 'reverse');
        else operations.push('reset', 'phase0.5');
        
        // Add transitional elements
        if (i % 5 === 0) operations.push('reverse', 'move');
        if (i % 9 === 0) operations.push('stutter16', 'fractal3');
    }
    return operations.slice(0, steps);
}

// Operation executor
export function executeOperation(action, buffer, loop) {
    let newBuffer = buffer;
    let newLoop = {...loop};
    
    switch(action) {
        case 'half':
            // Minimum-width floor: only halve when the result stays >= 1 sample
            if (newLoop.endSample - newLoop.startSample >= 2) {
                newLoop = halfLoop(newLoop);
            }
            break;
        case 'double':
            newLoop = doubleLoop(newLoop, buffer.length);
            break;
        case 'move': {
            // Clamped no-wrap move (core moveForward): advancing past the
            // buffer end parks the loop flush against it instead of wrapping
            const duration = newLoop.endSample - newLoop.startSample;
            newLoop = moveForward(newLoop, duration, buffer.length);
            break;
        }
        case 'reverse':
            newBuffer = reverseBufferSection(buffer, newLoop.startSample, newLoop.endSample);
            break;
        case 'reset':
            newLoop = resetLoop(newBuffer);
            break;
        case 'stutter4':
            newLoop = stutterLoop(newLoop, buffer, 4);
            break;
        case 'stutter8':
            newLoop = stutterLoop(newLoop, buffer, 8);
            break;
        case 'stutter16':
            newLoop = stutterLoop(newLoop, buffer, 16);
            break;
        case 'stutter32':
            newLoop = stutterLoop(newLoop, buffer, 32);
            break;
        case 'fractal2':
            newLoop = fractalSlice(newLoop, 2);
            break;
        case 'fractal3':
            newLoop = fractalSlice(newLoop, 3);
            break;
        case 'fractal4':
            newLoop = fractalSlice(newLoop, 4);
            break;
        case 'fractal5':
            newLoop = fractalSlice(newLoop, 5);
            break;
        case 'phase0.1':
            newLoop = phaseShift(newLoop, buffer, 0.1);
            break;
        case 'phase0.25':
            newLoop = phaseShift(newLoop, buffer, 0.25);
            break;
        case 'phase0.333':
            newLoop = phaseShift(newLoop, buffer, 1/3);
            break;
        case 'phase0.5':
            newLoop = phaseShift(newLoop, buffer, 0.5);
            break;
        case 'phase0.618':
            newLoop = phaseShift(newLoop, buffer, 0.618);
            break;
        case 'phase0.75':
            newLoop = phaseShift(newLoop, buffer, 0.75);
            break;
        case 'phase0.9':
            newLoop = phaseShift(newLoop, buffer, 0.9);
            break;
    }
    
    return { buffer: newBuffer, loop: newLoop };
}