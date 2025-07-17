/**
 * Librosa Complete Module
 * Comprehensive JavaScript port of librosa for web-based audio analysis
 *
 * This module provides a complete audio analysis toolkit by combining
 * all the individual librosa modules into one unified interface.
 *
 * @author Pleco-XA Audio Analysis Suite
 * @version 1.0.0
 */

// ============= CORE FFT AND SPECTRAL ANALYSIS =============
export * from './xa-fft.js'

// ============= MEL-SCALE AND MFCC FEATURES =============
export * from './xa-mel.js'

// ============= AUDIO UTILITIES =============
export * from '../utils/audio-utils.js'

// ============= SPECTRAL FEATURES =============
export * from './xa-spectral.js'

// ============= CHROMA AND HARMONIC ANALYSIS =============
export * from './xa-chroma.js'

// ============= BEAT AND TEMPO DETECTION =============
export * from './xa-beat.js'

// ============= ADVANCED PROCESSING =============
export * from './xa-advanced.js'

// ============= UTILITY FUNCTIONS =============
export * from './xa-util.js'

// ============= ONSET DETECTION =============
export * from './xa-onset.js'

// ============= TEMPORAL ANALYSIS =============
export * from './xa-temporal.js'

// ============= PATTERN MATCHING =============
export * from './xa-matching.js'

// ============= MUSICAL INTERVALS =============
export * from './xa-intervals.js'

// ============= FILE UTILITIES =============
export * from './xa-file.js'

// ============= WEB AUDIO ANALYSIS CLASS =============
export {
  AudioAnalyzer,
  createAudioAnalyzer,
  getMicrophoneSource,
  quickAnalyze,
} from './audio-analyzer.js'

// Default export
import { AudioAnalyzer } from './audio-analyzer.js'
export default new AudioAnalyzer()
