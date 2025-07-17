/**
 * Pleco-XA: Professional Audio Analysis Toolkit
 * Designed for audio engineers and developers, Pleco-XA provides advanced tools for analyzing, processing, and visualizing audio data.
 * Core audio processing features (no UI components)
 */

// Core audio analysis modules
export { BPMDetector } from './scripts/analysis/BPMDetector.ts'
export { LoopAnalyzer } from './scripts/analysis/LoopAnalyzer.ts'
export { WaveformData } from './scripts/analysis/WaveformData.ts'

// Audio playback and control
export { AudioPlayer } from './scripts/analysis/AudioPlayer.ts'
export { LoopController } from './scripts/loop-controller.js'

// Visualization components
export { WaveformRenderer } from './scripts/WaveformRenderer.js'
export { SpectrumAnalyzer } from './scripts/SpectrumAnalyzer.js'

// Utility functions
// Export the main PlecoXA class, which provides core audio analysis and processing features, making it the primary export for npm consumers
export { PlecoXA } from './scripts/pleco-xa.js'

export { startBeatGlitch, GibClock } from './core/index.js'
