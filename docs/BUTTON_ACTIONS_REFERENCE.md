# Button Actions Reference Guide

## Overview

This document provides a comprehensive reference for all button actions in the Pleco-XA audio analysis application, including their implementations, file locations, and underlying technologies.

## Core Audio Control Buttons

### Play Button (`▶️`)
**Location:** `src/components/AudioAnalyzer.astro`
**Implementation:** Web Audio API
**Function:** `playAudio()`

```javascript
function playAudio() {
  if (!globalAudioBuffer) return;
  
  currentSource = audioContext.createBufferSource();
  currentSource.buffer = globalAudioBuffer;
  currentSource.loop = true; // Fixed playhead looping issue
  currentSource.connect(audioContext.destination);
  currentSource.start();
  
  isPlaying = true;
  startTime = audioContext.currentTime;
}
```

**Key Features:**
- Creates new BufferSource for each playback
- Enables looping for continuous playback
- Tracks playback state and timing

### Stop Button (`⏹️`)
**Location:** `src/components/AudioAnalyzer.astro`
**Implementation:** Web Audio API
**Function:** `stopAudio()`

```javascript
function stopAudio() {
  if (currentSource) {
    currentSource.stop();
    currentSource = null;
  }
  isPlaying = false;
}
```

## Loop Manipulation Buttons

### Detect Loop Button (`🔍 Detect Loop`)
**Location:** `src/components/AudioAnalyzer.astro`
**Implementation:** Spectral Analysis + Recurrence Matrix
**Files Used:**
- `src/scripts/xa-recurrence.js` - Core loop detection
- `src/scripts/xa-fft.js` - FFT analysis
- `src/scripts/xa-spectral.js` - Spectral features

**Algorithm:**
1. **Chroma Extraction:** Convert audio to 12-bin harmonic features
2. **Recurrence Matrix:** Find when harmonic patterns repeat
3. **Loop Detection:** Identify strongest recurring sections

### Half Loop Button (`✂️ Half Loop`)
**Location:** `src/core/loopHelpers.js`
**Implementation:** Web Audio API Buffer Manipulation

```javascript
export function halfLoop() {
  if (!currentLoop) return;
  
  const duration = currentLoop.end - currentLoop.start;
  currentLoop.end = currentLoop.start + duration / 2;
  
  applyLoop(currentLoop);
  showToast('Half loop applied', 'success');
}
```

### Double Loop Button (`📈 Double Loop`)
**Location:** `src/core/loopHelpers.js`
**Implementation:** Web Audio API Buffer Manipulation

```javascript
export function doubleLoop() {
  if (!currentLoop || !globalAudioBuffer) return;
  
  const duration = currentLoop.end - currentLoop.start;
  const maxEnd = globalAudioBuffer.duration;
  
  currentLoop.end = Math.min(currentLoop.start + duration * 2, maxEnd);
  
  applyLoop(currentLoop);
  showToast('Double loop applied', 'success');
}
```

### Move Forward Button (`➡️ Move Forward`)
**Location:** `src/core/loopPlayground.js`
**Implementation:** Duration-based movement (Fixed from random jumps)

```javascript
export function moveForward() {
  if (!currentLoop || !globalAudioBuffer) return;
  
  const duration = currentLoop.end - currentLoop.start;
  const step = duration * 0.25; // Move by 25% of loop duration
  const maxStart = globalAudioBuffer.duration - duration;
  
  if (currentLoop.start + step <= maxStart) {
    currentLoop.start += step;
    currentLoop.end += step;
    
    applyLoop(currentLoop);
    showToast('Loop moved forward', 'info');
  }
}
```

**Bug Fix:** Originally used random jumps, now uses predictable duration-based steps.

## Advanced Audio Processing Buttons

### Half Speed Button (`⏬ Half Speed`)
**Location:** `src/components/AudioAnalyzer.astro`
**Implementation:** Linear Interpolation Time-Stretching
**Technology:** Web Audio API Float32Array manipulation

```javascript
function halfSpeedQuantzLoop(audioBuffer, loopData) {
  const sourceData = audioBuffer.getChannelData(0);
  const targetData = audioBuffer.getChannelData(0);
  
  for (let i = 0; i < loopLength; i++) {
    const stretchedInputPos = i * 0.5; // Half speed
    
    // Linear interpolation for smooth time-stretching
    const floorPos = Math.floor(stretchedInputPos);
    const ceilPos = Math.ceil(stretchedInputPos);
    const fraction = stretchedInputPos - floorPos;
    
    const sample1 = sourceData[loopStart + floorPos] || 0;
    const sample2 = sourceData[loopStart + ceilPos] || 0;
    targetData[loopStart + i] = sample1 + (sample2 - sample1) * fraction;
  }
}
```

### Nudge Button (`↔️ Nudge`)
**Location:** `src/components/AudioAnalyzer.astro`
**Implementation:** Sophisticated State Management System
**Technology:** Web Audio API + Custom State Tracking

**State Variables:**
```javascript
let nudgeState = 'first';        // 'first' | 'second' 
let nudgeEnabled = false;        // Boolean toggle
let currentNudgeLoop = null;     // Loop data storage
let nudgeReverseState = false;   // Reverse processing state
```

**Three-State Toggle Logic:**
1. **First Half:** Shows first 50% of loop
2. **Second Half:** Shows second 50% of loop  
3. **Full Loop:** Returns to complete loop

### Reverse Button (`🔄 Reverse`)
**Location:** `src/core/loopHelpers.js`
**Implementation:** Array Reversal with Nudge Compatibility

```javascript
export function reverseBufferSection(audioBuffer, startTime, endTime) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  
  // Reverse the array section in-place
  for (let i = startSample, j = endSample - 1; i < j; i++, j--) {
    const temp = channelData[i];
    channelData[i] = channelData[j];
    channelData[j] = temp;
  }
}
```

## Randomizer Buttons

### Smart Random Button (`🎲 Smart Random`)
**Location:** `src/components/RandomizerButton.astro`
**Implementation:** `src/core/loopPlayground.js`
**Function:** `randomSequence()`

**Algorithm:**
- Anti-clustering logic prevents right-side bunching
- Duration-based movement steps
- Maintains musical timing relationships

### Glitch Burst Button (`⚡ Glitch Burst`)
**Location:** `src/components/GlitchBurstButton.astro`
**Implementation:** `src/core/loopPlayground.js`
**Function:** `glitchBurst()`

**Features:**
- Beat-synchronized glitch effects
- Rhythmic pattern preservation
- Creative audio manipulation

### Signature Demo Button (`🚀 Signature Demo`)
**Location:** `src/components/SignatureDemoButton.astro`
**Implementation:** `src/core/demoSequences.js`

**Bug Fix:** Changed from server-side to client-side execution:
```javascript
// OLD (Server-side - didn't work)
<script>
import { runSignatureDemo } from '../core/demoSequences.js';
</script>

// NEW (Client-side - works)
<script>
import('../core/demoSequences.js').then(module => {
  window.runSignatureDemo = module.runSignatureDemo;
});
</script>
```

## Reset and Control Buttons

### Reset Playhead (`⏮️ Reset Playhead`)
**Location:** `src/components/AudioAnalyzer.astro`
**Implementation:** Audio restart with position reset

```javascript
function resetPlayhead() {
  stopAudio();
  setTimeout(() => playAudio(), 50);
  showToast('Playhead reset', 'info');
}
```

### Reset Loop (`🔄 Reset Loop`)
**Location:** `src/core/loopHelpers.js`
**Implementation:** Loop boundary reset

```javascript
export function resetLoop() {
  if (!globalAudioBuffer) return;
  
  currentLoop = {
    start: 0,
    end: globalAudioBuffer.duration
  };
  
  applyLoop(currentLoop);
  showToast('Loop reset to full audio', 'info');
}
```

## UI Integration System

### Toast Notification System
**Location:** `src/scripts/ui/toastQueue.js`
**Purpose:** Non-blocking user feedback

**Features:**
- Queued message display
- Automatic timeout (2-3 seconds)
- Multiple message types (success, info, warning, error)
- No interface blocking

**Usage:**
```javascript
showToast('Operation completed', 'success');
showToast('Loop detected!', 'info');
showToast('Processing...', 'warning');
```

### Loop Application System
**Location:** `src/scripts/ui/applyLoop.js`
**Purpose:** Central hub for applying loop changes

**Responsibilities:**
- Update global loop state
- Trigger waveform redraw
- Update playhead boundaries
- Restart audio playback if needed

```javascript
export function applyLoop(loopData) {
  // Update global state
  currentLoop = { ...loopData };
  
  // Update UI components
  updateWaveformDisplay();
  updateLoopBoundaries();
  
  // Restart audio if playing
  if (isPlaying) {
    restartAudioWithNewLoop();
  }
}
```

## Technical Implementation Details

### Web Audio API Usage

**All button actions use Web Audio API exclusively - no WASM involved:**

1. **AudioBuffer Manipulation:**
   - Direct access via `getChannelData(0)`
   - Float32Array sample manipulation
   - In-place audio processing

2. **Real-time Processing:**
   - BufferSource creation and management
   - Audio context timing
   - Linear interpolation for quality

3. **Browser Integration:**
   - HTML5 Canvas for visualization
   - Event handling for user interaction
   - Asynchronous processing support

### File Architecture

**Component Files (Astro):**
- Button UI definitions and client-side scripts
- Event handlers and user interface logic

**Core Processing Files (JavaScript):**
- Pure audio processing functions
- Algorithm implementations
- State management utilities

**Integration Files:**
- UI update systems (`applyLoop.js`)
- Notification systems (`toastQueue.js`)
- Global state management

### Performance Characteristics

**Processing Speed:** < 50ms for typical operations
**Memory Usage:** In-place buffer modification minimizes allocation
**Browser Support:** All modern browsers with Web Audio API
**Real-time Capability:** Suitable for live audio manipulation

## Debugging and Development

### Common Bug Patterns Fixed

1. **Playhead Freezing:** Fixed by enabling `currentSource.loop = true`
2. **Random Movement:** Fixed by using duration-based steps instead of random jumps
3. **Nudge State Issues:** Fixed by proper state tracking and reset logic
4. **Client-side Access:** Fixed by proper module importing in Astro components

### Development Workflow

1. **Component Development:** Create .astro files for UI
2. **Logic Implementation:** Add processing functions to core modules
3. **Integration:** Connect via `applyLoop()` and toast systems
4. **Testing:** Use browser dev tools for audio debugging

---

*Last Updated: January 2025*
*Technology Stack: Web Audio API, JavaScript ES6+, Astro Framework*