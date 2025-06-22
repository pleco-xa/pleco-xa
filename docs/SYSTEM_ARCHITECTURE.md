# System Architecture Overview

## Overview

This document provides a comprehensive overview of the Pleco-XA audio analysis system architecture, detailing the relationship between components, data flow, and technology stack decisions made during development.

## High-Level Architecture

### Technology Stack

**Frontend Framework:** Astro (Static Site Generation + Client-side JavaScript)
**Audio Processing:** Web Audio API (Native Browser)
**Visualization:** HTML5 Canvas 2D Context
**Language:** JavaScript ES6+ (No TypeScript compilation in main flow)
**Deployment:** Static hosting compatible

### Core System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Pleco-XA Architecture                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   User Interface │  │  Audio Engine   │  │ Visualization│ │
│  │                 │  │                 │  │              │ │
│  │ • Button Actions│  │ • Web Audio API │  │ • Canvas 2D  │ │
│  │ • Toast Messages│  │ • Buffer Manip  │  │ • Waveforms  │ │
│  │ • Event Handling│  │ • Real-time Play│  │ • Playhead   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
│           │                     │                    │       │
│           └─────────────────────┼────────────────────┘       │
│                                 │                            │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Core Processing Layer                      │ │
│  │                                                         │ │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │ │
│  │ │Loop Helpers │ │Loop Analysis│ │  Spectral Analysis  │ │ │
│  │ │             │ │             │ │                     │ │ │
│  │ │• Basic Ops  │ │• Recurrence │ │ • FFT/Chroma       │ │ │
│  │ │• Boundaries │ │• Detection  │ │ • Feature Extract  │ │ │
│  │ │• Audio Manip│ │• Confidence │ │ • Pattern Matching │ │ │
│  │ └─────────────┘ └─────────────┘ └─────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. User Interface Layer

#### Astro Components Structure

```
src/components/
├── AudioAnalyzer.astro          # Main audio interface
├── WaveformEditor.astro         # Waveform visualization
├── RandomizerButton.astro       # Smart random controls
├── GlitchBurstButton.astro     # Glitch effects
└── SignatureDemoButton.astro    # Demo sequences
```

**Component Responsibilities:**
- **AudioAnalyzer.astro:** Central hub with all audio controls and processing
- **WaveformEditor.astro:** Canvas-based waveform display and interaction
- **Button Components:** Specialized controls for specific audio operations

#### Client-Side Integration Pattern

```javascript
// Astro Component Pattern
---
// Server-side (build time) - imports for SSG
---

<div class="component">
  <!-- Static HTML structure -->
</div>

<script>
  // Client-side (runtime) - dynamic imports for browser
  import('../scripts/audio-core.js').then(module => {
    window.audioFunctions = module;
  });
</script>
```

### 2. Audio Processing Engine

#### Web Audio API Integration

**Core Audio System:** `src/scripts/xa-audio-core.js`

```javascript
// Audio Context Management
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let globalAudioBuffer = null;
let currentSource = null;
let isPlaying = false;

// Playback Control
function playAudio() {
  currentSource = audioContext.createBufferSource();
  currentSource.buffer = globalAudioBuffer;
  currentSource.loop = true; // Key fix for continuous playback
  currentSource.loopStart = currentLoop.start;
  currentSource.loopEnd = currentLoop.end;
  currentSource.connect(audioContext.destination);
  currentSource.start();
}
```

#### Buffer Manipulation Architecture

**Direct Sample Access Pattern:**
```javascript
// Float32Array manipulation for real-time processing
function processAudioBuffer(audioBuffer, processingFunction) {
  const channelData = audioBuffer.getChannelData(0);
  
  // Direct array manipulation for performance
  for (let i = 0; i < channelData.length; i++) {
    channelData[i] = processingFunction(channelData[i], i);
  }
}
```

### 3. Core Processing Modules

#### Module Organization

```
src/core/
├── index.js               # Main exports and coordination
├── loopHelpers.js         # Basic loop operations
├── loopPlayground.js      # Advanced manipulation
├── beatGlitcher.js        # Beat-synchronized effects
└── demoSequences.js       # Preset demonstrations

src/scripts/
├── xa-audio-core.js       # Core audio engine
├── xa-loop-detection.js   # Loop detection algorithms
├── xa-spectral.js         # Spectral feature extraction
├── xa-fft.js              # FFT implementation
└── xa-recurrence.js       # Recurrence matrix analysis
```

#### Processing Pipeline Architecture

```javascript
// Typical Audio Processing Flow
async function processAudioOperation(operation, parameters) {
  // 1. Validate input
  if (!globalAudioBuffer) throw new Error('No audio loaded');
  
  // 2. Apply processing
  const result = await operation(globalAudioBuffer, parameters);
  
  // 3. Update state
  updateAudioState(result);
  
  // 4. Update UI
  applyLoop(result);
  
  // 5. Provide feedback
  showToast(`${operation.name} completed`, 'success');
  
  // 6. Restart audio if needed
  if (isPlaying) restartAudioWithNewLoop();
}
```

### 4. State Management System

#### Global State Architecture

**Centralized State Variables:**
```javascript
// Global Audio State
let globalAudioBuffer = null;        // Main audio data
let currentLoop = { start: 0, end: 0 }; // Loop boundaries
let isPlaying = false;               // Playback state
let currentSource = null;            // Web Audio source

// Advanced Feature States
let nudgeState = 'first';            // Nudge system state
let nudgeEnabled = false;            // Nudge mode toggle
let currentNudgeLoop = null;         // Nudge-specific loop data
let nudgeReverseState = false;       // Reverse processing state
```

#### State Synchronization Pattern

**applyLoop() - Central State Coordinator:**
```javascript
// src/scripts/ui/applyLoop.js
export function applyLoop(loopData) {
  // Update global state
  currentLoop = { ...loopData };
  
  // Synchronize audio system
  if (currentSource) {
    currentSource.loopStart = loopData.start;
    currentSource.loopEnd = loopData.end;
  }
  
  // Update visualization
  updateWaveformDisplay();
  updateLoopBoundaries(loopData);
  
  // Trigger canvas redraw
  requestCanvasRedraw();
}
```

### 5. Visualization System

#### Canvas Management Architecture

**Multi-Layer Rendering System:**
```javascript
// Layered Canvas Approach
class CanvasManager {
  constructor(canvas) {
    this.layers = {
      background: new BackgroundLayer(canvas),  // Static waveform
      loop: new LoopBoundaryLayer(canvas),      // Loop markers
      playhead: new PlayheadLayer(canvas),      // Real-time position
      interaction: new InteractionLayer(canvas) // Mouse handling
    };
  }
  
  render() {
    this.layers.background.render();
    this.layers.loop.render(currentLoop);
    this.layers.playhead.render(getCurrentPosition());
  }
}
```

#### Real-time Animation Pipeline

**60fps Animation Loop:**
```javascript
class PlayheadAnimator {
  constructor() {
    this.isAnimating = false;
    this.lastFrameTime = 0;
  }
  
  start() {
    this.isAnimating = true;
    this.animate();
  }
  
  animate() {
    if (!this.isAnimating) return;
    
    // Calculate audio-synced position
    const audioPosition = this.calculateCurrentPosition();
    
    // Update visual elements
    this.updatePlayheadDisplay(audioPosition);
    
    // Schedule next frame
    requestAnimationFrame(() => this.animate());
  }
}
```

## Data Flow Architecture

### Audio Processing Data Flow

```
User Action → Button Handler → Core Function → Buffer Manipulation → State Update → UI Refresh
```

**Detailed Flow Example (Half-Speed Processing):**

1. **User Clicks:** "⏬ Half Speed" button
2. **Event Handler:** Button click triggers `halfSpeedQuantzLoop()`
3. **Processing:** Linear interpolation applied to audio buffer
4. **State Update:** `currentLoop` boundaries maintained
5. **UI Update:** `applyLoop()` called to synchronize visual state
6. **Audio Restart:** `restartAudioWithNewLoop()` for immediate playback
7. **User Feedback:** Toast notification confirms operation

### Loop Detection Data Flow

```
Audio Buffer → FFT Analysis → Chroma Extraction → Recurrence Matrix → Loop Boundaries → UI Update
```

**Spectral Analysis Pipeline:**

1. **Input:** Raw audio buffer (Float32Array)
2. **Windowing:** Apply Hann window to audio frames
3. **FFT:** Convert time domain to frequency domain
4. **Chroma:** Map frequencies to 12-bin harmonic representation
5. **Embedding:** Create time-delay embedded feature vectors
6. **Recurrence:** Compute similarity matrix between time points
7. **Detection:** Find diagonal patterns indicating repetition
8. **Output:** Loop boundaries with confidence score

## Integration Patterns

### Astro-Specific Architecture Decisions

#### Build-Time vs Runtime Split

**Build-Time (Server-Side):**
- Component structure and static HTML
- Import organization and module setup
- Static asset preparation

**Runtime (Client-Side):**
- Dynamic module imports for browser compatibility
- Audio processing and Web Audio API interaction
- Real-time user interaction handling

```javascript
// Build-time pattern
---
// Static imports for SSG
import { someUtility } from '../utils/helper.js';
---

// Runtime pattern
<script>
  // Dynamic imports for browser
  import('../scripts/audio-core.js').then(module => {
    // Browser-specific functionality
  });
</script>
```

#### Module Import Strategy

**Problem Solved:** Astro server-side rendering vs browser module access

**Solution:** Selective dynamic importing
```javascript
// OLD (Problematic)
import { audioFunction } from '../core/audio.js'; // Server-side only

// NEW (Working)
<script>
import('../core/audio.js').then(module => {
  window.audioFunction = module.audioFunction; // Browser accessible
});
</script>
```

### Error Handling Architecture

#### Graceful Degradation Strategy

```javascript
// Robust function wrapper pattern
function safeAudioOperation(operation) {
  return async function(...args) {
    try {
      // Validate preconditions
      if (!globalAudioBuffer) {
        throw new Error('No audio loaded');
      }
      
      // Execute operation
      const result = await operation(...args);
      
      // Provide success feedback
      showToast(`${operation.name} completed`, 'success');
      
      return result;
      
    } catch (error) {
      // Log for debugging
      console.error(`${operation.name} failed:`, error);
      
      // User-friendly feedback
      showToast(`${operation.name} failed: ${error.message}`, 'error');
      
      // Cleanup partial state
      cleanupPartialState();
      
      return null;
    }
  };
}
```

#### Audio Context Error Handling

```javascript
// Browser compatibility and user activation
async function initializeAudioContext() {
  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  } catch (error) {
    showToast('Audio initialization failed. Please interact with the page first.', 'warning');
  }
}
```

## Performance Optimization Strategies

### Memory Management

**Buffer Reuse Pattern:**
```javascript
// Avoid unnecessary allocation
function processAudioInPlace(audioBuffer, processor) {
  const channelData = audioBuffer.getChannelData(0); // Reuse existing buffer
  
  for (let i = 0; i < channelData.length; i++) {
    channelData[i] = processor(channelData[i], i); // In-place modification
  }
}
```

### Canvas Optimization

**Selective Redraw Strategy:**
```javascript
// Only redraw changed regions
class OptimizedCanvasRenderer {
  markDirty(region) {
    this.dirtyRegions.push(region);
  }
  
  render() {
    this.dirtyRegions.forEach(region => {
      this.renderRegion(region); // Selective redraw
    });
    this.dirtyRegions = [];
  }
}
```

### Computational Efficiency

**Linear Interpolation Optimization:**
```javascript
// Efficient time-stretching without complex algorithms
function efficientTimeStretch(sourceData, targetData, stretchFactor) {
  for (let i = 0; i < targetData.length; i++) {
    const sourcePos = i * stretchFactor;
    const floorPos = Math.floor(sourcePos);
    const fraction = sourcePos - floorPos;
    
    // Simple linear interpolation - fast and effective
    const sample1 = sourceData[floorPos] || 0;
    const sample2 = sourceData[floorPos + 1] || 0;
    targetData[i] = sample1 + (sample2 - sample1) * fraction;
  }
}
```

## Security and Compatibility

### Browser Compatibility Strategy

**Web Audio API Support:**
- Modern browsers: Full feature support
- Fallback detection for unsupported browsers
- Graceful degradation of advanced features

**Cross-Platform Considerations:**
- Desktop: Optimal performance with hardware acceleration
- Mobile: Reduced complexity for resource constraints
- Touch interaction: Responsive design for mobile interfaces

### Security Considerations

**Audio Data Privacy:**
- Local processing only - no server uploads
- No persistent storage of audio data
- User-initiated audio loading and processing

**Client-Side Security:**
- Input validation for all audio operations
- Bounds checking for buffer operations
- Error handling prevents system crashes

## Future Architecture Considerations

### Scalability Enhancements

**Web Workers Integration:**
```javascript
// Offload heavy processing to background threads
const audioWorker = new Worker('/workers/audio-processor.js');

audioWorker.postMessage({
  command: 'processAudio',
  audioData: channelData,
  parameters: processingParams
});
```

**WebAssembly Integration:**
```javascript
// High-performance audio algorithms
const wasmModule = await import('/wasm/audio-processors.wasm');
const processedAudio = wasmModule.advancedTimeStretch(audioData, parameters);
```

### Advanced Features Architecture

**Real-time Analysis:**
- Streaming audio input support
- Live loop detection during recording
- Real-time spectral visualization

**Machine Learning Integration:**
- Neural network-based loop detection
- Genre-specific processing algorithms
- Intelligent parameter suggestion

---

*Last Updated: January 2025*
*Architecture: Event-Driven, Component-Based, Web Audio API Centric*