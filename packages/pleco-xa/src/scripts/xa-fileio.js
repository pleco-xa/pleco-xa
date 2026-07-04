/**
 * File I/O utilities.
 * Browser-compatible file I/O and streaming using Web APIs.
 */

/**
 * Chunked audio reader (NOT true streaming — honesty note, 2026-07-02).
 *
 * The whole source is decoded up front via decodeAudioData, then yielded in
 * fixed-size sample windows: each block is `blockLength` SAMPLES and the
 * window advances by `hopLength` samples, so blockLength > hopLength yields
 * OVERLAPPING blocks. This is a simplified streaming contract — a true
 * frame-based streamer would count block_length in FRAMES of
 * frameLength/hopLength each and read incrementally. Memory use is O(file),
 * not O(block). For live input use createMediaStreamProcessor instead.
 *
 * With blockLength === hopLength the blocks are non-overlapping and lossless:
 * ceil(N / blockLength) blocks whose concatenation reproduces the decoded
 * source exactly (proof: examples/web/file-io.html).
 *
 * @param {string|File|Blob|MediaStream|HTMLMediaElement} source - Audio source
 * @param {Object} options - Streaming options
 * @param {number} options.blockLength - Number of frames per block (default: 2048)
 * @param {number} options.frameLength - Frame length for analysis (default: 2048)
 * @param {number} options.hopLength - Hop length between frames (default: 512)
 * @param {boolean} options.mono - Convert to mono (default: true)
 * @param {number} options.offset - Start time in seconds (default: 0.0)
 * @param {number} options.duration - Duration to stream in seconds (default: null, entire file)
 * @param {number} options.fillValue - Fill value for incomplete blocks (default: 0.0)
 * @param {AudioContext} options.audioContext - Web Audio context (default: new AudioContext())
 * @param {Function} options.onBlock - Callback for each audio block
 * @returns {Promise<AsyncGenerator<Float32Array>>} Async generator yielding audio blocks
 *
 * @example
 * // Stream audio file in 2048-sample blocks
 * const file = document.getElementById('audio-input').files[0];
 * const generator = await stream(file, {
 *   blockLength: 2048,
 *   mono: true,
 *   onBlock: (block) => {
 *     // Process each block in real-time
 *     const features = mfcc(block);
 *     console.log('Block features:', features);
 *   }
 * });
 *
 * // Iterate through blocks
 * for await (const block of generator) {
 *   // Process block
 *   console.log('Block shape:', block.length);
 * }
 */
export async function stream(source, options = {}) {
  const {
    blockLength = 2048,
    frameLength: _frameLength = 2048,
    hopLength = 512,
    mono = true,
    offset = 0.0,
    duration = null,
    fillValue = 0.0,
    audioContext = null,
    onBlock = null
  } = options;

  // Create audio context if not provided
  const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();

  // Load audio source into AudioBuffer
  let audioBuffer;

  if (source instanceof File || source instanceof Blob) {
    // Load from File/Blob
    const arrayBuffer = await source.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } else if (source instanceof HTMLMediaElement) {
    // Load from HTMLMediaElement (audio/video element)
    const response = await fetch(source.src);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } else if (typeof source === 'string') {
    // Load from URL
    const response = await fetch(source);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } else if (source instanceof MediaStream) {
    // Handle MediaStream (live audio capture)
    throw new Error('stream: MediaStream sources require real-time processing with AudioWorklet. Use createMediaStreamSource() instead.');
  } else {
    throw new TypeError('stream: source must be a File, Blob, URL, or HTMLMediaElement');
  }

  const sampleRate = audioBuffer.sampleRate;
  const numChannels = audioBuffer.numberOfChannels;

  // Convert to mono if requested
  let audioData;
  if (mono && numChannels > 1) {
    // Mix down to mono
    const monoData = new Float32Array(audioBuffer.length);
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch);
      for (let i = 0; i < audioBuffer.length; i++) {
        monoData[i] += channelData[i] / numChannels;
      }
    }
    audioData = monoData;
  } else {
    audioData = audioBuffer.getChannelData(0);
  }

  // Apply offset and duration
  const startSample = Math.floor(offset * sampleRate);
  const endSample = duration !== null
    ? Math.min(startSample + Math.floor(duration * sampleRate), audioData.length)
    : audioData.length;

  audioData = audioData.slice(startSample, endSample);

  // Create async generator for streaming blocks
  async function* generateBlocks() {
    let position = 0;

    while (position < audioData.length) {
      const blockEnd = Math.min(position + blockLength, audioData.length);
      const block = new Float32Array(blockLength);

      // Copy audio data to block
      const copyLength = blockEnd - position;
      block.set(audioData.slice(position, blockEnd), 0);

      // Fill remaining samples if block is incomplete
      if (copyLength < blockLength && fillValue !== undefined) {
        block.fill(fillValue, copyLength);
      }

      // Call onBlock callback if provided
      if (onBlock) {
        onBlock(block);
      }

      yield block;

      position += hopLength;
    }
  }

  return generateBlocks();
}

/**
 * Get a sorted list of audio files using File System Access API
 *
 * Allows users to select a directory and find all audio files within it.
 * Uses the File System Access API (Chrome 86+, Edge 86+) for directory access.
 * Falls back to input element for older browsers.
 *
 * @param {DirectoryHandle|string} directory - Directory handle or picker options
 * @param {Object} options - Search options
 * @param {string|Array<string>} options.ext - File extensions to match (default: common audio formats)
 * @param {boolean} options.recurse - Search subdirectories recursively (default: true)
 * @param {boolean} options.caseSensitive - Case-sensitive extension matching (default: false)
 * @param {number} options.limit - Maximum number of files to return (default: null, no limit)
 * @param {number} options.offset - Skip first N files (default: 0)
 * @returns {Promise<Array<File>>} Sorted list of audio File objects
 *
 * @example
 * // Find all audio files in a user-selected directory
 * const audioFiles = await find_files('select', {
 *   ext: ['.mp3', '.wav', '.ogg', '.flac'],
 *   recurse: true,
 *   limit: 100
 * });
 *
 * console.log(`Found ${audioFiles.length} audio files`);
 * audioFiles.forEach(file => console.log(file.name));
 *
 * @example
 * // Find files with Directory Handle
 * const dirHandle = await window.showDirectoryPicker();
 * const files = await find_files(dirHandle, {
 *   ext: '.wav',
 *   recurse: false
 * });
 */
export async function find_files(directory, options = {}) {
  const {
    ext = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.weba', '.opus'],
    recurse = true,
    caseSensitive = false,
    limit = null,
    offset = 0
  } = options;

  // Normalize extensions to array
  const extensions = Array.isArray(ext) ? ext : [ext];

  // Normalize extensions (add dot if missing, handle case sensitivity)
  const normalizedExt = extensions.map(e => {
    const normalized = e.startsWith('.') ? e : `.${e}`;
    return caseSensitive ? normalized : normalized.toLowerCase();
  });

  const files = [];

  // Recursive collector shared by the handle-injection and picker paths.
  async function collectFiles(handle) {
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        const fileName = caseSensitive ? file.name : file.name.toLowerCase();

        // Check if file matches any extension
        const matches = normalizedExt.some(ext => fileName.endsWith(ext));

        if (matches) {
          files.push(file);
        }
      } else if (entry.kind === 'directory' && recurse) {
        // Recursively search subdirectory
        await collectFiles(entry);
      }
    }
  }

  // Coverage close-out repair (2026-07-02): a caller-provided
  // DirectoryHandle-shaped object ({kind: 'directory', values()}) is honored
  // FIRST and works in ANY environment. Previously this path sat behind
  // `'showDirectoryPicker' in window`, which (a) crashed with a
  // ReferenceError in Node/workers and (b) silently IGNORED an injected
  // handle in browsers without the File System Access API.
  if (directory && typeof directory === 'object' && directory.kind === 'directory') {
    await collectFiles(directory);
  } else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    let dirHandle;

    // Get directory handle
    if (directory === 'select' || typeof directory === 'string') {
      // Show directory picker dialog
      try {
        dirHandle = await window.showDirectoryPicker({
          mode: 'read'
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          // User cancelled
          return [];
        }
        throw err;
      }
    } else {
      throw new TypeError('find_files: directory must be "select" string or a DirectoryHandle');
    }

    await collectFiles(dirHandle);

  } else if (typeof document === 'undefined') {
    // Non-browser environment without an injected handle: fail honestly.
    throw new TypeError(
      'find_files: in non-browser environments pass a DirectoryHandle-shaped object ({kind: "directory", values()})',
    );
  } else {
    // Fallback: Use input element for directory selection (limited browser support)
    console.warn('find_files: File System Access API not available. Using input element fallback.');

    return new Promise((resolve, reject) => {
      // Create hidden input element
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = normalizedExt.join(',');

      // Modern browsers support directory selection
      if ('webkitdirectory' in input) {
        input.webkitdirectory = true;
      }

      input.onchange = () => {
        const selectedFiles = Array.from(input.files);

        const filtered = selectedFiles.filter(file => {
          const fileName = caseSensitive ? file.name : file.name.toLowerCase();
          return normalizedExt.some(ext => fileName.endsWith(ext));
        });

        // Sort files by name
        filtered.sort((a, b) => a.name.localeCompare(b.name));

        // Apply offset and limit
        const sliced = filtered.slice(offset, limit !== null ? offset + limit : undefined);

        resolve(sliced);
        input.remove();
      };

      input.onerror = () => {
        reject(new Error('find_files: file selection failed'));
        input.remove();
      };

      // Trigger file picker
      input.click();
    });
  }

  // Sort files by name
  files.sort((a, b) => a.name.localeCompare(b.name));

  // Apply offset and limit
  const sliced = files.slice(offset, limit !== null ? offset + limit : undefined);

  return sliced;
}

/**
 * Get citation information for the pleco-xa library
 *
 * Returns citation information in BibTeX format for academic use.
 *
 * @param {string} version - Optional version string (default: the shipped package version)
 * @returns {string} Citation information in BibTeX format
 *
 * @example
 * console.log(cite());
 * // Prints:
 * // @software{pleco_xa,
 * //   title = {pleco-xa: Browser-native audio analysis engine},
 * //   author = {Cameron Brooks},
 * //   ...
 * // }
 *
 * @example
 * // Get citation for specific version
 * const citation = cite('2.0.0');
 * document.getElementById('citation').textContent = citation;
 */
export function cite(version = null) {
  // Metadata mirrors packages/pleco-xa/package.json (name, author, repository).
  const libVersion = version || '2.0.1';

  const citation = `@software{pleco_xa,
  title        = {pleco-xa: Browser-native audio analysis engine},
  author       = {Cameron Brooks},
  year         = {2026},
  version      = {${libVersion}},
  url          = {https://github.com/pleco-xa/pleco-xa},
  note         = {Browser-native audio analysis: BPM/beat tracking, spectral features, and intelligent loop detection}
}

pleco-xa is a browser-native audio analysis engine for JavaScript.

If you use pleco-xa in academic work, please cite it using the entry above.
`;

  return citation;
}

/**
 * Create a real-time audio stream processor for live input
 *
 * Sets up a MediaStream source (microphone, etc.) with real-time
 * block processing using AudioWorklet or ScriptProcessorNode.
 *
 * @param {MediaStream} mediaStream - MediaStream from getUserMedia or other source
 * @param {Object} options - Processing options
 * @param {number} options.blockLength - Processing block size (default: 2048)
 * @param {boolean} options.mono - Convert to mono (default: true)
 * @param {Function} options.onBlock - Callback for each audio block (required)
 * @param {AudioContext} options.audioContext - Audio context (default: new AudioContext())
 * @returns {Object} Stream controller with start(), stop(), and context properties
 *
 * @example
 * // Real-time microphone analysis
 * const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
 * const processor = createMediaStreamProcessor(stream, {
 *   blockLength: 2048,
 *   onBlock: (audioBlock) => {
 *     // Real-time feature extraction
 *     const rms = Math.sqrt(audioBlock.reduce((sum, x) => sum + x * x, 0) / audioBlock.length);
 *     console.log('RMS level:', rms);
 *   }
 * });
 *
 * processor.start();
 * // ... later ...
 * processor.stop();
 */
export function createMediaStreamProcessor(mediaStream, options = {}) {
  const {
    blockLength = 2048,
    mono = true,
    onBlock = null,
    audioContext = null
  } = options;

  if (!onBlock || typeof onBlock !== 'function') {
    throw new Error('createMediaStreamProcessor: onBlock callback is required');
  }

  if (!(mediaStream instanceof MediaStream)) {
    throw new TypeError('createMediaStreamProcessor: mediaStream must be a MediaStream');
  }

  const ctx = audioContext || new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaStreamSource(mediaStream);

  // Use ScriptProcessorNode (deprecated but widely supported)
  // In production, should use AudioWorklet for better performance
  const processor = ctx.createScriptProcessor(blockLength, mono ? 1 : 2, 1);

  processor.onaudioprocess = (event) => {
    const inputBuffer = event.inputBuffer;
    const numChannels = inputBuffer.numberOfChannels;

    let audioBlock;

    if (mono && numChannels > 1) {
      // Mix down to mono
      audioBlock = new Float32Array(blockLength);
      for (let ch = 0; ch < numChannels; ch++) {
        const channelData = inputBuffer.getChannelData(ch);
        for (let i = 0; i < blockLength; i++) {
          audioBlock[i] += channelData[i] / numChannels;
        }
      }
    } else {
      audioBlock = inputBuffer.getChannelData(0);
    }

    onBlock(audioBlock);
  };

  let isRunning = false;

  return {
    start: () => {
      if (!isRunning) {
        source.connect(processor);
        processor.connect(ctx.destination);
        isRunning = true;
      }
    },
    stop: () => {
      if (isRunning) {
        source.disconnect();
        processor.disconnect();
        isRunning = false;
      }
    },
    context: ctx,
    source: source,
    processor: processor,
    isRunning: () => isRunning
  };
}
