# Pleco-XA Documentation

## Overview

This documentation covers the comprehensive audio manipulation and analysis system developed for Pleco-XA, focusing on the advanced features implemented during the recent development session.

## Documentation Structure

### 📖 **[Audio Manipulation Features](./AUDIO_MANIPULATION_FEATURES.md)**
Detailed documentation of the sophisticated audio processing capabilities:
- **Half-Speed Processing:** Linear interpolation time-stretching within loop boundaries
- **Double-Speed Processing:** Content compression with quantized timing preservation  
- **Nudge System:** Advanced three-state toggle system for audio segment exploration
- **Implementation Details:** Web Audio API buffer manipulation and state management

### 🎛️ **[Button Actions Reference](./BUTTON_ACTIONS_REFERENCE.md)**
Comprehensive guide to all interactive controls and their implementations:
- **Core Audio Controls:** Play, stop, loop detection, and boundary manipulation
- **Advanced Processing:** Half-speed, nudge, reverse, and randomization features
- **File Architecture:** Component locations and function implementations
- **Technology Stack:** Web Audio API usage patterns and browser integration

### 🌊 **[Waveform Visualization System](./WAVEFORM_VISUALIZATION_SYSTEM.md)**
Complete guide to the visual audio representation system:
- **Waveform Rendering:** Canvas-based audio visualization with real-time updates
- **Playhead Animation:** 60fps position tracking synchronized with Web Audio API
- **Loop Boundary Display:** Interactive visual editing of loop start/end points
- **Performance Optimization:** Efficient canvas management and selective redrawing

### 🔬 **[Spectral Loop Detection](./SPECTRAL_LOOP_DETECTION.md)**
In-depth analysis of the sophisticated loop detection algorithms:
- **Recurrence Matrix Analysis:** Core algorithm using chroma features and time-delay embedding
- **FFT Implementation:** Custom frequency domain transformation for harmonic analysis
- **Spectral Features:** Advanced audio feature extraction for musical pattern recognition
- **Algorithm Performance:** Computational complexity analysis and optimization strategies

### 🏗️ **[System Architecture](./SYSTEM_ARCHITECTURE.md)**
High-level overview of the complete system design:
- **Component Architecture:** Astro framework integration with client-side audio processing
- **Data Flow Patterns:** From user interaction to audio manipulation to visual feedback
- **State Management:** Global audio state coordination and synchronization
- **Performance Strategies:** Memory management, canvas optimization, and browser compatibility

## Technology Stack

### Core Technologies
- **Framework:** Astro (Static Site Generation + Client-side JavaScript)
- **Audio Processing:** Web Audio API (Native Browser Implementation)
- **Visualization:** HTML5 Canvas 2D Context
- **Language:** JavaScript ES6+ with modern browser features

### Key Technical Decisions
- **No WASM:** All audio processing uses native Web Audio API for optimal browser integration
- **No External Libraries:** Custom FFT and spectral analysis implementations for full control
- **Client-Side Only:** No server-side audio processing, ensuring privacy and performance
- **Real-Time Capable:** Sub-50ms processing latency for live audio manipulation

## Quick Start Guide

### Basic Usage
1. **Load Audio:** Use file input to load an audio file
2. **Detect Loop:** Click "🔍 Detect Loop" for automatic loop boundary detection
3. **Manipulate Audio:** Use various buttons for half-speed, nudge, reverse, etc.
4. **Visual Feedback:** Observe waveform updates and toast notifications

### Advanced Features
- **Half-Speed Processing:** `⏬ Half Speed` applies sophisticated time-stretching
- **Nudge System:** `↔️ Nudge` cycles through first half → second half → full loop
- **Smart Randomization:** `🎲 Smart Random` applies intelligent loop variations
- **Interactive Editing:** Click and drag waveform boundaries for precise control

## Development History

### Key Bug Fixes Implemented
1. **Playhead Looping:** Fixed audio freezing after 1 second by enabling `currentSource.loop = true`
2. **Move Forward Logic:** Changed from random jumps to predictable duration-based movement
3. **Nudge State Management:** Implemented sophisticated state tracking for reverse compatibility
4. **Client-Side Module Access:** Fixed Astro component integration with dynamic imports

### Performance Optimizations
- **Linear Interpolation:** Smooth time-stretching without artifacts
- **In-Place Buffer Modification:** Memory-efficient audio processing
- **Selective Canvas Redrawing:** Optimized visual updates
- **State Synchronization:** Efficient coordination between audio and visual systems

## Code Quality Standards

### Implementation Principles
- **Web Audio API First:** Native browser capabilities over external libraries
- **Performance Focused:** Real-time processing with minimal latency
- **Error Resilient:** Graceful handling of edge cases and invalid states
- **User Experience:** Immediate feedback through toast notifications and visual updates

### Testing Coverage
- **Unit Tests:** Core audio processing functions
- **Integration Tests:** Button actions and state management
- **Performance Tests:** Processing latency and memory usage
- **Browser Compatibility:** Cross-platform audio functionality

## Future Enhancement Opportunities

### Technical Improvements
- **Web Workers:** Offload heavy processing to background threads
- **Advanced Time-Stretching:** Phase vocoder implementation for higher quality
- **Machine Learning:** Neural network-based loop detection
- **Real-Time Input:** Live audio stream processing capabilities

### User Experience Enhancements
- **Multi-Track Support:** Simultaneous processing of multiple audio files
- **Preset Management:** Save and load processing configurations
- **Export Functionality:** Download processed audio files
- **Mobile Optimization:** Touch-friendly interface adaptations

## Contributing Guidelines

### Development Workflow
1. **Read Documentation:** Understand the architecture and existing patterns
2. **Follow Conventions:** Use established code patterns and naming conventions
3. **Test Thoroughly:** Ensure audio processing works across different browsers
4. **Document Changes:** Update relevant documentation files for new features

### Code Standards
- **ES6+ JavaScript:** Modern language features with browser compatibility
- **Web Audio API:** Prefer native audio capabilities over external libraries
- **Performance First:** Optimize for real-time audio processing requirements
- **Error Handling:** Implement robust error handling with user-friendly feedback

## Version History

### Version 1.0.9 (Current)
- Complete audio manipulation feature set
- Advanced nudge system with state management
- Sophisticated spectral loop detection
- Comprehensive documentation suite
- Performance optimizations and bug fixes

### Previous Versions
- Version 1.0.8: Basic loop detection and manipulation
- Version 1.0.7: Waveform visualization implementation
- Version 1.0.6: Core Web Audio API integration

---

*Last Updated: January 2025*
*Documentation Version: 1.0.0*
*System Version: 1.0.9*