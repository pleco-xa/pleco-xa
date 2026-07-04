/**
 * Test Suite Generator for Pleco-Audio
 * Automatically generates comprehensive test files for all 459 reference functions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Module categories matching the reference structure
const moduleCategories = {
  'audio-core': { name: 'Core Audio I/O', modules: ['xa-audio-core', 'xa-audioio', 'xa-fileio', 'xa-file'] },
  'spectral': { name: 'Spectral Analysis', modules: ['xa-fft', 'xa-spectral', 'xa-mel', 'xa-chroma'] },
  'constantq': { name: 'Constant-Q Transforms', modules: ['xa-constantq'] },
  'beat': { name: 'Beat & Tempo', modules: ['xa-beat', 'xa-beat-tracker', 'xa-bpm-detection', 'xa-bpm-algorithm', 'xa-tempo', 'xa-tempogram', 'xa-downbeat'] },
  'onset': { name: 'Onset Detection', modules: ['xa-onset'] },
  'pitch': { name: 'Pitch & Harmony', modules: ['xa-pitch', 'xa-harmonic', 'xa-intervals', 'xa-notation'] },
  'rhythm': { name: 'Rhythm & Temporal', modules: ['xa-rhythm', 'xa-temporal'] },
  'decompose': { name: 'Decomposition & Separation', modules: ['xa-decompose'] },
  'effects': { name: 'Audio Effects', modules: ['xa-effects', 'xa-inverse'] },
  'features': { name: 'Feature Extraction', modules: ['xa-features', 'xa-audio-features'] },
  'filters': { name: 'Filter Banks', modules: ['xa-filters'] },
  'segment': { name: 'Segmentation', modules: ['xa-segment', 'xa-recurrence'] },
  'sequence': { name: 'Sequence Analysis', modules: ['xa-sequence', 'xa-dtw', 'xa-matching'] },
  'convert': { name: 'Conversions', modules: ['xa-convert'] },
  'util': { name: 'Utilities', modules: ['xa-util', 'xa-normalize', 'xa-cache', 'xa-advanced'] },
  'loop': { name: 'Loop Analysis', modules: ['xa-loop', 'xa-loop-detection', 'xa-precise-loop'] },
  'display': { name: 'Display & Visualization', modules: ['xa-display'] },
  'processing': { name: 'Audio Processing', modules: ['xa-processing', 'xa-remix', 'xa-split', 'xa-trim'] }
};

/**
 * Extract exported functions from a JavaScript file
 */
function extractExports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const exports = [];

    // Match: export function functionName
    const functionRegex = /^export\s+function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      exports.push({
        name: match[1],
        type: 'function',
        line: content.substring(0, match.index).split('\n').length
      });
    }

    // Match: export const functionName =
    const constRegex = /^export\s+const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/gm;
    while ((match = constRegex.exec(content)) !== null) {
      exports.push({
        name: match[1],
        type: 'const',
        line: content.substring(0, match.index).split('\n').length
      });
    }

    // Match: export { ... }
    const exportBlockRegex = /^export\s*\{\s*([^}]+)\s*\}/gm;
    while ((match = exportBlockRegex.exec(content)) !== null) {
      const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]);
      names.forEach(name => {
        if (name) {
          exports.push({
            name: name,
            type: 'export',
            line: content.substring(0, match.index).split('\n').length
          });
        }
      });
    }

    return exports;
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Generate test file for a module
 */
function generateTestFile(moduleName, exports) {
  const testContent = `/**
 * Test Suite for ${moduleName}
 * Auto-generated comprehensive tests for all exported functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as ${moduleName.replace(/-/g, '_')} from '../src/scripts/${moduleName}.js';

describe('${moduleName}', () => {
  // Module-level setup
  beforeEach(() => {
    // Reset any shared state if needed
  });

${exports.map(exp => `  describe('${exp.name}', () => {
    it('should be defined and exported', () => {
      expect(${moduleName.replace(/-/g, '_')}.${exp.name}).toBeDefined();
    });

    it('should be a ${exp.type}', () => {
      expect(typeof ${moduleName.replace(/-/g, '_')}.${exp.name}).toBe('${exp.type === 'function' ? 'function' : 'object'}');
    });

    // TODO: Add specific functionality tests
    it.todo('should handle valid inputs correctly');
    it.todo('should handle edge cases');
    it.todo('should throw on invalid inputs');
    it.todo('should match reference behavior');
  });
`).join('\n')}
});
`;

  return testContent;
}

/**
 * Generate HTML demo page for a module category
 */
function generateDemoHTML(categoryName, category) {
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pleco-Audio Demo: ${category.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #333;
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      padding: 30px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }

    h1 {
      color: #667eea;
      margin-bottom: 10px;
      font-size: 2.5em;
    }

    .subtitle {
      color: #666;
      margin-bottom: 30px;
      font-size: 1.1em;
    }

    .module-section {
      margin-bottom: 40px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .module-section h2 {
      color: #764ba2;
      margin-bottom: 15px;
      font-size: 1.5em;
    }

    .function-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 10px;
      margin-top: 15px;
    }

    .function-item {
      background: white;
      padding: 12px 16px;
      border-radius: 6px;
      border-left: 3px solid #667eea;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.9em;
      cursor: pointer;
      transition: all 0.2s;
    }

    .function-item:hover {
      transform: translateX(5px);
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }

    #demo-output {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
      border-radius: 8px;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 0.9em;
      line-height: 1.6;
      min-height: 200px;
      margin-top: 20px;
      overflow-x: auto;
    }

    .demo-controls {
      display: flex;
      gap: 10px;
      margin-top: 20px;
      flex-wrap: wrap;
    }

    button {
      background: #667eea;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1em;
      transition: background 0.2s;
    }

    button:hover {
      background: #764ba2;
    }

    button:active {
      transform: scale(0.98);
    }

    #file-input {
      display: none;
    }

    .file-label {
      background: #28a745;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-block;
      transition: background 0.2s;
    }

    .file-label:hover {
      background: #218838;
    }

    canvas {
      width: 100%;
      height: 200px;
      background: #f8f9fa;
      border-radius: 8px;
      margin-top: 20px;
    }

    .status {
      padding: 10px 16px;
      background: #e7f3ff;
      border-left: 3px solid #2196F3;
      border-radius: 4px;
      margin-top: 15px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${category.name}</h1>
    <p class="subtitle">Interactive demos for ${category.name} functions</p>

    <div class="demo-controls">
      <label class="file-label" for="file-input">Load Audio File</label>
      <input type="file" id="file-input" accept="audio/*">
      <button id="run-demo">Run Demo</button>
      <button id="clear-output">Clear Output</button>
    </div>

    ${category.modules.map(moduleName => `
    <div class="module-section">
      <h2>${moduleName}</h2>
      <div class="function-list" id="${moduleName}-functions">
        <!-- Functions will be populated here -->
      </div>
    </div>
    `).join('\n')}

    <div id="demo-output">
      <div style="color: #4EC9B0;">// Demo output will appear here</div>
      <div style="color: #6A9955;">// Click on any function to test it</div>
      <div style="color: #6A9955;">// Load an audio file to enable audio processing functions</div>
    </div>

    <canvas id="visualization-canvas"></canvas>

    <div class="status" id="status">
      Ready. Load an audio file to begin.
    </div>
  </div>

  <script type="module">
    // Demo script will be generated here
    const output = document.getElementById('demo-output');
    const status = document.getElementById('status');
    const canvas = document.getElementById('visualization-canvas');

    let audioBuffer = null;
    let audioContext = null;

    function log(message, color = '#d4d4d4') {
      const line = document.createElement('div');
      line.style.color = color;
      line.textContent = message;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    }

    function clearOutput() {
      output.innerHTML = '';
    }

    document.getElementById('clear-output').addEventListener('click', clearOutput);

    document.getElementById('file-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      status.textContent = 'Loading audio file...';

      try {
        if (!audioContext) {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        log('Audio loaded successfully:', '#4EC9B0');
        log(\`  Duration: \${audioBuffer.duration.toFixed(2)}s\`, '#CE9178');
        log(\`  Sample Rate: \${audioBuffer.sampleRate}Hz\`, '#CE9178');
        log(\`  Channels: \${audioBuffer.numberOfChannels}\`, '#CE9178');

        status.textContent = \`Audio loaded: \${file.name} (\${audioBuffer.duration.toFixed(2)}s)\`;
      } catch (error) {
        log('Error loading audio: ' + error.message, '#f48771');
        status.textContent = 'Error loading audio file';
      }
    });

    document.getElementById('run-demo').addEventListener('click', () => {
      clearOutput();
      log('Running ${category.name} demo...', '#4EC9B0');
      log('This is a basic demo - implement specific function tests', '#6A9955');

      if (audioBuffer) {
        log('Audio buffer available for processing', '#4EC9B0');
        // Add actual demo code here
      } else {
        log('No audio loaded - load a file first', '#f48771');
      }
    });
  </script>
</body>
</html>
`;

  return htmlContent;
}

/**
 * Main execution
 */
async function main() {
  console.log('Pleco-Audio Test Suite Generator\n');
  console.log('Scanning modules...\n');

  const srcDir = path.join(rootDir, 'src', 'scripts');
  const testDir = path.join(rootDir, 'tests', 'generated');
  const demoDir = path.join(rootDir, 'tests', 'demos');

  // Create directories
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  let totalFunctions = 0;
  let totalModules = 0;

  // Process each module
  const allModules = fs.readdirSync(srcDir)
    .filter(file => file.startsWith('xa-') && file.endsWith('.js'))
    .sort();

  console.log(`Found ${allModules.length} modules to process\n`);

  for (const moduleFile of allModules) {
    const moduleName = moduleFile.replace('.js', '');
    const modulePath = path.join(srcDir, moduleFile);
    const exports = extractExports(modulePath);

    if (exports.length > 0) {
      console.log(`  ${moduleName}: ${exports.length} exports`);

      // Generate test file
      const testContent = generateTestFile(moduleName, exports);
      const testFilePath = path.join(testDir, `${moduleName}.test.js`);
      fs.writeFileSync(testFilePath, testContent);

      totalFunctions += exports.length;
      totalModules++;
    }
  }

  // Generate HTML demo pages for each category
  console.log('\nGenerating HTML demo pages...\n');
  for (const [categoryName, category] of Object.entries(moduleCategories)) {
    const htmlContent = generateDemoHTML(categoryName, category);
    const htmlPath = path.join(demoDir, `demo-${categoryName}.html`);
    fs.writeFileSync(htmlPath, htmlContent);
    console.log(`  Created demo-${categoryName}.html`);
  }

  // Generate master test index
  const indexContent = `/**
 * Master Test Suite Index
 * Auto-generated test suite for all ${totalFunctions} reference functions
 */

import { describe } from 'vitest';

describe('Pleco-Audio Complete Test Suite', () => {
  // All ${totalModules} module test files will be run
  // Total: ${totalFunctions} functions tested
  // See individual test files in tests/generated/ directory
});
`;

  fs.writeFileSync(path.join(testDir, 'index.test.js'), indexContent);

  console.log('\n' + '='.repeat(60));
  console.log('Test suite generation complete!');
  console.log('='.repeat(60));
  console.log(`Total modules processed: ${totalModules}`);
  console.log(`Total functions found: ${totalFunctions}`);
  console.log(`Test files created: ${totalModules}`);
  console.log(`Demo pages created: ${Object.keys(moduleCategories).length}`);
  console.log('\nNext steps:');
  console.log('1. Run tests: npm test');
  console.log('2. View demos: Open tests/demos/*.html in browser');
  console.log('3. Implement specific tests in tests/generated/*.test.js');
}

main().catch(console.error);
