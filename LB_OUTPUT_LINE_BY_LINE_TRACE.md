# Line-by-Line Trace of lb Output

## Where Each Line Comes From

### Initial Setup (lines 229-231)
```
[1:59:20 AM] 🔍 Starting BPM analysis
```
**Source**: index.html line 229 - `logMessage("🔍 Starting BPM analysis")`

```
[1:59:20 AM] Audio: 720,000 samples (15.0s)
```
**Source**: index.html line 230 - `logMessage(\`Audio: ${y.length.toLocaleString()} samples (${(y.length/sr).toFixed(1)}s)\`)`

```
[1:59:20 AM] Window: 4s, Hop: 1s
```
**Source**: index.html line 231 - `logMessage(\`Window: ${windowSize}s, Hop: ${hopSize}s\`)`

### Step 1: Onset Strength (from analyzeWithProgress)
```
[1:59:20 AM] 🎵 Step 1: Computing onset strength for entire track...
```
**Source**: index.html line 919 - `logMessage(\`🎵 Step 1: Computing onset strength for entire track...\`)`

```
[1:59:20 AM] 📊 Track info: 720,000 samples, 15.0s duration
```
**Source**: index.html line 920 - `logMessage(\`📊 Track info: ${y.length.toLocaleString()} samples, ${(y.length/sr).toFixed(1)}s duration\`)`

### Inside computeOnsetStrength()
```
[1:59:20 AM] 🔧 Onset computation: 1403 frames, 2048 frame size, 512 hop
```
**Source**: index.html line 988 - `logMessage(\`🔧 Onset computation: ${frames} frames, ${frameLength} frame size, ${hopLength} hop\`)`

```
[1:59:20 AM]  Computing onsets... 0% (frame 0/1403, flux: 0.000)
```
**Source**: index.html line 1013 - `logMessage(\` Computing onsets... ${progress}% (frame ${i}/${frames}, flux: ${onset[i].toFixed(3)})\`)`
(Repeated every 200 frames due to line 1011: `if (i % 200 === 0)`)

```
[1:59:25 AM] 📊 Onset envelope: max flux = 1163.173
```
**Source**: index.html line 1017 - `logMessage(\`📊 Onset envelope: max flux = ${maxFlux.toFixed(3)}\`)`

### Back to analyzeWithProgress()
```
[1:59:25 AM] ✅ Onset envelope computed: 1403 frames
```
**Source**: index.html line 922 - `logMessage(\`✅ Onset envelope computed: ${globalOnsetEnvelope.length} frames\`)`

```
[1:59:25 AM] 📈 Onset stats: max=1163.173, avg=127.971
```
**Source**: index.html line 923 - `logMessage(\`📈 Onset stats: max=${Math.max(...globalOnsetEnvelope).toFixed(3)}, avg=${(globalOnsetEnvelope.reduce((a,b)=>a+b,0)/globalOnsetEnvelope.length).toFixed(3)}\`)`

### Step 2: Global Tempo
```
[1:59:25 AM] 🎵 Step 2: Finding global tempo candidates...
```
**Source**: index.html line 924 - `logMessage(\`🎵 Step 2: Finding global tempo candidates...\`)`

### Inside estimateGlobalTempo()
```
[1:59:25 AM] 🔍 Searching tempo range: 70-180 BPM
```
**Source**: index.html line 1026 - `logMessage(\`🔍 Searching tempo range: ${tempoConstraints.min}-${tempoConstraints.max} BPM\`)`

```
[1:59:25 AM] 📊 Autocorrelation: 31 to 80 lag frames (50 calculations)
```
**Source**: index.html line 1027 - `logMessage(\`📊 Autocorrelation: ${minLag} to ${maxLag} lag frames (${maxLag-minLag+1} calculations)\`)`

```
[1:59:25 AM] ⚡ Using RAW autocorrelation scores only - no arbitrary musical boosts
```
**Source**: index.html line 1028 - `logMessage(\`⚡ Using RAW autocorrelation scores only - no arbitrary musical boosts\`)`

```
[1:59:25 AM]  Autocorr 0%: lag=31 → 181.5 BPM (corr: 0.3445)
```
**Source**: index.html line 1044 - `logMessage(\` Autocorr ${progress}%: lag=${lag} → ${bpm.toFixed(1)} BPM (corr: ${autocorr[lagIdx].toFixed(4)})\`)`
(Every 20 iterations due to line 1042: `if (lagIdx % 20 === 0)`)

```
[1:59:25 AM] 🎯 Finding tempo peaks with musical constraints...
```
**Source**: index.html line 1049 - `logMessage(\`🎯 Finding tempo peaks with musical constraints...\`)`

```
[1:59:25 AM] 📈 Raw autocorrelation peaks:
```
**Source**: index.html line 1051 - `logMessage(\`📈 Raw autocorrelation peaks:\`)`

```
[1:59:25 AM]  1. 127.8 BPM (score: 0.7086)
```
**Source**: index.html lines 1052-1054 - Loop logging top 10 candidates

```
[1:59:25 AM] 🎵 Final ranking by RAW autocorrelation only (no boosts):
```
**Source**: index.html line 1064 - `logMessage(\`🎵 Final ranking by RAW autocorrelation only (no boosts):\`)`

```
[1:59:25 AM]  1. 127.8 BPM (raw score: 0.7086) 👑
```
**Source**: index.html lines 1065-1068 - Loop with crown for winner

```
[1:59:25 AM] 📊 Confidence calculation: best=0.7086, avg=0.3600 → 72.6%
```
**Source**: index.html line 1073 - `logMessage(\`📊 Confidence calculation: best=${bestScore.toFixed(4)}, avg=${avgCorr.toFixed(4)} → ${(confidence*100).toFixed(1)}%\`)`

### Back to analyzeWithProgress()
```
[1:59:25 AM] 🎯 Global tempo: 127.8 BPM (confidence: 72.6%)
```
**Source**: index.html line 926 - `logMessage(\`🎯 Global tempo: ${globalTempo.bpm.toFixed(1)} BPM (confidence: ${(globalTempo.confidence * 100).toFixed(1)}%)\`)`

```
[1:59:25 AM] 🔍 Best correlation score: 0.7086
```
**Source**: index.html line 927 - `logMessage(\`🔍 Best correlation score: ${globalTempo.score.toFixed(4)}\`)`

```
[1:59:25 AM] 📊 Top tempo candidates:
```
**Source**: index.html line 928 - `logMessage(\`📊 Top tempo candidates:\`)`

```
[1:59:25 AM]  1. 127.8 BPM (score: 0.7086)
```
**Source**: index.html lines 929-932 - Loop logging top 5 candidates

### Step 3: Tempogram
```
[1:59:25 AM] 🎵 Step 3: Computing Fourier tempogram...
```
**Source**: index.html line 934 - `logMessage(\`🎵 Step 3: Computing Fourier tempogram for detailed tempo analysis...\`)`

### Inside computeFourierTempogram()
```
[1:59:25 AM] 🔧 Tempogram setup: winLength=384, hopFrames=96
```
**Source**: index.html line 1087 - `logMessage(\`🔧 Tempogram setup: winLength=${winLength}, hopFrames=${hopFrames}\`)`

```
[1:59:25 AM] 📊 Computing 11 tempogram frames...
```
**Source**: index.html line 1092 - `logMessage(\`📊 Computing ${frames} tempogram frames...\`)`

```
[1:59:25 AM]  Tempogram 0%: frame 0/11 (energy: 5274564.549)
```
**Source**: index.html line 1103 - `logMessage(\` Tempogram ${progress}%: frame ${i}/${frames} (energy: ${frameEnergy.toFixed(3)})\`)`
(Every 10% due to line 1100: `if (i % Math.max(1, Math.floor(frames / 10)) === 0)`)

```
[1:59:25 AM] 🎼 Tempo frequency range: 14.6-2812.5 BPM
```
**Source**: index.html line 1109 - `logMessage(\`🎼 Tempo frequency range: ${tempoFreqs[1].toFixed(1)}-${tempoFreqs[tempoFreqs.length-1].toFixed(1)} BPM\`)`

### Inside analyzeTempogram()
```
[1:59:25 AM] 📈 Tempogram analysis complete:
```
**Source**: index.html line 1111 - `logMessage(\`📈 Tempogram analysis complete:\`)`

```
[1:59:25 AM]  Dominant frequencies found: 2
```
**Source**: index.html line 1112 - `logMessage(\` Dominant frequencies found: ${tempogramAnalysis.peakTempos.length}\`)`

```
[1:59:25 AM]  Total energy: 6852153.867
```
**Source**: index.html line 1113 - `logMessage(\` Total energy: ${tempogramAnalysis.totalEnergy.toFixed(3)}\`)`

```
[1:59:25 AM]  Peak energy ratio: 0.1%
```
**Source**: index.html line 1114 - `logMessage(\` Peak energy ratio: ${(tempogramAnalysis.peakEnergyRatio * 100).toFixed(1)}%\`)`

### Back to analyzeWithProgress()
```
[1:59:25 AM] 📈 Tempogram computed: 11 time frames, 193 tempo frequencies
```
**Source**: index.html line 936 - `logMessage(\`📈 Tempogram computed: ${tempogramResult.frames} time frames, ${tempogramResult.frequencies.length} tempo frequencies\`)`

```
[1:59:25 AM] 🎯 Tempogram tempo range: 14.6-2812.5 BPM
```
**Source**: index.html line 937 - `logMessage(\`🎯 Tempogram tempo range: ${tempogramResult.tempoRange.min.toFixed(1)}-${tempogramResult.tempoRange.max.toFixed(1)} BPM\`)`

```
[1:59:25 AM] 📊 Peak tempo energies in tempogram:
```
**Source**: index.html line 938 - `logMessage(\`📊 Peak tempo energies in tempogram:\`)`

```
[1:59:25 AM]  1. 131.8 BPM (energy: 6881.0615, frames: 10)
```
**Source**: index.html lines 939-942 - Loop logging peak tempos

### Step 4: Window Analysis
```
[1:59:25 AM] 🎵 Step 4: Analyzing tempo stability over time...
```
**Source**: index.html line 944 - `logMessage(\`🎵 Step 4: Analyzing tempo stability over time...\`)`

```
[1:59:25 AM] ⚙️ Window analysis: 11 windows, 4s each, 1s hops
```
**Source**: index.html line 948 - `logMessage(\`⚙️ Window analysis: ${numWindows} windows, ${windowSize}s each, ${hopSize}s hops\`)`

### Inside estimateConstrainedTempo() - Called for each window
```
[1:59:25 AM]  [0] WIDE constraint: 77.8-177.8 BPM (±50 around global 127.8)
```
**Source**: index.html line 1214 - `logMessage(\` [${windowIndex}] WIDE constraint: ${minBpm.toFixed(1)}-${maxBpm.toFixed(1)} BPM (±${tolerance} around global ${globalBpm.toFixed(1)})\`)`

```
[1:59:25 AM]  [0] Onset energy: 746 frames, avg=3.308, max=9.609
```
**Source**: index.html line 1228 - `logMessage(\` [${windowIndex}] Onset energy: ${onsets.length} frames, avg=${avgEnergy.toFixed(3)}, max=${Math.max(...onsets).toFixed(3)}\`)`

```
[1:59:25 AM]  [0] Checking lags 63-144 for ALL tempo candidates...
```
**Source**: index.html line 1232 - `logMessage(\` [${windowIndex}] Checking lags ${lagMin}-${lagMax} for ALL tempo candidates...\`)`

```
[1:59:25 AM]  [0] Top correlations in window (all candidates):
```
**Source**: index.html line 1252 - `logMessage(\` [${windowIndex}] Top correlations in window (all candidates):\`)`

```
[1:59:25 AM]  129.3 BPM: 0.8022 🎯👑
```
**Source**: index.html lines 1253-1258 - Loop logging top correlations with emoji markers

```
[1:59:25 AM]  [0] Selected: 129.3 BPM (correlation: 0.8022)
```
**Source**: index.html line 1259 - `logMessage(\` [${windowIndex}] Selected: ${bestBpm.toFixed(1)} BPM (correlation: ${maxCorr.toFixed(4)})\`)`

### Back to analyzeWithProgress() main loop
```
[1:59:25 AM] [00] t=0.0s → 129.3 BPM (+1.5) ✅ (corr: 0.802)
```
**Source**: index.html line 962 - `logMessage(\`[${i.toString().padStart(2,'0')}] t=${times[i].toFixed(1)}s → ${localResult.bpm.toFixed(1)} BPM${deviationStr} ${status} (corr: ${localResult.correlation.toFixed(3)})\`)`

(This pattern repeats for all 11 windows)

### After Analysis Loop Completes (line 238 onward in analyze button handler)
```
[1:59:25 AM] ✅ Analysis completed in 4.7s
```
**Source**: index.html line 240 - `logMessage(\`✅ Analysis completed in ${analysisTime.toFixed(1)}s\`)`

```
[1:59:25 AM] 🎯 GLOBAL TEMPO: 127.8 BPM (72.6% confidence)
```
**Source**: index.html line 249 - `logMessage(\`🎯 GLOBAL TEMPO: ${globalTempo} BPM (${(confidence * 100).toFixed(1)}% confidence)\`)`

```
[1:59:25 AM] 🏆 Final global tempo candidates (raw autocorrelation only):
```
**Source**: index.html line 251 - `logMessage(\`🏆 Final global tempo candidates (raw autocorrelation only):\`)`

```
[1:59:25 AM]  1. 127.8 BPM (score: 0.7086) 👑
```
**Source**: index.html lines 252-256 - Loop with crown for winner

### Tempogram Analysis Results
```
[1:59:25 AM] 📈 FOURIER TEMPOGRAM ANALYSIS:
```
**Source**: index.html line 258 - `logMessage(\`📈 FOURIER TEMPOGRAM ANALYSIS:\`)`

```
[1:59:25 AM]  Time-frequency resolution: 11 frames × 193 frequencies
```
**Source**: index.html line 259 - `logMessage(\` Time-frequency resolution: ${tempogram.frames} frames × ${tempogram.frequencies.length} frequencies\`)`

```
[1:59:25 AM]  Total spectral energy: 6852153.867
```
**Source**: index.html line 260 - `logMessage(\` Total spectral energy: ${tempogram.totalEnergy.toFixed(3)}\`)`

```
[1:59:25 AM]  Energy distribution:
```
**Source**: index.html line 261 - `logMessage(\` Energy distribution:\`)`

```
[1:59:25 AM] 🎼 TEMPOGRAM PEAK TEMPOS (spectral analysis):
```
**Source**: index.html line 264 - `logMessage(\`🎼 TEMPOGRAM PEAK TEMPOS (spectral analysis):\`)`

```
[1:59:25 AM]  1. 131.8 BPM (energy: 6881.0615, frames: 10/11 frames, 28.3%) 🎯
```
**Source**: index.html lines 265-271 - Loop logging peak tempos

```
[1:59:25 AM] 🔍 Method agreement: Global=127.8 vs Tempogram=131.8 BPM (±4.0)
```
**Source**: index.html line 275 - `logMessage(\`🔍 Method agreement: Global=${globalTempo.toFixed(1)} vs Tempogram=${tempogramTop.bpm.toFixed(1)} BPM (±${agreementError.toFixed(1)})\`)`

```
[1:59:25 AM] ✅ EXCELLENT: Both methods agree within ±5 BPM
```
**Source**: index.html line 277 - `if (agreementError < 5) logMessage(\`✅ EXCELLENT: Both methods agree within ±5 BPM\`)`

### Stability Analysis
```
[1:59:25 AM] 📊 TEMPO STABILITY ANALYSIS:
```
**Source**: index.html line 287 - `logMessage(\`📊 TEMPO STABILITY ANALYSIS:\`)`

```
[1:59:25 AM]  Average deviation: ±0.2 BPM
```
**Source**: index.html line 288 - `logMessage(\` Average deviation: ±${avgDeviation.toFixed(1)} BPM\`)`

```
[1:59:25 AM]  Maximum deviation: ±1.5 BPM
```
**Source**: index.html line 289 - `logMessage(\` Maximum deviation: ±${maxDeviation.toFixed(1)} BPM\`)`

```
[1:59:25 AM]  Stability windows: 11/11 stable (±5 BPM)
```
**Source**: index.html line 290 - `logMessage(\` Stability windows: ${tempo.filter(t => Math.abs(t - globalTempo) < 5).length}/${tempo.length} stable (±5 BPM)\`)`

```
[1:59:25 AM] 📈 WINDOW-BY-WINDOW SUMMARY:
```
**Source**: index.html line 292 - `logMessage(\`📈 WINDOW-BY-WINDOW SUMMARY:\`)`

```
[1:59:25 AM]  ✅ Stable (±5 BPM): 11 windows
```
**Source**: index.html line 296 - `logMessage(\` ✅ Stable (±5 BPM): ${stableCount} windows\`)`

```
[1:59:25 AM]    ⚠️ Moderate (5-15 BPM): 0 windows
```
**Source**: index.html line 297 - `logMessage(\`   ⚠️ Moderate (5-15 BPM): ${moderateCount} windows\`)`

```
[1:59:25 AM]    ❌ Unstable (>15 BPM): 0 windows
```
**Source**: index.html line 298 - `logMessage(\`   ❌ Unstable (>15 BPM): ${unstableCount} windows\`)`

### Beat Tracking (EXTERNAL MODULE)
```
[1:59:25 AM] 🎵 Performing beat tracking (reusing onset envelope)...
```
**Source**: index.html line 300 - `logMessage(\`🎵 Performing beat tracking (reusing onset envelope)...\`)`

```
[1:59:25 AM] 🥁 Beat tracking completed: 20 beats detected
```
**Source**: index.html line 313 - `logMessage(\`🥁 Beat tracking completed: ${beatTimes.length} beats detected\`)`

### Click Track (EXTERNAL MODULE)
```
[1:59:25 AM] 🎵 Generating click track for verification...
```
**Source**: index.html line 315 - `logMessage(\`🎵 Generating click track for verification...\`)`

```
[1:59:25 AM] ✅ Click track generated successfully with 20 clicks
```
**Source**: index.html line 317 - `logMessage(\`✅ Click track generated successfully with ${beatTimes.length} clicks\`)`

### Final Result Summary
```
[1:59:25 AM] 🎉 FINAL RESULT:
```
**Source**: index.html line 339 - `logMessage(\`🎉 FINAL RESULT:\`)`

```
[1:59:25 AM]  🎯 HIGH CONFIDENCE: Both methods confirm 127.8 BPM
```
**Source**: index.html line 341 - `logMessage(\` 🎯 HIGH CONFIDENCE: Both methods confirm ${globalTempo.toFixed(1)} BPM\`)`

```
[1:59:25 AM]    📊 Overall stability: STABLE (±0.2 BPM average)
```
**Source**: index.html line 348 - `logMessage(\`   📊 Overall stability: ${stabilityStatus} (±${avgDeviation.toFixed(1)} BPM average)\`)`

```
[1:59:25 AM]    🎼 Multiple tempo candidates detected - possible tempo changes or polyrhythm
```
**Source**: index.html line 351 - `logMessage(\`   🎼 Multiple tempo candidates detected - possible tempo changes or polyrhythm\`)`

## Summary

EVERY SINGLE LINE comes from:
1. **index.html lines 229-231** - Initial setup messages
2. **index.html lines 917-981** - analyzeWithProgress() and its messages
3. **index.html lines 983-1019** - computeOnsetStrength()
4. **index.html lines 1021-1081** - estimateGlobalTempo()
5. **index.html lines 1083-1125** - computeFourierTempogram()
6. **index.html lines 1149-1208** - analyzeTempogram()
7. **index.html lines 1210-1262** - estimateConstrainedTempo()
8. **index.html lines 238-352** - Result processing in analyze button handler
9. **xa-beat-tracker.js** - Only for beat tracking (line 300-313) and click track (315-317)

The BPM detection itself is ENTIRELY in index.html. The xa-beat-tracker.js is ONLY used for beat/click generation AFTER the BPM is found.