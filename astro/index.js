/**
 * Pleco Xa - Astro Components
 * Entry point for Astro-specific exports
 */

// Export Astro components (these will be .astro files)
export { default as PlecoAnalyzer } from '../src/components/PlecoAnalyzer.astro'
export { default as WaveformEditor } from '../src/components/WaveformEditor.astro'
export { default as BPMDetector } from '../src/components/BPMDetector.astro'
// Avoid name collision with LoopPlayer class exported from src
export { default as LoopPlayerComponent } from '../src/components/LoopPlayer.astro'

// Re-export core functions for convenience
export * from '../src/index.js'
