// ===== CORE IMPORTS =====
// Wave 6: this DOM controller moved out of the library into the demo; all
// library functionality now comes from the public 'pleco-xa' package
// (unused legacy imports were pruned in the move).
import {
  loadFile,
  BeatTracker,
  debugLog,
  fastLoopAnalysis,
  findMusicalLoop,
  warnIfNoMp3Support,
  computeRMS,
  computePeak,
  loop,
} from 'pleco-xa'
import { enqueueToast } from './ui/toastQueue.js'

// Loop primitives (precise onset-pair search + zero-crossing snapping)
const { findPreciseLoop, DynamicZeroCrossing } = loop

// ===== GLOBAL STATE =====
let audioContext
let currentAudioBuffer = null
let currentSource = null
let isPlaying = false
let currentBPM = 120
let currentLoop = { start: 0, end: 1 }
let playheadStartTime = 0
let playheadAnimationId = null
let beatTracker = null

// ===== ERROR HANDLING =====
window.addEventListener('error', (e) => {
  console.error('Global error:', e.error)
  showError(`Error: ${e.error.message}`)
})

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason)
  showError(`Promise error: ${e.reason}`)
})

function showError(message) {
  enqueueToast(message, 5000)
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  debugLog('🎵 Pleco-XA Audio Analysis Engine loading...')
  warnIfNoMp3Support()
  try {
    setupEventListeners()
    debugLog('✅ Event listeners initialized')
  } catch (error) {
    console.error('❌ Failed to initialize:', error)
    showError(`Initialization error: ${error.message}`)
  }
})

function setupEventListeners() {
  // Sample buttons
  document.querySelectorAll('.sample-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sample) {
        loadSampleFile(`/audio/${btn.dataset.sample}`, btn.textContent)
      }
    })
  })

  // Upload button
  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('audioFileInput').click()
  })

  // File input
  document
    .getElementById('audioFileInput')
    .addEventListener('change', async (e) => {
      const file = e.target.files[0]
      if (file) {
        try {
          debugLog(`📁 Loading uploaded file: ${file.name}`)
          updateTrackInfo(file.name, 'Loading...')

          if (!audioContext) {
            audioContext = new (window.AudioContext ||
              window.webkitAudioContext)()
            beatTracker = new BeatTracker()
          }

          currentAudioBuffer = await loadFile(file, audioContext)

          updateTrackInfo(
            file.name,
            `${currentAudioBuffer.duration.toFixed(1)}s`,
          )
          document.getElementById('audioFormat').textContent =
            `${currentAudioBuffer.sampleRate}Hz / ${currentAudioBuffer.numberOfChannels}ch`

          await analyzeAudio()
          drawWaveform()

          debugLog('✅ Uploaded file loaded successfully')
        } catch (error) {
          console.error('❌ Error loading uploaded file:', error)
          showError(`Failed to load ${file.name}: ${error.message}`)
        }
      }
    })

  // Playback controls
  document.getElementById('playBtn').addEventListener('click', playAudio)
  document.getElementById('stopBtn').addEventListener('click', stopAudio)

  // Loop controls
  document.getElementById('detectLoopBtn').addEventListener('click', detectLoop)
  document.getElementById('halfLoopBtn').addEventListener('click', halfLoop)
  document.getElementById('doubleLoopBtn').addEventListener('click', doubleLoop)
  document
    .getElementById('moveForwardBtn')
    .addEventListener('click', moveForward)
  document
    .getElementById('reverseLoopBtn')
    .addEventListener('click', reverseLoopSection)
  document
    .getElementById('resetPlayheadBtn')
    .addEventListener('click', resetPlayhead)
  document.getElementById('resetLoopBtn').addEventListener('click', resetLoop)
}

// ===== AUDIO LOADING =====
// Audio buffer cache to avoid reloading the same files
const audioBufferCache = new Map();

async function loadSampleFile(url, name) {
  try {
    debugLog(`📥 Loading: ${url}`);
    updateTrackInfo(name, 'Loading...');
    
    // Check cache first
    if (audioBufferCache.has(url)) {
      debugLog(`📥 Using cached audio for ${url}`);
      currentAudioBuffer = audioBufferCache.get(url);
      
      // Continue with the rest of the process
      setupLoadedAudio(name);
      return;
    }

    // Create AudioContext with optimized settings if needed
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)({
        latencyHint: 'interactive',
        sampleRate: 44100
      });
      beatTracker = new BeatTracker();
      debugLog(`✅ AudioContext created`);
    }

    // Show loading indicator in UI
    document.getElementById('bpmValue').textContent = '...';
    
    // Use streaming approach with fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        cache: 'force-cache' // Use browser cache when possible
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to load audio: HTTP ${response.status} ${response.statusText}`);
      }
      
      debugLog(`✅ Fetch successful for ${url}`);
      
      // Use streaming where possible
      const contentLength = response.headers.get('Content-Length');
      if (contentLength && parseInt(contentLength) > 1000000) {
        // For large files, show progress
        const reader = response.body.getReader();
        const contentLength = parseInt(response.headers.get('Content-Length'));
        let receivedLength = 0;
        const chunks = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          receivedLength += value.length;
          
          // Update progress
          const progress = Math.round((receivedLength / contentLength) * 100);
          updateTrackInfo(name, `Loading: ${progress}%`);
        }
        
        // Combine chunks
        const arrayBuffer = new ArrayBuffer(receivedLength);
        const view = new Uint8Array(arrayBuffer);
        let position = 0;
        
        for (const chunk of chunks) {
          view.set(chunk, position);
          position += chunk.length;
        }
        
        debugLog(`✅ Streamed ${receivedLength} bytes`);
        currentAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      } else {
        // For smaller files, use simpler approach
        const arrayBuffer = await response.arrayBuffer();
        debugLog(`✅ ArrayBuffer created: ${arrayBuffer.byteLength} bytes`);
        currentAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      }
      
      // Cache the decoded buffer
      audioBufferCache.set(url, currentAudioBuffer);
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }

    // Continue with the rest of the process
    setupLoadedAudio(name);
    
  } catch (error) {
    console.error('❌ Error loading audio:', error);
    showError(`Load error: ${error.message}`);
    updateTrackInfo('Error', error.message);
  }
}

// Helper function to handle the loaded audio
function setupLoadedAudio(name) {
  // Reset loop to full track for new audio
  currentLoop = { start: 0, end: 1 };
  updateLoopInfo();

  debugLog(
    `✅ Audio loaded: ${currentAudioBuffer.duration.toFixed(2)}s @ ${currentAudioBuffer.sampleRate}Hz`,
  );

  updateTrackInfo(name, `${currentAudioBuffer.duration.toFixed(1)}s`);
  document.getElementById('audioFormat').textContent =
    `${currentAudioBuffer.sampleRate}Hz`;

  // Run analysis asynchronously
  setTimeout(async () => {
    await analyzeAudio();
    drawWaveform();
    debugLog('✅ Audio analysis complete');
  }, 10);
}

// ===== AUDIO ANALYSIS =====
async function analyzeAudio() {
  try {
    console.log('🎵 Starting accurate BPM analysis (windowed)...');

    const y = currentAudioBuffer.getChannelData(0);
    const sr = currentAudioBuffer.sampleRate;

    console.log(`📊 Track info: ${y.length.toLocaleString()} samples, ${(y.length/sr).toFixed(1)}s duration`);

    // Step 1: Compute onset strength envelope
    console.log('🎵 Step 1: Computing onset strength for entire track...');
    document.getElementById('bpmValue').textContent = 'Analyzing...';

    const globalOnsetEnvelope = await computeOnsetStrength(y, sr);
    console.log(`✅ Onset envelope computed: ${globalOnsetEnvelope.length} frames`);
    console.log(`📈 Onset stats: max=${Math.max(...globalOnsetEnvelope).toFixed(3)}, avg=${(globalOnsetEnvelope.reduce((a,b)=>a+b,0)/globalOnsetEnvelope.length).toFixed(3)}`);

    // Step 2: Estimate global tempo
    console.log('🎵 Step 2: Finding global tempo candidates...');
    const globalTempo = await estimateGlobalTempo(globalOnsetEnvelope, sr);
    console.log(`🎯 Global tempo: ${globalTempo.bpm.toFixed(1)} BPM (confidence: ${(globalTempo.confidence * 100).toFixed(1)}%)`);
    console.log(`🔍 Best correlation score: ${globalTempo.score.toFixed(4)}`);
    console.log(`📊 Top tempo candidates:`);
    for (let i = 0; i < Math.min(globalTempo.candidates.length, 5); i++) {
      const candidate = globalTempo.candidates[i];
      console.log(` ${i+1}. ${candidate.bpm.toFixed(1)} BPM (score: ${candidate.score.toFixed(4)})`);
    }

    // Step 3: Compute Fourier tempogram for detailed tempo analysis
    console.log('🎵 Step 3: Computing Fourier tempogram for detailed tempo analysis...');
    const tempogramResult = await computeFourierTempogram(globalOnsetEnvelope, sr);
    console.log(`📈 Tempogram computed: ${tempogramResult.frames} time frames, ${tempogramResult.frequencies.length} tempo frequencies`);
    console.log(`🎯 Tempogram tempo range: ${tempogramResult.tempoRange.min.toFixed(1)}-${tempogramResult.tempoRange.max.toFixed(1)} BPM`);
    console.log(`📊 Peak tempo energies in tempogram:`);
    for (let i = 0; i < Math.min(tempogramResult.peakTempos.length, 5); i++) {
      const peak = tempogramResult.peakTempos[i];
      console.log(` ${i+1}. ${peak.bpm.toFixed(1)} BPM (energy: ${peak.energy.toFixed(4)}, frames: ${peak.frameCount})`);
    }

    // Step 4: Analyze tempo stability over time (windowed analysis)
    console.log('🎵 Step 4: Analyzing tempo stability over time...');
    const windowSize = 4.0; // seconds
    const hopSize = 2.0; // seconds
    const windowSamples = Math.floor(windowSize * sr);
    const hopSamples = Math.floor(hopSize * sr);
    const numWindows = Math.floor((y.length - windowSamples) / hopSamples);
    console.log(`⚙️ Window analysis: ${numWindows} windows, ${windowSize}s each, ${hopSize}s hops`);

    const dynamicTempo = [];
    const times = [];

    for (let i = 0; i < numWindows; i++) {
      const start = i * hopSamples;
      const window = y.slice(start, start + windowSamples);
      const localResult = await estimateConstrainedTempo(window, sr, globalTempo.bpm, i);
      dynamicTempo.push(localResult.bpm);
      times.push(start / sr);
      const deviation = Math.abs(localResult.bpm - globalTempo.bpm);
      const status = deviation < 3 ? "✅" : deviation < 8 ? "⚠️" : "❌";
      const deviationStr = deviation > 0.1 ? ` (${deviation > 0 ? '+' : ''}${(localResult.bpm - globalTempo.bpm).toFixed(1)})` : '';
      console.log(`[${i.toString().padStart(2,'0')}] t=${times[i].toFixed(1)}s → ${localResult.bpm.toFixed(1)} BPM${deviationStr} ${status} (corr: ${localResult.correlation.toFixed(3)})`);

      const progress = ((i / numWindows) * 100).toFixed(0);
      document.getElementById('bpmValue').textContent = `${globalTempo.bpm.toFixed(1)} (${progress}%)`;

      // Yield to main thread every 2 windows
      if (i % 2 === 0) await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Set final BPM
    currentBPM = globalTempo.bpm;
    document.getElementById('bpmValue').textContent = currentBPM.toFixed(1);

    // Initialize beat tracker with detected tempo
    if (beatTracker) {
      beatTracker.setTempo(currentBPM);
    }

    // Store comprehensive analysis results
    window.analysisResults = {
      tempo: {
        bpm: currentBPM,
        confidence: globalTempo.confidence,
        candidates: globalTempo.candidates,
        dynamicTempo: dynamicTempo,
        times: times
      },
      beats: { beat_times: [] },
      spectral: {
        centroid: { centroid: 0, centroids: [] },
        rolloff: { rolloff: 0, rolloffs: [] }
      },
      tempogram: tempogramResult,
      onsetEnvelope: globalOnsetEnvelope
    };

    console.log('✅ BPM analysis complete!');

    // Perform more detailed analysis for spectral features
    setTimeout(() => {
      computeAudioFeatures(currentAudioBuffer);
    }, 100);

  } catch (error) {
    console.error('❌ BPM detection error:', error);
    // Fallback to default BPM
    currentBPM = 120;
    document.getElementById('bpmValue').textContent = '120';

    window.analysisResults = {
      tempo: { bpm: currentBPM, confidence: 0.5 },
      beats: { beat_times: [] },
      spectral: { centroid: { centroid: 0, centroids: [] } }
    };
  }
}

// ===== WINDOWED BPM DETECTION HELPER FUNCTIONS =====

/**
 * Compute onset strength envelope using spectral flux
 * Much more accurate than simple energy
 */
async function computeOnsetStrength(y, sr) {
  const frameLength = 2048;
  const hopLength = 512;
  const frames = Math.floor((y.length - frameLength) / hopLength) + 1;
  const onset = new Float32Array(frames);
  console.log(`🔧 Onset computation: ${frames} frames, ${frameLength} frame size, ${hopLength} hop`);

  let prevSpectrum = null;
  let maxFlux = 0;

  for (let i = 0; i < frames; i++) {
    const start = i * hopLength;
    const frame = new Float32Array(frameLength);

    // Apply Hann window
    for (let j = 0; j < frameLength && start + j < y.length; j++) {
      const windowValue = 0.5 * (1 - Math.cos((2 * Math.PI * j) / (frameLength - 1)));
      frame[j] = y[start + j] * windowValue;
    }

    const spectrum = computeSimpleSpectrum(frame);

    if (prevSpectrum) {
      let flux = 0;
      for (let k = 0; k < Math.min(spectrum.length, prevSpectrum.length); k++) {
        flux += Math.max(0, spectrum[k] - prevSpectrum[k]);
      }
      onset[i] = flux;
      maxFlux = Math.max(maxFlux, flux);
    } else {
      onset[i] = 0;
    }

    prevSpectrum = spectrum;

    // Yield to main thread every 200 frames
    if (i % 200 === 0) {
      const progress = ((i / frames) * 100).toFixed(0);
      console.log(` Computing onsets... ${progress}% (frame ${i}/${frames}, flux: ${onset[i].toFixed(3)})`);
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  console.log(`📊 Onset envelope: max flux = ${maxFlux.toFixed(3)}`);
  return onset;
}

/**
 * Estimate global tempo using autocorrelation
 * Applies musical tempo-range constraints
 */
async function estimateGlobalTempo(onsetEnvelope, sr) {
  const hopLength = 512;
  const tempoConstraints = { min: 70, max: 180, common: [80, 90, 100, 110, 120, 128, 140, 150, 160, 170] };
  const minLag = Math.floor((60 * sr) / (tempoConstraints.max * hopLength));
  const maxLag = Math.floor((60 * sr) / (tempoConstraints.min * hopLength));

  console.log(`🔍 Searching tempo range: ${tempoConstraints.min}-${tempoConstraints.max} BPM`);
  console.log(`📊 Autocorrelation: ${minLag} to ${maxLag} lag frames (${maxLag-minLag+1} calculations)`);
  console.log(`⚡ Using RAW autocorrelation scores only - no arbitrary musical boosts`);

  const autocorr = new Float32Array(maxLag - minLag + 1);
  const candidates = [];

  for (let lagIdx = 0; lagIdx < autocorr.length; lagIdx++) {
    const lag = minLag + lagIdx;
    let corr = 0, norm = 0;

    for (let i = 0; i < onsetEnvelope.length - lag; i++) {
      corr += onsetEnvelope[i] * onsetEnvelope[i + lag];
      norm += onsetEnvelope[i] * onsetEnvelope[i];
    }

    autocorr[lagIdx] = norm > 0 ? corr / norm : 0;
    const bpm = (60 * sr) / (lag * hopLength);
    candidates.push({ bpm, score: autocorr[lagIdx], lag });

    // Yield to main thread every 20 iterations
    if (lagIdx % 20 === 0) {
      const progress = ((lagIdx / autocorr.length) * 100).toFixed(0);
      console.log(` Autocorr ${progress}%: lag=${lag} → ${bpm.toFixed(1)} BPM (corr: ${autocorr[lagIdx].toFixed(4)})`);
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  console.log(`🎯 Finding tempo peaks with musical constraints...`);
  candidates.sort((a, b) => b.score - a.score);
  console.log(`📈 Raw autocorrelation peaks:`);
  for (let i = 0; i < Math.min(10, candidates.length); i++) {
    console.log(` ${i+1}. ${candidates[i].bpm.toFixed(1)} BPM (score: ${candidates[i].score.toFixed(4)})`);
  }

  let bestBpm = 120, bestScore = 0;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].score > bestScore) {
      bestScore = candidates[i].score;
      bestBpm = candidates[i].bpm;
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  console.log(`🎵 Final ranking by RAW autocorrelation only (no boosts):`);
  for (let i = 0; i < Math.min(5, candidates.length); i++) {
    const isWinner = Math.abs(candidates[i].bpm - bestBpm) < 0.1 ? " 👑" : "";
    console.log(` ${i+1}. ${candidates[i].bpm.toFixed(1)} BPM (raw score: ${candidates[i].score.toFixed(4)})${isWinner}`);
  }

  const avgCorr = autocorr.reduce((a, b) => a + b, 0) / autocorr.length;
  const confidence = Math.min(1.0, Math.max(0, (bestScore - avgCorr) / (0.3 + avgCorr * 0.5)));
  console.log(`📊 Confidence calculation: best=${bestScore.toFixed(4)}, avg=${avgCorr.toFixed(4)} → ${(confidence*100).toFixed(1)}%`);

  return {
    bpm: Math.max(tempoConstraints.min, Math.min(tempoConstraints.max, bestBpm)),
    confidence,
    score: bestScore,
    candidates: candidates.slice(0, 10)
  };
}

/**
 * Compute Fourier tempogram for time-varying tempo analysis
 */
async function computeFourierTempogram(onsetEnvelope, sr) {
  const hopLength = 512;
  const winLength = 384;
  const hopFrames = Math.floor(winLength / 4);

  console.log(`🔧 Tempogram setup: winLength=${winLength}, hopFrames=${hopFrames}`);

  const frames = Math.floor((onsetEnvelope.length - winLength) / hopFrames) + 1;
  const tempogram = [];
  const window = new Float32Array(winLength);

  // Create Hann window
  for (let i = 0; i < winLength; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (winLength - 1));
  }

  console.log(`📊 Computing ${frames} tempogram frames...`);

  for (let i = 0; i < frames; i++) {
    const start = i * hopFrames;
    const frame = new Float32Array(winLength);

    for (let j = 0; j < winLength && start + j < onsetEnvelope.length; j++) {
      frame[j] = onsetEnvelope[start + j] * window[j];
    }

    const fftFrame = computeSimpleFFT(frame);
    tempogram.push(fftFrame);

    // Yield to main thread every 10% progress
    if (i % Math.max(1, Math.floor(frames / 10)) === 0) {
      const progress = ((i / frames) * 100).toFixed(0);
      const frameEnergy = frame.reduce((sum, x) => sum + x*x, 0);
      console.log(` Tempogram ${progress}%: frame ${i}/${frames} (energy: ${frameEnergy.toFixed(3)})`);
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  const tempoFreqs = computeTempoFrequencies(sr, hopLength, winLength);
  console.log(`🎼 Tempo frequency range: ${tempoFreqs[1].toFixed(1)}-${tempoFreqs[tempoFreqs.length-1].toFixed(1)} BPM`);

  const tempogramAnalysis = analyzeTempogram(tempogram, tempoFreqs);
  console.log(`📈 Tempogram analysis complete:`);
  console.log(` Dominant frequencies found: ${tempogramAnalysis.peakTempos.length}`);
  console.log(` Total energy: ${tempogramAnalysis.totalEnergy.toFixed(3)}`);
  console.log(` Peak energy ratio: ${(tempogramAnalysis.peakEnergyRatio * 100).toFixed(1)}%`);

  return {
    frames,
    tempogram,
    frequencies: tempoFreqs,
    tempoRange: { min: tempoFreqs[1], max: tempoFreqs[tempoFreqs.length - 1] },
    peakTempos: tempogramAnalysis.peakTempos,
    totalEnergy: tempogramAnalysis.totalEnergy,
    energyDistribution: tempogramAnalysis.energyDistribution
  };
}

/**
 * Compute tempo frequencies for tempogram
 */
function computeTempoFrequencies(sr, hopLength, winLength) {
  const n = Math.floor(winLength / 2) + 1;
  const frequencies = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    frequencies[i] = ((i * sr) / (winLength * hopLength)) * 60.0;
  }
  return frequencies;
}

/**
 * Simple FFT implementation for tempogram
 */
function computeSimpleFFT(signal) {
  const N = signal.length;
  const result = [];
  for (let k = 0; k < N; k++) {
    let real = 0, imag = 0;
    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      real += signal[n] * Math.cos(angle);
      imag += signal[n] * Math.sin(angle);
    }
    result.push({ real, imag });
  }
  return result;
}

/**
 * Analyze tempogram to find dominant tempo peaks
 */
function analyzeTempogram(tempogram, tempoFreqs) {
  if (!tempogram || tempogram.length === 0) {
    console.warn("⚠️ Empty tempogram, skipping analysis");
    return {
      peakTempos: [],
      totalEnergy: 0,
      peakEnergyRatio: 0,
      energyDistribution: { totalEnergy: 0, peakEnergy: 0, peakRatio: 0, numPeaks: 0 },
      magnitudes: []
    };
  }

  const numFrames = tempogram.length;
  const numFreqs = tempogram[0].length;
  const magnitudes = [];
  let totalEnergy = 0;

  for (let i = 0; i < numFrames; i++) {
    const frameMagnitudes = [];
    for (let j = 0; j < numFreqs; j++) {
      const mag = Math.sqrt(tempogram[i][j].real * tempogram[i][j].real + tempogram[i][j].imag * tempogram[i][j].imag);
      frameMagnitudes.push(mag);
      totalEnergy += mag;
    }
    magnitudes.push(frameMagnitudes);
  }

  const avgEnergyPerTempo = new Float32Array(numFreqs);
  for (let j = 0; j < numFreqs; j++) {
    let sum = 0;
    for (let i = 0; i < numFrames; i++) sum += magnitudes[i][j];
    avgEnergyPerTempo[j] = sum / numFrames;
  }

  const tempoPeaks = [];
  for (let j = 1; j < numFreqs - 1; j++) {
    const tempo = tempoFreqs[j];
    if (tempo >= 60 && tempo <= 200) {
      const energy = avgEnergyPerTempo[j];
      const isLocalMax = energy > avgEnergyPerTempo[j-1] && energy > avgEnergyPerTempo[j+1];
      if (isLocalMax && energy > 0.01 * Math.max(...avgEnergyPerTempo)) {
        let frameCount = 0;
        for (let i = 0; i < numFrames; i++) {
          if (magnitudes[i][j] > 0.5 * energy) frameCount++;
        }
        tempoPeaks.push({
          bpm: tempo,
          energy,
          bin: j,
          frameCount,
          prominence: energy / Math.max(...avgEnergyPerTempo)
        });
      }
    }
  }

  tempoPeaks.sort((a, b) => b.energy - a.energy);
  const peakEnergy = tempoPeaks.reduce((sum, peak) => sum + peak.energy, 0);
  const peakEnergyRatio = totalEnergy > 0 ? peakEnergy / totalEnergy : 0;

  return {
    peakTempos: tempoPeaks,
    totalEnergy,
    peakEnergyRatio,
    energyDistribution: {
      totalEnergy,
      peakEnergy,
      peakRatio: peakEnergyRatio,
      numPeaks: tempoPeaks.length
    },
    magnitudes
  };
}

/**
 * Estimate tempo in a constrained window around global tempo
 * Used for checking tempo stability over time
 */
async function estimateConstrainedTempo(audioWindow, sampleRate, globalBpm, windowIndex) {
  const tolerance = 50;
  const minBpm = Math.max(60, globalBpm - tolerance);
  const maxBpm = Math.min(200, globalBpm + tolerance);
  console.log(` [${windowIndex}] WIDE constraint: ${minBpm.toFixed(1)}-${maxBpm.toFixed(1)} BPM (±${tolerance} around global ${globalBpm.toFixed(1)})`);

  const frameSize = 1024;
  const hopSize = 256;
  const onsets = [];
  let totalEnergy = 0;

  for (let i = 0; i < audioWindow.length - frameSize; i += hopSize) {
    let energy = 0;
    for (let j = i; j < i + frameSize && j < audioWindow.length; j++) {
      energy += audioWindow[j] * audioWindow[j];
    }
    const energySqrt = Math.sqrt(energy);
    onsets.push(energySqrt);
    totalEnergy += energySqrt;
  }

  const avgEnergy = totalEnergy / onsets.length;
  console.log(` [${windowIndex}] Onset energy: ${onsets.length} frames, avg=${avgEnergy.toFixed(3)}, max=${Math.max(...onsets).toFixed(3)}`);

  const lagMin = Math.floor(60 * sampleRate / (maxBpm * hopSize));
  const lagMax = Math.floor(60 * sampleRate / (minBpm * hopSize));
  console.log(` [${windowIndex}] Checking lags ${lagMin}-${lagMax} for ALL tempo candidates...`);

  let bestBpm = globalBpm, maxCorr = 0;
  const correlations = [];

  for (let lag = lagMin; lag < Math.min(lagMax, onsets.length / 2); lag++) {
    let corr = 0, normalization = 0;
    for (let i = 0; i < onsets.length - lag; i++) {
      corr += onsets[i] * onsets[i + lag];
      normalization += onsets[i] * onsets[i];
    }
    const normalizedCorr = normalization > 0 ? corr / normalization : 0;
    const candidateBpm = 60 * sampleRate / (lag * hopSize);
    correlations.push({ bpm: candidateBpm, correlation: normalizedCorr, lag });

    if (normalizedCorr > maxCorr && candidateBpm >= minBpm && candidateBpm <= maxBpm) {
      maxCorr = normalizedCorr;
      bestBpm = candidateBpm;
    }
  }

  correlations.sort((a, b) => b.correlation - a.correlation);
  console.log(` [${windowIndex}] Top correlations in window (all candidates):`);
  for (let i = 0; i < Math.min(5, correlations.length); i++) {
    const c = correlations[i];
    const globalMatch = Math.abs(c.bpm - globalBpm) < 10 ? "🎯" : "";
    const selected = Math.abs(c.bpm - bestBpm) < 0.1 ? "👑" : "";
    console.log(` ${c.bpm.toFixed(1)} BPM: ${c.correlation.toFixed(4)} ${globalMatch}${selected}`);
  }
  console.log(` [${windowIndex}] Selected: ${bestBpm.toFixed(1)} BPM (correlation: ${maxCorr.toFixed(4)})`);

  return { bpm: bestBpm, correlation: maxCorr, candidates: correlations.slice(0, 5) };
}

/**
 * Simple spectrum computation for onset detection
 */
function computeSimpleSpectrum(frame) {
  const spectrum = new Float32Array(frame.length / 2);
  for (let k = 0; k < spectrum.length; k++) {
    let real = 0, imag = 0;
    for (let n = 0; n < frame.length; n += 4) {
      const angle = (-2 * Math.PI * k * n) / frame.length;
      real += frame[n] * Math.cos(angle);
      imag += frame[n] * Math.sin(angle);
    }
    spectrum[k] = Math.sqrt(real * real + imag * imag);
  }
  return spectrum;
}

// ===== END LB-STYLE BPM DETECTION HELPER FUNCTIONS =====

// Separate function for detailed audio analysis to avoid blocking UI
function computeAudioFeatures(audioBuffer) {
  try {
    // Only compute features for a portion of the audio to improve performance
    const channel = audioBuffer.getChannelData(0);
    const maxSamples = Math.min(channel.length, audioBuffer.sampleRate * 30); // Max 30 seconds
    const analysisChannel = channel.subarray(0, maxSamples);
    
    // Use smaller frame sizes for faster computation
    const frameSize = 1024;
    const hopSize = 512;
    
    // Compute basic features with optimized parameters
    const rmsValues = computeRMS(analysisChannel, frameSize, hopSize);
    const peakData = computePeak(analysisChannel, frameSize, hopSize);
    
    // Only compute ZCR if needed (it's expensive)
    let zcrValues = new Float32Array(Math.ceil(analysisChannel.length / hopSize));
    let avgZCR = 0;
    
    // Calculate average RMS
    const avgRMS = rmsValues.reduce((sum, val) => sum + val, 0) / rmsValues.length;
    
    // Update analysis results
    if (window.analysisResults) {
      window.analysisResults.dynamics = {
        rms: avgRMS,
        peak: peakData.globalPeak,
        peakPosition: peakData.globalPeakPosition,
        crest: peakData.globalPeak / avgRMS
      };
      
      // Store only essential data to save memory
      window.analysisResults.dynamics.rmsValues = Array.from(rmsValues).filter((_, i) => i % 4 === 0); // Downsample
    }
    
    debugLog('✅ Audio feature extraction complete');
  } catch (error) {
    console.error('❌ Audio feature extraction error:', error);
  }
}

// --- Advanced zero-crossing detection with energy minimization ---
function findNearestZeroCrossing(
  channelData,
  startSample,
  direction = 1,
  maxSearch = 2048,
  options = {}
) {
  const len = channelData.length;
  const defaultOptions = {
    preferLowEnergy: true,    // Prefer zero crossings with lower surrounding energy
    energyWindow: 32,         // Window size for energy calculation
    qualityThreshold: 0.7     // Minimum quality score to accept a crossing
  };
  
  const opts = {...defaultOptions, ...options};
  
  // Early bounds check
  if (startSample < 0) startSample = 0;
  if (startSample >= len) startSample = len - 1;
  
  // First pass: find all zero crossings within search window
  const crossings = [];
  let i = startSample;
  let steps = 0;
  
  while (steps < maxSearch && i > 0 && i < len - 1) {
    // Check for sign change (zero crossing)
    if ((channelData[i] >= 0) !== (channelData[i + 1] >= 0)) {
      crossings.push({
        position: i,
        distance: Math.abs(i - startSample)
      });
    }
    i += direction;
    steps++;
  }
  
  // If no crossings found, return original position
  if (crossings.length === 0) {
    return startSample;
  }
  
  // If we don't care about energy, just return the nearest crossing
  if (!opts.preferLowEnergy) {
    return crossings[0].position;
  }
  
  // Second pass: evaluate crossings by surrounding energy
  const scoredCrossings = crossings.map(crossing => {
    const pos = crossing.position;
    const halfWindow = Math.floor(opts.energyWindow / 2);
    
    // Calculate local energy around the crossing
    let energy = 0;
    let count = 0;
    
    for (let j = Math.max(0, pos - halfWindow); j < Math.min(len, pos + halfWindow); j++) {
      energy += channelData[j] * channelData[j];
      count++;
    }
    
    const avgEnergy = count > 0 ? energy / count : 0;
    
    // Calculate distance penalty (prefer closer crossings)
    const distancePenalty = crossing.distance / maxSearch;
    
    // Final score combines energy and distance (lower is better)
    const score = avgEnergy + distancePenalty;
    
    return {
      position: pos,
      score: score
    };
  });
  
  // Sort by score (lower is better)
  scoredCrossings.sort((a, b) => a.score - b.score);
  
  // Return the best crossing
  return scoredCrossings[0].position;
}

// ===== LOOP DETECTION =====
async function detectLoop() {
  try {
    debugLog('🔍 Running advanced loop detection...')

    // Multi-algorithm approach with fallbacks
    let result;
    let detectionMethod = '';
    let confidence = 0;
    
    // Try the most sophisticated algorithm first
    try {
      if (typeof findPreciseLoop !== 'undefined') {
        debugLog('🔍 Using precise loop detection algorithm...');
        result = await findPreciseLoop(currentAudioBuffer, {
          bpmHint: currentBPM,
          minLoopLength: 1.0, // minimum 1 second
          maxLoopLength: 16.0, // maximum 16 seconds
          zeroCrossingAlignment: true,
          useSpectralSimilarity: true
        });
        detectionMethod = 'precise';
        confidence = result.confidence || 0.85;
      } else {
        throw new Error('Precise loop detection not available');
      }
    } catch (error) {
      console.warn('⚠️ Precise loop detection failed, trying fast algorithm:', error);
      
      // Try fast algorithm as fallback
      try {
        if (typeof fastLoopAnalysis !== 'undefined') {
          debugLog('🔍 Using fast loop detection algorithm...');
          result = await fastLoopAnalysis(currentAudioBuffer, {
            bpmHint: currentBPM,
            sensitivity: 0.8
          });
          detectionMethod = 'fast';
          confidence = result.confidence || 0.7;
        } else {
          throw new Error('Fast loop detection not available');
        }
      } catch (fastError) {
        console.warn('⚠️ Fast loop detection failed, trying musical algorithm:', fastError);
        
        // Try musical algorithm as second fallback
        try {
          if (typeof findMusicalLoop !== 'undefined') {
            debugLog('🔍 Using musical loop detection algorithm...');
            result = await findMusicalLoop(currentAudioBuffer, currentBPM);
            detectionMethod = 'musical';
            confidence = result.confidence || 0.6;
          } else {
            throw new Error('Musical loop detection not available');
          }
        } catch (musicalError) {
          console.error('❌ All loop detection algorithms failed:', musicalError);
          
          // Final fallback to a musically sensible loop based on BPM
          const barDuration = (60 / currentBPM) * 4; // 4 beats per bar
          const loopDuration = Math.min(barDuration * 4, currentAudioBuffer.duration); // Default to 4 bars
          result = {
            loopStart: 0,
            loopEnd: loopDuration
          };
          detectionMethod = 'bpm-based';
          confidence = 0.5;
          debugLog('⚠️ Using fallback BPM-based loop (4 bars)');
        }
      }
    }

    const channel = currentAudioBuffer.getChannelData(0);
    const sr = currentAudioBuffer.sampleRate;

    // Extract boundaries with robust key handling
    let startSec = result?.loopStart ?? result?.start ?? result?.startTime ?? 0;
    let endSec = result?.loopEnd ?? result?.end ?? result?.endTime ?? currentAudioBuffer.duration;

    // Sanity check & musical correction
    if (endSec <= startSec || !Number.isFinite(startSec) || !Number.isFinite(endSec)) {
      console.warn('⚠️ Invalid loop bounds detected, reverting to musical estimation');
      const barDur = (60 / currentBPM) * 4; // 4 beats per bar
      startSec = 0;
      endSec = Math.min(barDur * 4, currentAudioBuffer.duration); // 4 bars or full track
    }
    
    // Musical quantization - try to snap to bar boundaries if close
    if (detectionMethod !== 'musical' && detectionMethod !== 'bpm-based') {
      const beatDur = 60 / currentBPM;
      const barDur = beatDur * 4;
      
      // Check if loop length is close to a whole number of bars (within 10%)
      const loopDur = endSec - startSec;
      const barsApprox = loopDur / barDur;
      const wholeBars = Math.round(barsApprox);
      
      if (Math.abs(barsApprox - wholeBars) < 0.1) {
        debugLog(`🎵 Quantizing loop to ${wholeBars} bar${wholeBars !== 1 ? 's' : ''}`);
        // Keep start point, adjust end to match whole bars
        endSec = startSec + (wholeBars * barDur);
        
        // Make sure we don't exceed audio length
        if (endSec > currentAudioBuffer.duration) {
          endSec = currentAudioBuffer.duration;
        }
      }
    }

    // Use dynamic zero crossing for cleaner transitions.
    // (Wave 3 fix: DynamicZeroCrossing is an all-static class — the old
    // `new DynamicZeroCrossing(...)` + `dzc.findOptimalCrossing(...)` calls
    // targeted an API that never existed and threw at runtime.)
    let [startSample, endSample] = DynamicZeroCrossing.snap(
      channel,
      Math.floor(startSec * sr),
      Math.floor(endSec * sr),
      2048,
    );

    /* --- Advanced onset alignment: find strongest transient near start --- */
    try {
      const beatDur = 60 / currentBPM; // seconds per beat
      const lookAhead = Math.min(0.5 * beatDur, 0.5); // cap at 0.5s
      const searchSamples = Math.floor(lookAhead * sr);
      
      // Use RMS energy with smaller windows for better precision
      const hop = 256;
      const frame = 512;
      const seg = channel.subarray(startSample, startSample + searchSamples);
      
      // Compute energy and its derivative
      const energyValues = [];
      let prevRms = 0;
      let maxDiff = 0;
      let maxIdx = 0;
      
      for (let i = 0; i + frame < seg.length; i += hop) {
        const rms = Math.sqrt(
          seg.subarray(i, i + frame).reduce((s, v) => s + v * v, 0) / frame
        );
        energyValues.push(rms);
        
        const diff = Math.max(0, rms - prevRms);
        if (diff > maxDiff) {
          maxDiff = diff;
          maxIdx = i;
        }
        prevRms = rms;
      }
      
      // Only adjust if we found a significant onset
      if (maxIdx > hop && maxDiff > 0.05) {
        const onsetSample = startSample + maxIdx;
        startSample = DynamicZeroCrossing.findNearestZeroCrossing(
          channel,
          onsetSample,
          1024,
        ).sample;
        debugLog(`🎯 Start aligned to onset @ ${(startSample / sr).toFixed(3)}s`);
      }
    } catch (e) {
      console.warn('⚠️ Onset alignment skipped:', e);
    }

    // Set the loop boundaries
    currentLoop = {
      start: startSample / channel.length,
      end: endSample / channel.length,
    };

    // Update UI
    updateLoopInfo();
    drawWaveform();

    debugLog(
      `✅ Loop detected using ${detectionMethod} algorithm: ${(startSample / sr).toFixed(3)}s – ${(endSample / sr).toFixed(3)}s`,
      `(confidence: ${confidence.toFixed(2)})`
    );
    
    // Store loop info in analysis results
    if (window.analysisResults) {
      window.analysisResults.loop = {
        startSec: startSample / sr,
        endSec: endSample / sr,
        durationSec: (endSample - startSample) / sr,
        confidence: confidence,
        method: detectionMethod
      };
    }
    
  } catch (error) {
    console.error('❌ Loop detection error:', error);
    showError(`Loop detection failed: ${error.message}`);
  }
}

// ===== WAVEFORM VISUALIZATION =====
function drawWaveform() {
  const canvas = document.getElementById('waveformCanvas')
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  // Clear canvas
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
  ctx.fillRect(0, 0, width, height)

  if (!currentAudioBuffer) return

  const audioData = currentAudioBuffer.getChannelData(0)
  const samplesPerPixel = Math.ceil(audioData.length / width)

  // Draw waveform
  ctx.strokeStyle = '#00ff88'
  ctx.lineWidth = 1
  ctx.beginPath()

  for (let x = 0; x < width; x++) {
    let max = -1
    let min = 1

    // Sample audio data for this pixel
    const startSample = x * samplesPerPixel
    const endSample = Math.min(startSample + samplesPerPixel, audioData.length)

    for (let i = startSample; i < endSample; i++) {
      const sample = audioData[i]
      if (sample > max) max = sample
      if (sample < min) min = sample
    }

    // Convert to screen coordinates
    const yMax = ((1 - max) * height) / 2
    const yMin = ((1 - min) * height) / 2

    if (x === 0) {
      ctx.moveTo(x, height / 2)
    }

    // Draw vertical line from min to max
    ctx.moveTo(x, yMax)
    ctx.lineTo(x, yMin)
  }
  ctx.stroke()

  // Draw loop region
  const startX = currentLoop.start * width
  const endX = currentLoop.end * width

  ctx.fillStyle = 'rgba(255, 215, 0, 0.15)'
  ctx.fillRect(startX, 0, endX - startX, height)

  // Loop markers
  ctx.strokeStyle = '#ffd700'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(startX, 0)
  ctx.lineTo(startX, height)
  ctx.moveTo(endX, 0)
  ctx.lineTo(endX, height)
  ctx.stroke()

  // Draw playhead if playing
  if (isPlaying) {
    drawPlayhead(ctx, width, height)
  }
}

function drawPlayhead(ctx, width, height) {
  if (!currentAudioBuffer || !isPlaying) return

  const currentTime = audioContext.currentTime
  const elapsed = currentTime - playheadStartTime

  const loopStartSec = currentLoop.start * currentAudioBuffer.duration
  const loopEndSec = currentLoop.end * currentAudioBuffer.duration
  const loopDuration = loopEndSec - loopStartSec

  const positionInLoop = elapsed % loopDuration
  const currentPosition = loopStartSec + positionInLoop

  const normalizedPosition = currentPosition / currentAudioBuffer.duration
  const playheadX = normalizedPosition * width

  // Draw playhead
  ctx.strokeStyle = '#ff4444'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(playheadX, 0)
  ctx.lineTo(playheadX, height)
  ctx.stroke()

  // Playhead marker
  ctx.fillStyle = '#ff4444'
  ctx.beginPath()
  ctx.moveTo(playheadX, 0)
  ctx.lineTo(playheadX - 5, 10)
  ctx.lineTo(playheadX + 5, 10)
  ctx.closePath()
  ctx.fill()
}

// ===== PLAYBACK CONTROLS =====
async function playAudio() {
  debugLog('🎮 Play button clicked')

  if (!currentAudioBuffer) {
    debugLog('❌ No audio buffer loaded')
    alert('Please load an audio file first!')
    return
  }

  if (isPlaying) {
    debugLog('🎮 Already playing, stopping first')
    stopAudio()
    return
  }

  try {
    debugLog('🎮 Starting playback...')

    if (audioContext.state === 'suspended') {
      debugLog('🎮 Resuming suspended audio context')
      await audioContext.resume()
    }
    // ===== DEBUG: confirm context state =====
    debugLog('Context state after resume:', audioContext.state) // expect "running"
    // ========================================

    currentSource = audioContext.createBufferSource()
    currentSource.buffer = currentAudioBuffer

    // Add gain node for volume control and debugging
    const gainNode = audioContext.createGain()
    gainNode.gain.value = 0.5 // 50% volume

    currentSource.connect(gainNode)
    gainNode.connect(audioContext.destination)
    // ===== DEBUG: peak meter =====
    const analyser = audioContext.createAnalyser()
    gainNode.connect(analyser)
    const debugInterval = setInterval(() => {
      const data = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(data)
      const peak = Math.max(...data) // 128 = silence, >128 => signal
      debugLog('peak', peak)
    }, 250)
    // ========================================
    currentSource.loop = true

    debugLog(`🎮 Audio context state: ${audioContext.state}`)
    debugLog(
      `🎮 Audio context destination: ${audioContext.destination.channelCount} channels`,
    )

    // If loop bounds are invalid, default to full track
    if (currentLoop.end <= currentLoop.start) {
      console.warn('⚠️ Invalid loop bounds detected, resetting to full track')
      currentLoop = { start: 0, end: 1 }
    }

    const startTime = currentLoop.start * currentAudioBuffer.duration
    const endTime = currentLoop.end * currentAudioBuffer.duration

    debugLog(`🎮 Loop: ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`)

    currentSource.loopStart = startTime
    currentSource.loopEnd = endTime
    currentSource.start(0, startTime)

    debugLog('🎮 Audio source started')

    isPlaying = true
    playheadStartTime = audioContext.currentTime
    startPlayheadAnimation()
    startTimelineAnimation()
    startBeatVisualization()
    document.getElementById('playBtn').textContent = '⏸️ Pause'
  } catch (error) {
    console.error('Playback error:', error)
    showError(`Playback error: ${error.message}`)
  }
}

function stopAudio() {
  if (currentSource) {
    try {
      currentSource.stop()
    } catch (error) {
      // Source may already be stopped
    }
    currentSource = null
  }
  isPlaying = false
  // ===== DEBUG: clear peak meter =====
  if (typeof debugInterval !== 'undefined') {
    clearInterval(debugInterval)
  }
  // ===================================
  stopPlayheadAnimation()
  stopBeatVisualization()
  document.getElementById('playBtn').textContent = '▶️ Play'
}

// ===== LOOP MANIPULATION =====
function halfLoop() {
  const duration = currentLoop.end - currentLoop.start
  const newDuration = duration / 2

  if (currentAudioBuffer && newDuration * currentAudioBuffer.duration < 0.05) {
    debugLog('Cannot halve - loop too small')
    return
  }

  currentLoop.end = currentLoop.start + newDuration
  updateLoopInfo()
  drawWaveform()

  if (isPlaying) {
    stopAudio()
    setTimeout(playAudio, 50)
  }
}

function doubleLoop() {
  const duration = currentLoop.end - currentLoop.start
  const newEnd = currentLoop.start + duration * 2

  if (newEnd > 1) {
    debugLog('Cannot double - exceeds track length')
    return
  }

  currentLoop.end = newEnd
  updateLoopInfo()
  drawWaveform()

  if (isPlaying) {
    stopAudio()
    setTimeout(playAudio, 50)
  }
}

function moveForward() {
  const duration = currentLoop.end - currentLoop.start

  if (currentLoop.end + duration > 1) {
    debugLog('Cannot move forward - not enough space')
    return
  }

  currentLoop.start += duration
  currentLoop.end += duration

  updateLoopInfo()
  drawWaveform()

  if (isPlaying) {
    stopAudio()
    setTimeout(playAudio, 50)
  }
}

function resetLoop() {
  currentLoop = { start: 0, end: 1 }
  updateLoopInfo()
  drawWaveform()

  if (isPlaying) {
    stopAudio()
    setTimeout(playAudio, 50)
  }
}

async function reverseLoopSection() {
  if (!currentAudioBuffer) {
    alert('No audio loaded!')
    return
  }

  const reversedBuffer = reverseAudioLoop(currentAudioBuffer, currentLoop)
  currentAudioBuffer = reversedBuffer

  drawWaveform()

  // Re-run BPM analysis since waveform changed
  console.log('🔄 Waveform modified - re-analyzing BPM...');
  await analyzeAudio();

  if (isPlaying) {
    stopAudio()
    setTimeout(playAudio, 50)
  }
}

function reverseAudioLoop(audioBuffer, loopBounds) {
  const newBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate,
  )

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel)
    const newData = newBuffer.getChannelData(channel)

    // Copy original data
    newData.set(originalData)

    // Calculate loop boundaries in samples
    const loopStartSample = Math.floor(loopBounds.start * audioBuffer.length)
    const loopEndSample = Math.floor(loopBounds.end * audioBuffer.length)
    const loopLength = loopEndSample - loopStartSample

    // Reverse just the loop section
    for (let i = 0; i < loopLength; i++) {
      const originalIndex = loopStartSample + i
      const reversedIndex = loopStartSample + (loopLength - 1 - i)
      newData[originalIndex] = originalData[reversedIndex]
    }
  }

  return newBuffer
}

function resetPlayhead() {
  currentLoop = { start: 0, end: 1 }
  updateLoopInfo()
  drawWaveform()

  if (isPlaying) {
    stopAudio()
    setTimeout(playAudio, 50)
  }
}

// ===== UI UPDATES =====
function updateTrackInfo(name, status) {
  document.getElementById('trackName').textContent = name
  document.getElementById('trackStatus').textContent = status
}

function updateLoopInfo() {
  if (!currentAudioBuffer) return

  const startTime = currentLoop.start * currentAudioBuffer.duration
  const endTime = currentLoop.end * currentAudioBuffer.duration
  const duration = endTime - startTime

  const reverseBtn = document.getElementById('reverseLoopBtn')

  let loopText
  if (currentLoop.start === 0 && currentLoop.end === 1) {
    loopText = 'Full Track'
    if (reverseBtn) reverseBtn.disabled = true
  } else {
    if (reverseBtn) reverseBtn.disabled = false
    // Calculate musical division if we have BPM
    if (currentBPM > 0) {
      const beatDuration = 60 / currentBPM
      const barDuration = beatDuration * 4
      const bars = duration / barDuration

      if (Math.abs(bars - Math.round(bars)) < 0.1) {
        loopText = `${Math.round(bars)} bar${Math.round(bars) !== 1 ? 's' : ''}`
      } else {
        loopText = `${duration.toFixed(2)}s`
      }
    } else {
      loopText = `${duration.toFixed(2)}s`
    }

    loopText += ` (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s)`
  }

  document.getElementById('loopInfo').textContent = loopText
}

// ===== ANIMATION =====
function startPlayheadAnimation() {
  function animate() {
    if (isPlaying && currentAudioBuffer) {
      drawWaveform()
      playheadAnimationId = requestAnimationFrame(animate)
    }
  }
  playheadAnimationId = requestAnimationFrame(animate)
}

function stopPlayheadAnimation() {
  if (playheadAnimationId) {
    cancelAnimationFrame(playheadAnimationId)
    playheadAnimationId = null
  }
  if (currentAudioBuffer) {
    drawWaveform()
  }
}

function startTimelineAnimation() {
  if (!currentAudioBuffer) return

  const loopDuration =
    (currentLoop.end - currentLoop.start) * currentAudioBuffer.duration
  const timelineHand = document.getElementById('timelineHand')

  // Reset position
  timelineHand.style.transform = 'translate(-50%, -100%) rotate(0deg)'

  const startTime = Date.now()

  function animateTimeline() {
    if (!isPlaying) return

    const elapsed = (Date.now() - startTime) / 1000
    const progress = (elapsed % loopDuration) / loopDuration
    const rotation = progress * 360

    timelineHand.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`

    requestAnimationFrame(animateTimeline)
  }

  requestAnimationFrame(animateTimeline)
}

// ===== BEAT VISUALIZATION =====
function startBeatVisualization() {
  if (!currentAudioBuffer || currentBPM <= 0) return
  const beatDur = 60 / currentBPM // seconds
  const bpmEl = document.getElementById('bpmValue')
  let lastBeatCtxTime = audioContext.currentTime

  function animateBeat() {
    if (!isPlaying) return
    const ctxTime = audioContext.currentTime
    const beatsElapsed = Math.floor((ctxTime - lastBeatCtxTime) / beatDur)
    if (beatsElapsed >= 1) {
      lastBeatCtxTime += beatsElapsed * beatDur
      // Trigger pulse
      bpmEl.classList.add('beat-pulse')
      setTimeout(() => bpmEl.classList.remove('beat-pulse'), 100)
    }
    requestAnimationFrame(animateBeat)
  }
  requestAnimationFrame(animateBeat)
}

function stopBeatVisualization() {
  // Remove any active pulse
  const bpmValueElement = document.getElementById('bpmValue')
  bpmValueElement.classList.remove('beat-pulse')
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault()
    if (isPlaying) {
      stopAudio()
    } else {
      playAudio()
    }
  } else if (e.code === 'KeyL') {
    detectLoop()
  } else if (e.code === 'KeyH') {
    halfLoop()
  } else if (e.code === 'KeyD') {
    doubleLoop()
  } else if (e.code === 'KeyR') {
    resetLoop()
  } else if (e.code === 'ArrowRight') {
    moveForward()
  }
})

// ===== DRAG AND DROP =====
const dropZone = document.body

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  e.stopPropagation()
  dropZone.style.opacity = '0.8'
})

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault()
  e.stopPropagation()
  dropZone.style.opacity = '1'
})

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault()
  e.stopPropagation()
  dropZone.style.opacity = '1'

  const files = Array.from(e.dataTransfer.files)
  const audioFile = files.find((file) => file.type.startsWith('audio/'))

  if (audioFile) {
    try {
      debugLog(`📥 Loading dropped file: ${audioFile.name}`)
      updateTrackInfo(audioFile.name, 'Loading...')

      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)()
        beatTracker = new BeatTracker()
      }

      // Use the loadFile utility from xa-file.js
      currentAudioBuffer = await loadFile(audioFile, audioContext)

      updateTrackInfo(
        audioFile.name,
        `${currentAudioBuffer.duration.toFixed(1)}s`,
      )
      document.getElementById('audioFormat').textContent =
        `${currentAudioBuffer.sampleRate}Hz / ${currentAudioBuffer.numberOfChannels}ch`

      await analyzeAudio()
      drawWaveform()

      debugLog('✅ Dropped file loaded successfully')
    } catch (error) {
      console.error('❌ Error loading dropped file:', error)
      showError(`Failed to load ${audioFile.name}: ${error.message}`)
    }
  } else {
    showError('Please drop an audio file')
  }
})

// ===== ADVANCED FEATURES =====

// Add spectral visualization (optional)
function drawSpectrum() {
  if (!currentAudioBuffer) return

  const audioData = currentAudioBuffer.getChannelData(0)
  const sampleRate = currentAudioBuffer.sampleRate

  // Get spectral features at current playhead position if playing
  if (isPlaying && window.analysisResults) {
    const currentTime = audioContext.currentTime - playheadStartTime
    const frame = Math.floor((currentTime * sampleRate) / 512)

    if (window.analysisResults.spectral.centroid.centroids[frame]) {
      const centroid = window.analysisResults.spectral.centroid.centroids[frame]
      // Update UI with current spectral info
    }
  }
}

function exampleFunction() {
  if (isPlaying && window.analysisResults) {
    const currentTime = audioContext.currentTime - playheadStartTime;
    const frame = Math.floor((currentTime * sampleRate) / 512);

    if (window.analysisResults.spectral.centroid.centroids[frame]) {
      const centroid = window.analysisResults.spectral.centroid.centroids[frame];
      // Update UI with current spectral info
    }
  }
}