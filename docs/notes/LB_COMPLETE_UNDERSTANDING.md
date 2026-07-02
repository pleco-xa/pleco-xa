# Complete Understanding of lb/index.html

## Overview
lb/index.html is a complete single-page BPM detection application that runs entirely in the browser. It's a self-contained HTML file with all JavaScript inline in a `<script type="module">` tag (lines 7-1349) and CSS styles (lines 1351-1550).

## Structure

### 1. HTML Structure (lines 1552-1577)
- Simple container with BPM display
- File input for audio
- Control buttons: Play, Stop, Analyze BPM, Click Track, Drum modes
- Log output area
- Waveform canvas with playhead
- Collapsible sections

### 2. Imports (line 8)
```javascript
import { BeatTracker, quickBeatTrack, BeatTrackingUI } from './xa-beat-tracker.js';
```
External modules for beat tracking and click track generation (NOT the BPM detection itself)

### 3. State Variables (lines 31-50)
- audioContext, audioBuffer - Web Audio API objects
- globalTempo = 120 - Stores detected BPM
- beatTimes - Array of beat positions
- Various UI state flags for click tracks and drum modes

## Main Flow of Execution

### File Loading (lines 66-114)
1. User selects audio file
2. Creates AudioContext (tries 48kHz first, falls back to system default)
3. Decodes audio data into AudioBuffer
4. Resets UI state
5. Enables Play and Analyze buttons

### When User Clicks "Analyze BPM" (lines 216-364)

This is the MAIN BPM detection flow:

1. **Extract audio data** (line 222-223):
   ```javascript
   const y = audioBuffer.getChannelData(0);
   const sr = audioBuffer.sampleRate;
   ```

2. **Determine analysis parameters** (lines 224-226):
   - Large files (>30s): windowSize=8s, hopSize=2s
   - Normal files: windowSize=4s, hopSize=1s

3. **Call main analysis** (line 235):
   ```javascript
   const result = await analyzeWithProgress(y, sr, windowSize, hopSize);
   ```

4. **Process results** (lines 239-298):
   - Extract all values from result object
   - Validate tempo is reasonable (30-300 BPM)
   - Calculate stability metrics
   - Compare methods (autocorrelation vs tempogram)
   - Log detailed analysis

5. **Beat tracking** (lines 300-313):
   - Uses external `tracker.beatTrack()` from imported module
   - Generates beat positions

6. **Click track generation** (lines 315-318):
   - Uses external `ui.generateClickTrack()` from imported module

7. **Update UI** (lines 337, 339-352):
   - Display BPM with confidence label
   - Show final result summary

### The Core BPM Algorithm (lines 917-1276)

#### `analyzeWithProgress()` (lines 917-981) - Main Orchestrator
Coordinates the entire analysis in 4 steps:

**Step 1: Compute Onset Strength** (line 921)
- Calls `computeOnsetStrength(y, sr)`
- Returns onset envelope array

**Step 2: Find Global Tempo** (line 925)
- Calls `estimateGlobalTempo(onsetEnvelope, sr)`
- Returns BPM, confidence, candidates

**Step 3: Compute Tempogram** (line 935)
- Calls `computeFourierTempogram(onsetEnvelope, sr)`
- Returns time-frequency analysis

**Step 4: Window-by-Window Stability** (lines 953-966)
- Loops through windows
- Calls `estimateConstrainedTempo()` for each
- Yields every 2 windows with `setTimeout(resolve, 10)`
- Logs progress for each window

Returns complete result object with all analysis data

#### `computeOnsetStrength()` (lines 983-1019)
- Frame size: 2048, hop: 512
- Applies Hann window to each frame
- Computes spectrum with `computeSimpleSpectrum()`
- Calculates spectral flux (positive differences)
- **YIELDS** every 200 frames: `await new Promise(resolve => setTimeout(resolve, 1))`

#### `estimateGlobalTempo()` (lines 1021-1081)
- Searches 70-180 BPM range
- Calculates autocorrelation for each lag
- **YIELDS** every 20 lags: `await new Promise(resolve => setTimeout(resolve, 1))`
- Finds best correlation score
- Calculates confidence based on peak prominence

#### `computeFourierTempogram()` (lines 1083-1125)
- Window length: 384, hop: 96
- Applies FFT to onset envelope windows
- **YIELDS** every 10% of frames: `await new Promise(resolve => setTimeout(resolve, 1))`
- Analyzes tempogram for peak tempos

#### `estimateConstrainedTempo()` (lines 1210-1262)
- Analyzes individual window
- Allows ±50 BPM from global tempo
- Quick energy-based onset detection
- Autocorrelation within constrained range
- NO yields (runs fast)

#### Helper Functions
- `computeSimpleSpectrum()` (1264-1276) - Decimated FFT (skips samples)
- `computeSimpleFFT()` (1134-1147) - Full FFT implementation
- `computeTempoFrequencies()` (1127-1132) - Convert bins to BPM
- `analyzeTempogram()` (1149-1208) - Find peaks in tempogram

### Live Playback Features (lines 116-191, 668-873)

When user clicks Play:
1. Creates audio source and starts playback
2. Calls `setupLiveAnalysis()` (line 132) - prepares for live tracking
3. If no analysis done, triggers it in background (line 139)
4. Starts `startLiveBpmTracking()` (line 186)

Live BPM tracking:
- Runs every 500ms (line 732)
- Analyzes 2-second windows every 1.5s
- Uses simplified onset detection (`computeQuickOnsetStrength`)
- Constrains to ±20 BPM of global tempo
- Updates display with "LIVE ✅", "LIVE ~", or "TRACKING"

### Additional Features

#### Click Track System (lines 366-384, 886-915)
- Generates metronome clicks at detected beats
- Can pulse button on beat
- Multiple modes: regular, drums, kicks, hits

#### Drum Detection (lines 386-563)
- Detects drum hits using imported `ui.detectDrumHits()`
- Separate modes for all drums, kicks only, hits only
- Generates appropriate click tracks

#### UI Functions
- `logMessage()` (53-58) - Logs to both UI and console
- `drawWaveform()` (1278-1300) - Visualizes audio
- `animatePlayhead()` (1302-1308) - Shows playback position

## Key Insights

1. **The BPM detection is ENTIRELY in lines 917-1276** - these 9 functions
2. **It uses logMessage() for output** - needs to be replaced with console.log
3. **It updates bpmDisplay.textContent** - needs to be removed for pleco-xa
4. **Critical setTimeout yields prevent UI blocking** - MUST be preserved
5. **Beat tracking and click generation use external modules** - not needed for pleco-xa
6. **Live tracking is separate** - uses simplified algorithms for real-time

## What pleco-xa Needs

To migrate to pleco-xa:
1. Copy functions from lines 917-1276
2. Add result processing logic from lines 238-298
3. Replace logMessage() with console.log()
4. Remove bpmDisplay.textContent updates
5. Keep ALL setTimeout yields exactly as they are
6. Export as detectBPM() function matching pleco-xa's interface