// ===== CORE IMPORTS =====
// Main audio player and file handling
import { loadFile } from './xa-file.js'

// Advanced BPM Detection
import { detectBPM } from './analysis/BPMDetector.ts'
import { fastBPMDetect } from './xa-beat.js'

// Advanced beat tracking with phase detection
import { BeatTracker } from './xa-beat-tracker.js'
import { enqueueToast } from './ui/toastQueue.js'

import { debugLog } from './debug.js'

// Onset detection for transients

// Spectral features with RMS energy
// import {
//   spectralCentroid,
//   spectralRolloff,
//   spectralBandwidth,
//   zeroCrossingRate,
//   rms,
// } from './xa-spectral.js' // Commented out as unused per task warning

// Chroma features for harmonic analysis
import { chroma_stft, enhance_chroma } from './xa-chroma.js'

// Loop detection algorithms
import { fastLoopAnalysis } from './xa-loop.js'
import { findPreciseLoop } from './xa-precise-loop.js'
import { findMusicalLoop, findDownbeatPhase } from './xa-downbeat.js'
import { warnIfNoMp3Support } from './xa-util.js'

// Audio utilities
import {
  computeRMS,
  computePeak,
  computeZeroCrossingRate,
} from './xa-audio-features.js'

// Dynamic zero crossing for clean loops
import { DynamicZeroCrossing } from './dynamic-zero-crossing.js'

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
        loadSampleFile(`/src/assets/audio/${btn.dataset.sample}`, btn.textContent)
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
    debugLog('🔍 Starting BPM detection...');

    // Use fast BPM detection for real-time performance
    debugLog('🥁 Detecting BPM...');
    let bpm;
    let confidence = 0.8;
    
    // Use Web Worker for BPM detection if browser supports it
    if (window.Worker && typeof fastBPMDetect !== 'undefined') {
      try {
        // Quick BPM estimation on main thread for immediate feedback
        const quickResult = fastBPMDetect(currentAudioBuffer, {
          minBPM: 60,
          maxBPM: 180,
          windowSize: 4096,  // Larger window for faster processing
          hopSize: 1024,     // Larger hop for faster processing
          highSensitivity: false
        });
        
        // Show initial BPM while more accurate analysis runs
        bpm = quickResult.bpm;
        document.getElementById('bpmValue').textContent = bpm.toFixed(1);
        
        // Perform more detailed analysis for spectral features
        // This is done in a separate function to avoid blocking the UI
        setTimeout(() => {
          computeAudioFeatures(currentAudioBuffer);
        }, 100);
        
      } catch (error) {
        console.error('❌ Quick BPM detection failed:', error);
        bpm = 120; // Fallback
      }
    } else {
      // Fallback for browsers without Web Worker support
      try {
        if (typeof fastBPMDetect !== 'undefined') {
          const result = fastBPMDetect(currentAudioBuffer, {
            minBPM: 60,
            maxBPM: 180
          });
          bpm = result.bpm;
          confidence = result.confidence || confidence;
        } else {
          throw new Error('BPM detection not available');
        }
      } catch (error) {
        console.error('❌ BPM detection failed:', error);
        bpm = 120; // Fallback
        confidence = 0.5;
      }
    }

    // Simple sanity correction for extreme values
    if (bpm > 160) {
      bpm = bpm / 2;
    } else if (bpm < 55) {
      bpm = bpm * 2;
    }

    currentBPM = bpm;
    document.getElementById('bpmValue').textContent = currentBPM.toFixed(1);
    
    // Initialize beat tracker with detected tempo
    if (beatTracker) {
      beatTracker.setTempo(currentBPM);
    }
    
    // Create minimal initial analysis results
    window.analysisResults = {
      tempo: { bpm: currentBPM, confidence: confidence },
      beats: { beat_times: [] },
      spectral: {
        centroid: { centroid: 0, centroids: [] },
        rolloff: { rolloff: 0, rolloffs: [] }
      }
    };
    
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

    // Use dynamic zero crossing for cleaner transitions
    const dzc = new DynamicZeroCrossing(channel, sr);
    
    // Find optimal zero crossings near the boundaries
    let startSample = dzc.findOptimalCrossing(Math.floor(startSec * sr), {
      direction: 1,
      maxSearch: 2048,
      preferLowEnergy: true
    });
    
    let endSample = dzc.findOptimalCrossing(Math.floor(endSec * sr), {
      direction: -1,
      maxSearch: 2048,
      preferLowEnergy: true
    });

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
        startSample = dzc.findOptimalCrossing(onsetSample, {
          direction: 1,
          maxSearch: 1024,
          preferLowEnergy: false
        });
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

function reverseLoopSection() {
  if (!currentAudioBuffer) {
    alert('No audio loaded!')
    return
  }

  const reversedBuffer = reverseAudioLoop(currentAudioBuffer, currentLoop)
  currentAudioBuffer = reversedBuffer

  drawWaveform()

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