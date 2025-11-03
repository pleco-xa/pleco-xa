# BPM Detection Migration Plan: lb → pleco-xa

## Phase 1: Analysis & Problem Identification

### A. Why lb's Algorithm is Superior

**Current pleco-xa approach (xa-bpm-detection.js):**
- Simple energy-based onset detection with peak finding
- Single-pass median interval calculation
- No spectral analysis or frequency domain validation
- Limited to 10 seconds of audio with downsampling
- Simplified peak detection with fixed threshold

**lb's sophisticated approach:**
1. **Spectral Flux Onset Detection** (`computeOnsetStrength`):
   - Uses full FFT spectrum (2048 frame, 512 hop)
   - Computes spectral flux (positive differences between consecutive frames)
   - Hanning window for better frequency resolution
   - Processes entire audio file, not just first 10 seconds

2. **Autocorrelation-Based Tempo Estimation** (`estimateGlobalTempo`):
   - Normalized autocorrelation across 70-180 BPM range
   - Multiple tempo candidate ranking by correlation score
   - No arbitrary "musical preference" boosts - pure correlation scores
   - Confidence scoring based on peak-to-average ratio

3. **Fourier Tempogram Verification** (`computeFourierTempogram`):
   - Time-frequency analysis of onset envelope
   - Validates global tempo across multiple time windows
   - Detects tempo changes and polyrhythms
   - Energy distribution analysis for confidence

4. **Windowed Tempo Stability** (`estimateConstrainedTempo`):
   - Analyzes tempo in overlapping windows
   - Constrained search around global tempo (±50 BPM)
   - Tracks tempo variations throughout the track
   - Provides per-window correlation scores

**Key Accuracy Advantages:**
- Multi-method validation (autocorrelation + Fourier tempogram)
- Full track analysis rather than first 10s sample
- Proper spectral analysis vs. simple energy
- Confidence scoring based on agreement between methods
- Better handling of complex rhythms and tempo changes

### B. Root Cause of Previous Stalling Issue

**Why you experienced stalling:**

1. **Synchronous heavy computation on main thread:**
   - lb runs 4 computationally intensive steps sequentially
   - Each step processes thousands of frames
   - Without proper yielding, this blocks UI rendering

2. **Immediate execution on file load:**
   - pleco-xa calls `detectBPM()` immediately at line 558 in AudioAnalyzer
   - lb only runs on explicit user button click (line 216: `analyzeBtn.onclick`)
   - User expects delay when clicking "Analyze BPM" button
   - User does NOT expect freeze on file load

3. **Insufficient yielding in migration attempt:**
   - lb yields every N iterations with `setTimeout(resolve, 1)` or `setTimeout(resolve, 10)`
   - If these weren't preserved correctly, computation runs synchronously
   - Even 1ms setTimeout allows browser to process events/render frames

### C. Current pleco-xa Architecture

**Key integration points:**

1. **Line 558 - Initial file load:**
```javascript
const bpmResult = await detectBPM(currentAudioBuffer);
```
- Called immediately after decoding audio
- User expects fast feedback here
- Currently shows "..." placeholder while worker processes

2. **Line 1366 - Live BPM updates during playback:**
```javascript
detectBPM(currentAudioBuffer, { windowStart: currentSample, windowDuration: 4.0 })
```
- Called every `bpmUpdateInterval` (needs checking what this value is)
- Should NOT block audio playback
- Windowed analysis of current position

3. **Web Worker exists but is not used:**
- `/src/workers/analysisWorker.js` exists
- Currently uses `fastBPMDetect` from `xa-beat.js` (not xa-bpm-detection.js)
- Worker infrastructure is in place but disconnected from current flow

---

## Phase 2: Migration Strategy

### Architecture Decision: Two-Tier Approach

**Tier 1: Fast Estimation (File Load)**
- Use current simple energy-based algorithm for immediate feedback
- Returns in <200ms even for large files
- Good enough for initial UI display
- **No changes needed** - keep existing `quickBPMDetect`

**Tier 2: Accurate Analysis (On-Demand)**
- Migrate lb's full algorithm as separate function: `accurateBPMDetect()`
- Triggered by:
  - User clicks new "Analyze BPM" button (add to UI), OR
  - Automatically in background after 1-2 seconds post-load, OR
  - Never automatically - only on explicit user request
- Updates UI when complete

This approach prevents stalling while giving access to lb's accuracy.

### Changes to xa-bpm-detection.js

**1. Keep existing `detectBPM()` function signature** (backward compatibility)
```javascript
export async function detectBPM(audioBuffer, options = {})
```

**2. Add `mode` option:**
```javascript
options = {
  mode: 'fast',  // or 'accurate'
  minBPM: 60,
  maxBPM: 180,
  // existing options...
}
```

**3. Extract and migrate lb functions:**
```javascript
// New internal functions from lb:
async function computeOnsetStrength(y, sr, progressCallback)
async function estimateGlobalTempo(onsetEnvelope, sr, progressCallback)
async function computeFourierTempogram(onsetEnvelope, sr, progressCallback)
async function estimateConstrainedTempo(audioWindow, sampleRate, globalBpm, windowIndex)

// Helper functions:
function computeSimpleFFT(signal)
function computeSimpleSpectrum(frame)
function computeTempoFrequencies(sr, hopLength, winLength)
function analyzeTempogram(tempogram, tempoFreqs)
```

**4. Route to correct implementation:**
```javascript
export async function detectBPM(audioBuffer, options = {}) {
  const mode = options.mode || 'fast';

  if (mode === 'accurate') {
    return await accurateBPMDetect(audioBuffer, options);
  } else {
    return await quickBPMDetect(audioBuffer, options);
  }
}
```

**5. Implement `accurateBPMDetect()` using lb's algorithm:**
```javascript
async function accurateBPMDetect(audioBuffer, options = {}) {
  const y = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;

  const progressCallback = options.onProgress || (() => {});

  // Step 1: Compute onset strength (with yields)
  progressCallback({ step: 1, progress: 0, message: 'Computing onset strength' });
  const onsetEnvelope = await computeOnsetStrength(y, sr, progressCallback);

  // Step 2: Estimate global tempo (with yields)
  progressCallback({ step: 2, progress: 0.33, message: 'Estimating global tempo' });
  const globalTempo = await estimateGlobalTempo(onsetEnvelope, sr, progressCallback);

  // Step 3: Compute Fourier tempogram (with yields)
  progressCallback({ step: 3, progress: 0.66, message: 'Analyzing tempogram' });
  const tempogram = await computeFourierTempogram(onsetEnvelope, sr, progressCallback);

  // Step 4: Optional windowed analysis
  // (Can skip this for initial global BPM to save time)

  progressCallback({ step: 4, progress: 1.0, message: 'Complete' });

  return {
    bpm: globalTempo.bpm,
    confidence: globalTempo.confidence,
    candidates: globalTempo.candidates,
    tempogram: tempogram,
    method: 'accurate'
  };
}
```

### Changes to AudioAnalyzer.astro

**Option A: Keep fast mode only (recommended for minimal changes)**
- Line 558: Keep current `detectBPM()` call (defaults to 'fast')
- Line 1366: Keep current windowed call
- Add optional button for users to request accurate analysis

**Option B: Background accurate analysis (more ambitious)**
- Line 558: Use fast mode immediately
- Add setTimeout to trigger accurate mode after 2 seconds
- Update UI when accurate result arrives

**Option C: Remove line 558 entirely (safest but slower UX)**
- Don't call detectBPM on load
- Only show BPM when user explicitly requests analysis
- Similar to lb's approach

**Recommended: Option A** because:
- Minimal code changes
- No risk of stalling
- Users get immediate feedback (fast mode)
- Optional accurate analysis when needed
- Can test accurate mode without affecting existing behavior

### Critical: Preventing UI Blocking

**1. Preserve all `setTimeout` yields from lb:**
```javascript
// In computeOnsetStrength - every 200 frames:
if (i % 200 === 0) {
  await new Promise(resolve => setTimeout(resolve, 1));
}

// In estimateGlobalTempo - every 20 lag calculations:
if (lagIdx % 20 === 0) {
  await new Promise(resolve => setTimeout(resolve, 1));
}

// In computeFourierTempogram - every 10%:
if (i % Math.max(1, Math.floor(frames / 10)) === 0) {
  await new Promise(resolve => setTimeout(resolve, 1));
}

// In windowed analysis - every 2 windows:
if (i % 2 === 0) {
  await new Promise(resolve => setTimeout(resolve, 10));
}
```

**2. Why these work:**
- `setTimeout(..., 1)` yields control back to event loop
- Allows browser to process render frames, user input, audio playback
- 1ms is enough - browser will batch tasks efficiently
- Costs ~5-20ms per yield total, but prevents multi-second freeze

**3. Additional safeguards:**
```javascript
// Add timeout protection
const ANALYSIS_TIMEOUT = 30000; // 30 seconds
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Analysis timeout')), ANALYSIS_TIMEOUT)
);

return await Promise.race([
  accurateBPMDetect(audioBuffer, options),
  timeoutPromise
]);
```

**4. Progress callbacks for UI feedback:**
```javascript
options.onProgress = ({ step, progress, message }) => {
  document.getElementById('bpmValue').textContent =
    `Analyzing... ${(progress * 100).toFixed(0)}%`;
};
```

---

## Phase 3: Testing Strategy

### Test Cases

**1. Accuracy verification:**
```javascript
// Compare results on known test files
const testFiles = [
  { file: 'test-120bpm.mp3', expectedBPM: 120, tolerance: 2 },
  { file: 'test-complex-rhythm.mp3', expectedBPM: 145, tolerance: 5 }
];

for (const test of testFiles) {
  const fastResult = await detectBPM(buffer, { mode: 'fast' });
  const accurateResult = await detectBPM(buffer, { mode: 'accurate' });

  console.log(`Fast: ${fastResult.bpm}, Accurate: ${accurateResult.bpm}, Expected: ${test.expectedBPM}`);
}
```

**2. Performance testing:**
```javascript
// Measure time for both modes
const start = performance.now();
const result = await detectBPM(buffer, { mode: 'accurate' });
const duration = performance.now() - start;

console.log(`Accurate analysis took ${duration}ms`);
// Should be < 5 seconds for typical songs
// Should NOT freeze UI during analysis
```

**3. UI blocking test:**
```javascript
// Verify UI remains responsive during analysis
let frameCount = 0;
const raf = () => {
  frameCount++;
  requestAnimationFrame(raf);
};
requestAnimationFrame(raf);

await detectBPM(buffer, { mode: 'accurate' });

console.log(`Rendered ${frameCount} frames during analysis`);
// Should be > 0 (proves UI wasn't blocked)
```

**4. Edge cases:**
- Very short audio (<5 seconds)
- Very long audio (>5 minutes)
- Audio without clear beat (ambient, spoken word)
- Variable tempo music
- Corrupted/invalid audio data

---

## Phase 4: Implementation Checklist

### Step 1: Prepare xa-bpm-detection.js
- [ ] Add mode parameter to detectBPM options
- [ ] Rename current implementation to `quickBPMDetect` (already done)
- [ ] Create routing logic based on mode

### Step 2: Extract lb functions
- [ ] Copy `computeOnsetStrength` with all setTimeout yields
- [ ] Copy `estimateGlobalTempo` with all setTimeout yields
- [ ] Copy `computeFourierTempogram` with all setTimeout yields
- [ ] Copy `estimateConstrainedTempo` (optional for v1)
- [ ] Copy all helper functions: `computeSimpleFFT`, `computeSimpleSpectrum`, etc.

### Step 3: Implement accurateBPMDetect
- [ ] Create main function signature
- [ ] Wire up 4-step analysis pipeline
- [ ] Add progress callbacks
- [ ] Add timeout protection
- [ ] Test in isolation

### Step 4: Integration
- [ ] Keep AudioAnalyzer.astro line 558 as-is (defaults to fast)
- [ ] Add optional "Analyze Accurately" button to UI
- [ ] Wire button to call `detectBPM(buffer, { mode: 'accurate' })`
- [ ] Update UI with progress during accurate analysis

### Step 5: Testing
- [ ] Test fast mode still works (no regression)
- [ ] Test accurate mode with various audio files
- [ ] Verify no UI freezing during accurate mode
- [ ] Compare results with lb project on same files
- [ ] Test edge cases (short/long/no-beat audio)

### Step 6: Documentation
- [ ] Document mode parameter in detectBPM JSDoc
- [ ] Add comments explaining algorithm steps
- [ ] Note performance characteristics (fast: <200ms, accurate: 2-10s)

---

## Why This Won't Stall (Unlike Previous Attempt)

### Previous Attempt Issues (Hypothesis):
1. **Missing setTimeout yields** - If these were removed/modified, computation runs synchronously
2. **Wrong calling context** - Called immediately on load when user expects instant feedback
3. **No timeout protection** - Could hang indefinitely on problematic audio
4. **No mode flag** - Couldn't selectively use fast vs accurate

### Why This Plan Works:

1. **Preserved setTimeout yields:**
   - Every major loop includes `await new Promise(resolve => setTimeout(resolve, N))`
   - Frequency tuned based on lb's testing (every 200 frames, every 20 lags, etc.)
   - These are NON-NEGOTIABLE - must be preserved exactly

2. **Two-tier architecture:**
   - Fast mode for immediate feedback (existing algorithm)
   - Accurate mode only when explicitly requested
   - User understands that "Analyze Accurately" will take time

3. **Progress feedback:**
   - User sees percentage complete
   - UI updates every few seconds
   - Clear indication that processing is happening, not frozen

4. **Timeout protection:**
   - Hard 30-second limit
   - Graceful failure with error message
   - Fallback to fast result if accurate fails

5. **No automatic accurate analysis on load:**
   - Avoids unexpected delay
   - User controls when heavy computation runs
   - Can still implement background analysis later if desired

---

## Trade-offs & Decisions Needed

### Decision 1: When to run accurate analysis?

**Option A: Never automatic - button only**
- Pros: Zero risk of stalling, user controls performance impact
- Cons: Most users won't click it, miss accuracy benefits

**Option B: Background after 2 seconds**
- Pros: Automatic upgrade to accurate BPM, good UX
- Cons: Could impact performance on slow devices, unexpected CPU spike

**Option C: Smart heuristic (short files only)**
- Pros: Auto-accurate for songs <3 minutes, manual for longer
- Cons: Inconsistent behavior, complexity

**My recommendation: Start with Option A**, then add Option B in a future PR after confirming no performance issues.

### Decision 2: Keep windowed analysis (estimateConstrainedTempo)?

**Purpose in lb:** Tracks tempo changes throughout song, creates per-window tempo array

**Usage in lb:** Only for detailed logging and tempo stability metrics

**Needed in pleco-xa?**
- Not for initial global BPM detection
- Could be useful for advanced features (tempo change detection, dynamic looping)
- Adds ~20-30% to analysis time

**My recommendation:** Skip for v1, add later if needed for features.

### Decision 3: Web Worker migration?

**Should we move accurate analysis to Web Worker?**

**Pros:**
- Complete UI isolation
- No setTimeout yields needed
- Better perceived performance

**Cons:**
- Can't use Web Audio API in Worker (need to pass raw channel data)
- More complex debugging
- Need to serialize/deserialize results
- Current setTimeout approach proven to work in lb

**My recommendation:** Start with main-thread setTimeout approach (proven in lb), consider Worker in future optimization pass if needed.

### Decision 4: Remove or update line 1366 (live BPM updates)?

**Current behavior:** Runs windowed BPM detection every N seconds during playback

**Issue:** If we replace with accurate algorithm, this will cause stutter during playback

**Options:**
- Keep using fast algorithm for live updates
- Disable live updates entirely
- Use pre-computed windowed results from initial accurate analysis

**My recommendation:** Keep fast algorithm for live updates (or disable entirely - questionable value during playback).

---

## Summary: What Changes, What Doesn't

### Changes to `/src/scripts/xa-bpm-detection.js`:
✅ Add `mode` parameter to options
✅ Add `accurateBPMDetect()` function with lb's algorithm
✅ Add 6-7 helper functions from lb (computeOnsetStrength, etc.)
✅ Add progress callback support
✅ Add timeout protection
✅ Preserve all setTimeout yields exactly as in lb

### Changes to `/src/components/AudioAnalyzer.astro`:
✅ **Option A (minimal):** Add "Analyze Accurately" button, wire to `detectBPM(buffer, { mode: 'accurate' })`
✅ **Option B (automatic):** Add setTimeout to trigger accurate analysis 2s after load
❌ No changes to line 558 (keep fast mode)
⚠️ Line 1366: Consider disabling or keep using fast mode

### Does NOT change:
❌ Current fast detection algorithm (backward compatible)
❌ Function signatures or exports
❌ Web Worker infrastructure (not used yet)
❌ Audio playback, looping, or other features

### Performance Characteristics:
- **Fast mode:** <200ms (current behavior)
- **Accurate mode:** 2-10 seconds depending on audio length
- **UI blocking:** Zero (with setTimeout yields)
- **Memory:** Moderate increase (stores onset envelope, tempogram)

---

## Open Questions for You

Before implementing, I need your input on:

1. **When should accurate analysis run?**
   - A) Only when user clicks "Analyze Accurately" button?
   
     On pleco-xa there will be no Analyze accurately button. the paylut will be idenitcal to how it is now. when we hit play and start playign the audio that is when the analysis detects the bpm-- JUST LIKE IT ALREADY DOES

   - B) Automatically in background 2s after file load?
   
   - C) Smart heuristic (auto for short files, manual for long)?
   
   SO the answer to this is NON-- exactly hwen it does now.
   
2. **Line 1366 live BPM updates - what to do?**
   - Keep using fast algorithm? 
   - Disable entirely?
   - Use pre-computed windowed data?

     rerun analyzsi anytime the wave changes, (halfspeed, reverse, doublespect, etc) 
   
3. **Should I add windowed tempo analysis (`estimateConstrainedTempo`) or skip it for now?**
   - Full lb implementation includes this
   - Adds complexity and time
   - Not strictly needed for global BPM

     We are migrating the lb versions so yes, of course thsi meeans replaceing current with lb.
   
4. **UI for accurate analysis:**
   
   - Add "Analyze Accurately" button next to BPM display?
   - Show progress bar during analysis?
   - Replace BPM value with "Analyzing... 45%" during processing?
   
     No new ui buttotn, no progress bar, none fo that we just want the BPM we dont need ui -- nor does this make the analysis any more accurate-- we can however add this to the console log... the analysis can sit in the console log.
   
5. **Backward compatibility:**
   - Do any other parts of the codebase call `detectBPM` that I should know about?
   - Are there tests I need to update?
   
   I dont know you tell me 

Once you answer these, I'll write the complete implementation with zero placeholders, full error handling, and exact setTimeout yields from lb preserved.
