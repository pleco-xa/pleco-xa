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
    this.realtchBuffer = null; // For Y key relatch functionality
    
    this.keyMappings = {
      // Audio Effects
      'p': { name: 'phase', description: 'Phase Shift' },
      'k': { name: 'fractal', description: 'Fractal Echo' }, 
      'l': { name: 'silence', description: 'Silence/Rest' },
      'o': { name: 'stutter', description: 'Stutter Micro-Repeat' },
      
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
    if (['prevPreset', 'nextPreset', 'beatToggle', 'relatch'].includes(mapping.name)) {
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
    }
  }
  
  activateEffect(effectName) {
    const buffer = window.currentAudioBuffer;
    
    if (!buffer) {
      enqueueToast('❌ No audio loaded');
      return;
    }
    
    // Debug what we have access to
    console.log('🎹 Keyboard effect debug:', {
      effectName,
      hasBuffer: !!buffer,
      hasApplyLoop: typeof window.applyLoop,
      windowKeys: Object.keys(window).filter(k => k.includes('apply') || k.includes('Audio'))
    });
    
    try {
      let loop = detectLoop(buffer);
      const result = applyQuantumOp(effectName, buffer, loop);
      
      // Store for relatch functionality
      this.relatchBuffer = result.buffer;
      
      // Try different ways to access applyLoop
      const applyLoop = window.applyLoop || window.globalApplyLoop || 
                       document.querySelector('[data-apply-loop-var]')?.dataset.applyLoopVar;
      
      if (typeof applyLoop === 'function') {
        applyLoop(result.buffer, result.loop, effectName);
      } else {
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