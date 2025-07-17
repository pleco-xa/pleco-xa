/**
 * Pleco-XA: Professional Audio Analysis Toolkit
 * Designed for audio engineers and developers, Pleco-XA provides advanced tools for analyzing, processing, and visualizing audio data.
 * Core audio processing features (no UI components)
 */

 // Core audio analysis modules
export { BPMDetector } from './analysis/BPMDetector.ts'
export { LoopAnalyzer } from './analysis/LoopAnalyzer.ts'
export { WaveformData } from './analysis/WaveformData.ts'

 // Audio playback and control
export { AudioPlayer } from './analysis/AudioPlayer.ts'
export { LoopController } from './loop-controller.js'

 // Visualization components
export { WaveformRenderer } from './WaveformRenderer.js'
export { SpectrumAnalyzer } from './SpectrumAnalyzer.js'

 // Utility functions
 // Export the main PlecoXA class, which provides core audio analysis and processing features, making it the primary export for npm consumers
export { PlecoXA } from './pleco-xa.js'
