#!/usr/bin/env node
/**
 * Sync Essential Dependencies from src/ to public/
 *
 * This script maintains the dual-copy pattern required by Astro's
 * <script client:load> which needs files in public/ for browser loading.
 *
 * Run this after modifying any files that need to be in both locations.
 * Automatically runs before build via "prebuild" npm script.
 *
 * Why dual copy?
 * - Astro <script client:load> uses /scripts/ paths (maps to public/scripts/)
 * - Build-time imports use src/ for bundling
 * - Runtime browser imports need public/ for direct loading
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const libRoot = path.join(__dirname, '../../../packages/pleco-xa');

const filesToSync = [
  // Core scripts
  { src: 'src/scripts/debug.js', dest: 'public/scripts/debug.js' },
  { src: 'src/scripts/beat-presets.js', dest: 'public/scripts/beat-presets.js' },
  { src: 'src/scripts/audio-utils.js', dest: 'public/scripts/audio-utils.js' },
  { src: 'src/scripts/compression.js', dest: 'public/scripts/compression.js' },
  { src: 'src/scripts/musical-timing.js', dest: 'public/scripts/musical-timing.js' },

  // Audio analysis modules
  { src: 'src/scripts/xa-audio-core.js', dest: 'public/scripts/xa-audio-core.js' },
  { src: 'src/scripts/xa-bpm-detection.js', dest: 'public/scripts/xa-bpm-detection.js' },
  // xa-loop-detection.js was deleted in Wave 3 (4th duplicate loop detector).
  // The frozen public/scripts/xa-loop-detection.js copy stays as-is until the
  // Wave 6 demo migration to loop.detect().

  // Controllers
  { src: 'src/scripts/keyboard-controller.js', dest: 'public/scripts/keyboard-controller.js' },

  // UI helpers
  { src: 'src/scripts/ui/applyLoop.js', dest: 'public/scripts/ui/applyLoop.js' },
  { src: 'src/scripts/ui/toastQueue.js', dest: 'public/scripts/ui/toastQueue.js' },


  // Parity-repaired core + flagship modules (Wave 1)
  { src: 'src/scripts/xa-fft.js', dest: 'public/scripts/xa-fft.js' },
  { src: 'src/scripts/xa-util.js', dest: 'public/scripts/xa-util.js' },
  { src: 'src/scripts/xa-vocal-separation.js', dest: 'public/scripts/xa-vocal-separation.js' },
  { src: 'src/scripts/xa-wav-encoder.js', dest: 'public/scripts/xa-wav-encoder.js' },
  { src: 'src/scripts/SpectrumAnalyzer.js', dest: 'public/scripts/SpectrumAnalyzer.js' },
  // Effects library
  { src: 'src/lib/effects/xa-fx.js', dest: 'public/lib/effects/xa-fx.js' },
];

console.log('🔄 Syncing dependencies from src/ to public/...\n');

let successCount = 0;
let failCount = 0;

filesToSync.forEach(({ src, dest }) => {
  const srcPath = path.join(src.startsWith('src/') ? libRoot : root, src);
  const destPath = path.join(root, dest);

  // Check if source exists
  if (!fs.existsSync(srcPath)) {
    console.error(`⚠️  Source not found: ${src}`);
    failCount++;
    return;
  }

  // Ensure destination directory exists
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  // Copy file
  try {
    fs.copyFileSync(srcPath, destPath);

    // Get file size for reporting
    const stats = fs.statSync(destPath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(`✅ ${src} → ${dest} (${sizeKB} KB)`);
    successCount++;
  } catch (error) {
    console.error(`❌ Failed to copy ${src}:`, error.message);
    failCount++;
  }
});

console.log(`\n📊 Summary: ${successCount} synced, ${failCount} failed`);

if (failCount > 0) {
  console.error('\n⚠️  Some files failed to sync. Check the errors above.');
  process.exit(1);
}

console.log('✅ Sync complete!');
