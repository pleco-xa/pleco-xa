# Waveform Visualization System Documentation

## Overview

This document details the waveform rendering and playhead animation system in Pleco-XA, covering the visual representation of audio data, real-time playback indication, and interactive loop boundary editing.

## Core Visualization Components

### 1. Waveform Rendering System

**Primary File:** `src/scripts/WaveformRenderer.js`
**Technology:** HTML5 Canvas 2D Context
**Purpose:** Convert audio buffer data into visual waveform representation

#### Basic Waveform Rendering

```javascript
class WaveformRenderer {
  constructor(canvas, audioBuffer, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioBuffer = audioBuffer;
    
    this.options = {
      waveColor: '#00ff88',
      backgroundColor: '#1a1a1a',
      lineWidth: 1,
      amplitude: 1.0,
      ...options
    };
  }

  render() {
    const channelData = this.audioBuffer.getChannelData(0);
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Clear canvas
    this.ctx.fillStyle = this.options.backgroundColor;
    this.ctx.fillRect(0, 0, width, height);
    
    // Draw waveform
    this.ctx.strokeStyle = this.options.waveColor;
    this.ctx.lineWidth = this.options.lineWidth;
    this.ctx.beginPath();
    
    for (let x = 0; x < width; x++) {
      const sampleIndex = Math.floor((x / width) * channelData.length);
      const sample = channelData[sampleIndex] || 0;
      const y = (height / 2) + (sample * height / 2 * this.options.amplitude);
      
      if (x === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    
    this.ctx.stroke();
  }
}
```

#### Waveform Data Processing

**File:** `src/scripts/analysis/WaveformData.ts`
**Purpose:** Process raw audio buffer into drawable data points

```typescript
interface WaveformDataPoint {
  min: number;
  max: number;
  rms: number;
  peak: number;
}

class WaveformData {
  static generateWaveformData(
    audioBuffer: AudioBuffer, 
    resolution: number = 1000
  ): WaveformDataPoint[] {
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerPoint = Math.floor(channelData.length / resolution);
    const waveformData: WaveformDataPoint[] = [];
    
    for (let i = 0; i < resolution; i++) {
      const start = i * samplesPerPoint;
      const end = Math.min(start + samplesPerPoint, channelData.length);
      
      let min = Infinity;
      let max = -Infinity;
      let sumSquares = 0;
      
      for (let j = start; j < end; j++) {
        const sample = channelData[j];
        min = Math.min(min, sample);
        max = Math.max(max, sample);
        sumSquares += sample * sample;
      }
      
      const rms = Math.sqrt(sumSquares / (end - start));
      const peak = Math.max(Math.abs(min), Math.abs(max));
      
      waveformData.push({ min, max, rms, peak });
    }
    
    return waveformData;
  }
}
```

### 2. Playhead Animation System

**Primary File:** `src/scripts/LoopPlayer.js`
**Technology:** RequestAnimationFrame + Web Audio API timing
**Purpose:** Visual indication of current playback position

#### Playhead Position Calculation

```javascript
class LoopPlayer {
  constructor(canvas, audioContext) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioContext = audioContext;
    this.isAnimating = false;
    this.animationId = null;
  }

  startPlayheadAnimation() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.animatePlayhead();
  }

  animatePlayhead() {
    if (!this.isAnimating) return;
    
    // Calculate current position
    const currentTime = this.audioContext.currentTime;
    const elapsedTime = currentTime - startTime;
    const loopDuration = currentLoop.end - currentLoop.start;
    
    // Handle looping
    const positionInLoop = elapsedTime % loopDuration;
    const absolutePosition = currentLoop.start + positionInLoop;
    
    // Convert to pixel position
    const canvasPosition = (absolutePosition / globalAudioBuffer.duration) * this.canvas.width;
    
    // Draw playhead
    this.drawPlayhead(canvasPosition);
    
    // Schedule next frame
    this.animationId = requestAnimationFrame(() => this.animatePlayhead());
  }

  drawPlayhead(x) {
    // Clear previous playhead (redraw waveform section)
    this.redrawWaveformSection(x - 1, x + 1);
    
    // Draw new playhead line
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.stroke();
  }

  stopPlayheadAnimation() {
    this.isAnimating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}
```

#### Position Tracking Fix

**Issue:** Playhead was freezing after 1 second during loop playback
**Solution:** Enable proper looping in Web Audio API

```javascript
// BEFORE (Playhead froze)
currentSource = audioContext.createBufferSource();
currentSource.buffer = globalAudioBuffer;
// Missing: currentSource.loop = true;

// AFTER (Playhead continues)
currentSource = audioContext.createBufferSource();
currentSource.buffer = globalAudioBuffer;
currentSource.loop = true; // Fixed looping issue
currentSource.loopStart = currentLoop.start;
currentSource.loopEnd = currentLoop.end;
```

### 3. Loop Boundary Visualization

**Purpose:** Visual representation of loop start/end points with interactive editing
**Implementation:** Canvas overlay system

#### Loop Boundary Rendering

```javascript
class LoopBoundaryRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  drawLoopBoundaries(loopStart, loopEnd, audioDuration) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    // Convert time to pixel positions
    const startX = (loopStart / audioDuration) * width;
    const endX = (loopEnd / audioDuration) * width;
    
    // Draw loop region background
    this.ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
    this.ctx.fillRect(startX, 0, endX - startX, height);
    
    // Draw start boundary
    this.ctx.strokeStyle = '#00ff88';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(startX, 0);
    this.ctx.lineTo(startX, height);
    this.ctx.stroke();
    
    // Draw end boundary
    this.ctx.beginPath();
    this.ctx.moveTo(endX, 0);
    this.ctx.lineTo(endX, height);
    this.ctx.stroke();
    
    // Draw boundary labels
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '12px Arial';
    this.ctx.fillText('START', startX + 5, 15);
    this.ctx.fillText('END', endX - 35, 15);
  }
}
```

### 4. Interactive Waveform Editor

**Primary File:** `src/scripts/WaveformEditor.js`
**Purpose:** Click and drag interaction for loop boundary editing

#### Mouse Interaction Handling

```javascript
class WaveformEditor {
  constructor(canvas, audioBuffer) {
    this.canvas = canvas;
    this.audioBuffer = audioBuffer;
    this.isDragging = false;
    this.dragTarget = null; // 'start', 'end', or null
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }

  handleMouseDown(event) {
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const timePosition = (x / this.canvas.width) * this.audioBuffer.duration;
    
    // Determine if clicking near start or end boundary
    const startTime = currentLoop.start;
    const endTime = currentLoop.end;
    const startX = (startTime / this.audioBuffer.duration) * this.canvas.width;
    const endX = (endTime / this.audioBuffer.duration) * this.canvas.width;
    
    const threshold = 10; // pixels
    
    if (Math.abs(x - startX) < threshold) {
      this.dragTarget = 'start';
      this.isDragging = true;
    } else if (Math.abs(x - endX) < threshold) {
      this.dragTarget = 'end';
      this.isDragging = true;
    }
  }

  handleMouseMove(event) {
    if (!this.isDragging) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const timePosition = (x / this.canvas.width) * this.audioBuffer.duration;
    
    // Update loop boundary
    if (this.dragTarget === 'start') {
      currentLoop.start = Math.max(0, Math.min(timePosition, currentLoop.end - 0.1));
    } else if (this.dragTarget === 'end') {
      currentLoop.end = Math.min(this.audioBuffer.duration, 
                                Math.max(timePosition, currentLoop.start + 0.1));
    }
    
    // Update visual representation
    this.redrawCanvas();
    applyLoop(currentLoop);
  }

  handleMouseUp(event) {
    this.isDragging = false;
    this.dragTarget = null;
  }
}
```

### 5. Spectrum Analyzer Visualization (Available but Unused)

**File:** `src/scripts/SpectrumAnalyzer.js`
**Status:** Implemented but not integrated into UI
**Capability:** Real-time frequency spectrum visualization

#### Available Spectrum Features

```javascript
class RealtimeSpectrumAnalyzer {
  constructor(canvas, audioContext, options = {}) {
    // Full FFT-based spectrum analysis
    // Multiple visualization styles: bars, lines, filled
    // Logarithmic frequency scaling
    // Real-time animation with 60fps capability
  }

  // Available but unused visualization styles:
  renderBars()        // Frequency bars visualization
  renderLine()        // Line-based spectrum
  renderFilled()      // Filled area spectrum
  renderSpectrogram() // Time-frequency spectrogram
}
```

## Canvas Management System

### Multi-layer Canvas Architecture

**Layer Structure:**
1. **Background Layer:** Static waveform rendering
2. **Loop Layer:** Loop boundary visualization
3. **Playhead Layer:** Real-time position indicator
4. **Interaction Layer:** Mouse event handling

### Canvas Optimization Strategies

#### Selective Redrawing

```javascript
class CanvasManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dirtyRegions = [];
  }

  markRegionDirty(x, y, width, height) {
    this.dirtyRegions.push({ x, y, width, height });
  }

  optimizedRedraw() {
    // Only redraw dirty regions instead of full canvas
    this.dirtyRegions.forEach(region => {
      this.ctx.clearRect(region.x, region.y, region.width, region.height);
      this.redrawRegion(region);
    });
    
    this.dirtyRegions = [];
  }
}
```

#### Performance Optimizations

**Techniques Used:**
- **RequestAnimationFrame:** Smooth 60fps animation
- **Dirty Region Tracking:** Minimal canvas redraws
- **Efficient Sample Access:** Optimized buffer reading
- **Canvas Size Management:** Responsive to container dimensions

## Integration with Audio System

### Synchronization with Web Audio API

**Timing Source:** `AudioContext.currentTime`
**Update Frequency:** 60fps via requestAnimationFrame
**Latency Compensation:** Sub-frame timing accuracy

```javascript
function synchronizeVisualsWithAudio() {
  // Get precise audio timing
  const audioTime = audioContext.currentTime;
  const startOffset = audioTime - startTime;
  
  // Calculate visual position
  const loopDuration = currentLoop.end - currentLoop.start;
  const loopPosition = startOffset % loopDuration;
  const visualPosition = (loopPosition / loopDuration) * canvasWidth;
  
  // Update visuals with audio-synced timing
  updatePlayheadPosition(visualPosition);
}
```

### State Management Integration

**File:** `src/scripts/ui/applyLoop.js`
**Purpose:** Central coordination between audio and visual systems

```javascript
export function applyLoop(loopData) {
  // Update audio system
  updateAudioLoop(loopData);
  
  // Update visual system
  updateWaveformDisplay();
  updateLoopBoundaries(loopData);
  updatePlayheadBounds(loopData);
  
  // Trigger canvas redraw
  requestCanvasRedraw();
}
```

## Component Integration

### Astro Component Structure

**Main Component:** `src/components/AudioAnalyzer.astro`
**Waveform Component:** `src/components/WaveformEditor.astro`

```astro
---
// Server-side (build time)
import WaveformEditor from './WaveformEditor.astro';
---

<div class="audio-analyzer">
  <WaveformEditor />
  <div class="controls">
    <!-- Audio control buttons -->
  </div>
</div>

<script>
  // Client-side (runtime)
  import('../scripts/WaveformRenderer.js').then(module => {
    window.WaveformRenderer = module.WaveformRenderer;
  });
  
  import('../scripts/LoopPlayer.js').then(module => {
    window.LoopPlayer = module.LoopPlayer;
  });
</script>
```

### Event System Integration

**Event Flow:**
1. User interaction (click, drag)
2. Canvas event handlers
3. Audio system updates
4. Visual system updates
5. Toast notifications

## Browser Compatibility

### Supported Technologies

**Canvas 2D:** All modern browsers
**Web Audio API:** Chrome, Firefox, Safari, Edge
**RequestAnimationFrame:** Universal support
**Mouse Events:** Universal support

### Performance Considerations

**Desktop Browsers:** Optimal performance with hardware acceleration
**Mobile Browsers:** Reduced animation complexity for better performance
**Memory Usage:** Efficient canvas management prevents memory leaks

## Debugging and Development Tools

### Visual Debugging Features

```javascript
// Debug mode rendering
const DEBUG_MODE = true;

if (DEBUG_MODE) {
  // Show timing information
  drawTimingInfo(ctx, audioTime, loopPosition);
  
  // Show sample indices
  drawSampleIndices(ctx, channelData);
  
  // Show performance metrics
  drawPerformanceMetrics(ctx, frameRate, renderTime);
}
```

### Development Workflow

1. **Canvas Setup:** Initialize rendering context
2. **Audio Loading:** Process buffer data for visualization
3. **Event Binding:** Set up mouse interaction handlers
4. **Animation Start:** Begin playhead animation loop
5. **Integration Testing:** Verify audio-visual synchronization

---

*Last Updated: January 2025*
*Technology Stack: HTML5 Canvas, Web Audio API, JavaScript ES6+, RequestAnimationFrame*