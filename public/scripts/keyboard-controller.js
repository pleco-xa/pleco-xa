// Keyboard shortcut controller for Pleco-XA
import { detectLoop } from '../core/index.js';
import { enqueueToast } from './ui/toastQueue.js';
import { applyQuantumOp } from './audio-ops-extended.js';
import { allPresets } from './beat-presets.js';

class KeyboardController {
  constructor() {
    this.sustainMode = false; // false = toggle mode, true = sustain mode
    this.activeEffects = new Set(); // Track which effects are currently active
    this.keysPressed = new Set(); // Track which keys are currently pressed
    this.currentPresetIndex = 0; // Current preset in the cycle
    this.beatPlaying = false; // Track if beat pattern is playing
    this.beatInterval = null; // Store beat interval
    this.relatchBuffer = null; // For Y key relatch functionality
    this.undoStack = []; // Buffer history for undo
    this.maxUndoSteps = 20; // Max undo history

    // Phaser parameters (adjustable)
    this.phaserParams = {
      wetMix: 0.9,
      minDelay: 0.0005,
      maxDelay: 0.005
    };

    this.keyMappings = {
      // Audio Effects
      'p': { name: 'phase', description: 'Phaser Effect' },
      'k': { name: 'fractal', description: 'Fractal Echo' },
      'l': { name: 'silence', description: 'Silence/Rest' },
      'o': { name: 'stutter', description: 'Stutter Micro-Repeat' },

      // Phaser Controls
      '[': { name: 'phaserDepthDown', description: 'Phaser Depth -' },
      ']': { name: 'phaserDepthUp', description: 'Phaser Depth +' },
      ';': { name: 'phaserRangeDown', description: 'Phaser Range -' },
      "'": { name: 'phaserRangeUp', description: 'Phaser Range +' },

      // Undo/Reset
      'r': { name: 'undo', description: 'Undo Last Effect' },

      // Navigation
      ',': { name: 'prevPreset', description: 'Previous Beat Preset' },
      '.': { name: 'nextPreset', description: 'Next Beat Preset' },

      // Control
      'm': { name: 'beatToggle', description: 'Play/Stop Beat Pattern' },
      'y': { name: 'relatch', description: 'Relatch Audio Effects' }
    };
    
    this.init();
  }
  
  init() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
    
    // Listen for allowHalfDoubleToggle changes to switch sustain/toggle mode
    this.observeModeToggle();
    
    enqueueToast('⌨️ Keyboard shortcuts activated - Press keys for effects');
    console.log('🎹 Keyboard Controller initialized:', this.keyMappings);
  }
  
  observeModeToggle() {
    // Watch for changes to the allowHalfDoubleToggle checkbox
    const toggleElement = document.getElementById('allowHalfDoubleToggle');
    if (toggleElement) {
      toggleElement.addEventListener('change', (e) => {
        this.sustainMode = !e.target.checked; // Inverted: checked = toggle mode, unchecked = sustain mode
        const mode = this.sustainMode ? 'Sustain' : 'Toggle';
        enqueueToast(`⌨️ Keyboard mode: ${mode}`);
        console.log(`🎹 Keyboard mode switched to: ${mode}`);
        
        // Clear all active effects when switching modes
        this.clearAllEffects();
      });
      
      // Set initial mode
      this.sustainMode = !toggleElement.checked;
    }
  }
  
  handleKeyDown(event) {
    // Ignore if typing in input fields
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }
    
    const key = event.key.toLowerCase();
    const mapping = this.keyMappings[key];
    
    // Debug key presses
    if (mapping) {
      console.log(`🎹 Key pressed: ${key} → ${mapping.description}`);
    }
    
    if (!mapping) return;
    
    event.preventDefault();
    
    // Track pressed keys for sustain mode
    this.keysPressed.add(key);
    
    // Handle based on mode and mapping type
    const controlKeys = ['prevPreset', 'nextPreset', 'beatToggle', 'relatch', 'undo',
                         'phaserDepthDown', 'phaserDepthUp', 'phaserRangeDown', 'phaserRangeUp'];

    if (controlKeys.includes(mapping.name)) {
      // Control keys - always immediate action
      this.handleControlKey(mapping.name);
    } else {
      // Effect keys - handle based on mode
      this.handleEffectKey(key, mapping, true);
    }
  }
  
  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    const mapping = this.keyMappings[key];
    
    if (!mapping) return;
    
    this.keysPressed.delete(key);
    
    // In sustain mode, turn off effect when key is released
    if (this.sustainMode && ['phase', 'fractal', 'silence', 'stutter'].includes(mapping.name)) {
      this.handleEffectKey(key, mapping, false);
    }
  }
  
  handleEffectKey(key, mapping, keyDown) {
    if (this.sustainMode) {
      // Sustain mode: effect active only while key is pressed
      if (keyDown && !this.activeEffects.has(key)) {
        this.activateEffect(mapping.name);
        this.activeEffects.add(key);
      } else if (!keyDown && this.activeEffects.has(key)) {
        this.deactivateEffect(mapping.name);
        this.activeEffects.delete(key);
      }
    } else {
      // Toggle mode: effect stays on until key is pressed again
      if (keyDown) {
        if (this.activeEffects.has(key)) {
          this.deactivateEffect(mapping.name);
          this.activeEffects.delete(key);
        } else {
          this.activateEffect(mapping.name);
          this.activeEffects.add(key);
        }
      }
    }
  }
  
  handleControlKey(action) {
    switch(action) {
      case 'prevPreset':
        this.cyclePreset(-1);
        break;
      case 'nextPreset':
        this.cyclePreset(1);
        break;
      case 'beatToggle':
        this.toggleBeat();
        break;
      case 'relatch':
        this.relatchEffects();
        break;
      case 'undo':
        this.undoLastEffect();
        break;
      case 'phaserDepthDown':
        this.adjustPhaserDepth(-0.1);
        break;
      case 'phaserDepthUp':
        this.adjustPhaserDepth(0.1);
        break;
      case 'phaserRangeDown':
        this.adjustPhaserRange(-0.001);
        break;
      case 'phaserRangeUp':
        this.adjustPhaserRange(0.001);
        break;
    }
  }
  
  activateEffect(effectName) {
    const buffer = window.currentAudioBuffer;

    if (!buffer) {
      enqueueToast('❌ No audio loaded');
      return;
    }

    // Save to undo stack before modifying
    this.saveToUndoStack(buffer);

    // Debug what we have access to
    console.log('🎹 Keyboard effect debug:', {
      effectName,
      hasBuffer: !!buffer,
      hasApplyLoop: typeof window.applyLoop,
      windowKeys: Object.keys(window).filter(k => k.includes('apply') || k.includes('Audio'))
    });

    try {
      let loop = detectLoop(buffer);

      // Pass phaser parameters if it's the phase effect
      if (effectName === 'phase') {
        window.phaserParams = this.phaserParams;
      }

      const result = applyQuantumOp(effectName, buffer, loop);

      // Store for relatch functionality
      this.relatchBuffer = result.buffer;

      // Use window.applyLoop (initialized in AudioAnalyzer.astro)
      if (typeof window.applyLoop === 'function') {
        window.applyLoop(result.buffer, result.loop, effectName);
      } else {
        console.warn('⚠️ window.applyLoop not initialized yet');
        // Fallback: just update the window buffer
        window.currentAudioBuffer = result.buffer;
      }

      enqueueToast(`✅ ${this.keyMappings[this.getKeyForEffect(effectName)].description} ON`);

    } catch (error) {
      console.error(`Effect ${effectName} failed:`, error);
      enqueueToast(`❌ ${effectName} failed: ${error.message}`);
    }
  }
  
  deactivateEffect(effectName) {
    // For now, deactivation just provides feedback
    // In the future, could implement effect reversal
    enqueueToast(`⏹️ ${this.keyMappings[this.getKeyForEffect(effectName)].description} OFF`);
  }
  
  cyclePreset(direction) {
    this.currentPresetIndex = (this.currentPresetIndex + direction + allPresets.length) % allPresets.length;
    const presetNames = ['Hip-Hop', 'Reggaeton', 'Dubstep', 'Breakbeat', 'Techno', 'Jungle'];
    const currentPresetName = presetNames[this.currentPresetIndex];
    
    enqueueToast(`🎵 Preset: ${currentPresetName} (${this.currentPresetIndex + 1}/${allPresets.length})`);
    console.log('Current preset:', allPresets[this.currentPresetIndex]);
  }
  
  toggleBeat() {
    if (this.sustainMode) {
      // In sustain mode, M key behavior depends on press/release
      if (this.keysPressed.has('m')) {
        this.startBeat();
      } else {
        this.stopBeat();
      }
    } else {
      // In toggle mode, M key toggles beat on/off
      if (this.beatPlaying) {
        this.stopBeat();
      } else {
        this.startBeat();
      }
    }
  }
  
  startBeat() {
    if (this.beatPlaying) return;
    
    const buffer = window.currentAudioBuffer;
    const applyLoop = window.applyLoop;
    
    if (!buffer || typeof applyLoop !== 'function') {
      enqueueToast('❌ No audio loaded');
      return;
    }
    
    this.beatPlaying = true;
    const currentPreset = allPresets[this.currentPresetIndex];
    const presetNames = ['Hip-Hop', 'Reggaeton', 'Dubstep', 'Breakbeat', 'Techno', 'Jungle'];
    
    enqueueToast(`🎵 Playing ${presetNames[this.currentPresetIndex]} beat`);
    
    let stepIndex = 0;
    this.beatInterval = setInterval(() => {
      const operation = currentPreset[stepIndex % currentPreset.length];
      
      try {
        let loop = detectLoop(buffer);
        const result = applyQuantumOp(operation, buffer, loop);
        applyLoop(result.buffer, result.loop, operation);
      } catch (error) {
        console.error('Beat step failed:', error);
      }
      
      stepIndex++;
    }, 200); // 200ms per step
  }
  
  stopBeat() {
    if (!this.beatPlaying) return;
    
    this.beatPlaying = false;
    if (this.beatInterval) {
      clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
    
    enqueueToast('⏹️ Beat stopped');
  }
  
  relatchEffects() {
    const buffer = window.currentAudioBuffer;
    const applyLoop = window.applyLoop;
    
    if (!buffer || typeof applyLoop !== 'function') {
      enqueueToast('❌ No audio loaded');
      return;
    }
    
    // Relatch current audio state
    if (this.relatchBuffer) {
      window.currentAudioBuffer = this.relatchBuffer;
      enqueueToast('🔄 Audio effects relatched');
    } else {
      // If no relatch buffer, just refresh current state
      let loop = detectLoop(buffer);
      applyLoop(buffer, loop, 'relatch');
      enqueueToast('🔄 Audio state refreshed');
    }
  }
  
  clearAllEffects() {
    this.activeEffects.clear();
    this.stopBeat();
    enqueueToast('🧹 All effects cleared');
  }
  
  getKeyForEffect(effectName) {
    for (const [key, mapping] of Object.entries(this.keyMappings)) {
      if (mapping.name === effectName) return key;
    }
    return null;
  }
  
  // Public method to show help
  showHelp() {
    console.log('🎹 Keyboard Shortcuts:');
    for (const [key, mapping] of Object.entries(this.keyMappings)) {
      console.log(`  ${key.toUpperCase()}: ${mapping.description}`);
    }
    console.log(`Mode: ${this.sustainMode ? 'Sustain' : 'Toggle'} (toggle via allowHalfDouble checkbox)`);
    enqueueToast('⌨️ Keyboard shortcuts logged to console');
  }

  // Save buffer to undo stack
  saveToUndoStack(buffer) {
    if (!buffer) return;

    try {
      // Clone the buffer using OfflineAudioContext
      const offlineCtx = new OfflineAudioContext(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
      );

      const clone = offlineCtx.createBuffer(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
      );

      for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const sourceData = buffer.getChannelData(channel);
        const destData = clone.getChannelData(channel);
        destData.set(sourceData);
      }

      this.undoStack.push(clone);

      // Limit undo stack size
      if (this.undoStack.length > this.maxUndoSteps) {
        this.undoStack.shift();
      }
    } catch (error) {
      console.warn('Failed to save undo state:', error);
    }
  }

  // Undo last effect
  undoLastEffect() {
    if (this.undoStack.length === 0) {
      enqueueToast('❌ Nothing to undo');
      return;
    }

    const previousBuffer = this.undoStack.pop();
    window.currentAudioBuffer = previousBuffer;

    // Restart playback if playing
    if (typeof window.applyLoop === 'function') {
      let loop = detectLoop(previousBuffer);
      window.applyLoop(previousBuffer, loop, 'undo');
    }

    enqueueToast(`⏮️ Undone (${this.undoStack.length} steps remaining)`);
  }

  // Adjust phaser wet/dry mix (depth)
  adjustPhaserDepth(delta) {
    this.phaserParams.wetMix = Math.max(0, Math.min(1, this.phaserParams.wetMix + delta));
    enqueueToast(`🌊 Phaser Depth: ${(this.phaserParams.wetMix * 100).toFixed(0)}%`);
    console.log('Phaser wetMix:', this.phaserParams.wetMix);

    // Re-apply phaser if it's currently active with volume reduction
    if (this.activeEffects.has('p')) {
      this.reapplyPhaserWithGain(0.5); // 50% volume
    }
  }

  // Adjust phaser delay range
  adjustPhaserRange(delta) {
    this.phaserParams.maxDelay = Math.max(0.001, Math.min(0.02, this.phaserParams.maxDelay + delta));
    enqueueToast(`📏 Phaser Range: ${(this.phaserParams.maxDelay * 1000).toFixed(2)}ms`);
    console.log('Phaser maxDelay:', this.phaserParams.maxDelay);

    // Re-apply phaser if it's currently active with volume reduction
    if (this.activeEffects.has('p')) {
      this.reapplyPhaserWithGain(0.5); // 50% volume
    }
  }

  // Reapply phaser with volume compensation
  reapplyPhaserWithGain(gain) {
    const buffer = window.currentAudioBuffer;
    if (!buffer) return;

    try {
      let loop = detectLoop(buffer);
      window.phaserParams = this.phaserParams;

      const result = applyQuantumOp('phase', buffer, loop);

      // Apply gain reduction to prevent loudness buildup
      for (let channel = 0; channel < result.buffer.numberOfChannels; channel++) {
        const channelData = result.buffer.getChannelData(channel);
        for (let i = 0; i < channelData.length; i++) {
          channelData[i] *= gain;
        }
      }

      if (typeof window.applyLoop === 'function') {
        window.applyLoop(result.buffer, result.loop, 'phase-adjust');
      } else {
        window.currentAudioBuffer = result.buffer;
      }
    } catch (error) {
      console.error('Phaser adjustment failed:', error);
    }
  }
}

// Initialize keyboard controller when DOM is ready
let keyboardController = null;

export function initKeyboardController() {
  if (!keyboardController) {
    keyboardController = new KeyboardController();
  }
  return keyboardController;
}

// Auto-initialize
document.addEventListener('DOMContentLoaded', () => {
  initKeyboardController();
});