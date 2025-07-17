# 🎵 Pleco-XA - Enhanced Audio Analysis Library

Browser-native audio analysis library for intelligent loop detection, BPM tracking, and advanced tempo analysis.

## 🚀 Features

- **Enhanced BPM Detection** - Improved accuracy for modern music genres (R&B, hip-hop, electronic)
- **Real-time Tempo Tracking** - Live BPM analysis with DAW-style accuracy
- **Advanced Loop Analysis** - Circular onset detection for seamless loops
- **Drum Classification** - Separate kicks from snares/hats
- **Web Worker Support** - Non-blocking audio processing
- **Fourier Tempogram Analysis** - Detailed tempo stability analysis
- **272+ Audio Functions** - Comprehensive audio processing toolkit

## 📦 Installation

```bash
npm install pleco-xa
```

## 🎮 Running the Demos

### 1. BPM Demo (Standalone HTML)

The BPM demo showcases enhanced BPM detection with drum classification and real-time tracking:

```bash
# Navigate to BPM-DEMO folder
cd pleco-xa-working/BPM-DEMO

# Install dependencies
npm install

# Build the demo
npm run build

# Start dev server
npm run dev
# Visit: http://localhost:PORT (check console for port)
```

**BPM Demo Features:**
- 🎯 **Advanced BPM Detection** - Multi-algorithm tempo analysis
- 🥁 **Drum Hit Detection** - Separate kicks, snares, and hi-hats
- 🎵 **Click Track Generation** - Metronome sync with detected beats
- 📊 **Live Tempo Tracking** - Real-time BPM monitoring during playback
- 📈 **Fourier Tempogram** - Visual tempo analysis over time
- 🔊 **Audio Playback** - Loop audio with click track overlay

### 2. Astro Demo (Full Interactive Site)

The Astro demo provides a complete interactive audio analysis playground:

```bash
# Navigate to main pleco folder
cd pleco-xa-working

# Install dependencies
npm install

# Build the Astro site
npx astro build

# Start Astro dev server
npx astro dev
# Visit: http://localhost:4321
```

**Astro Demo Features:**
- 🎵 **Interactive Audio Analysis** - Full library function browser
- 📊 **Real-time Visualizations** - Waveforms, spectrograms, beat tracking
- 🎛️ **Parameter Controls** - Adjust analysis parameters in real-time
- 📚 **Function Examples** - Live code examples for all 272+ functions
- 🎨 **Modern UI** - Beautiful, responsive interface
- 🔧 **Developer Tools** - Perfect for testing and learning

## 🎯 Quick Start

```javascript
import { BeatTracker, quickBeatTrack, detectBPM } from 'pleco-xa';

// Quick BPM detection
const audioBuffer = await loadAudioFile('song.mp3');
const bpm = await detectBPM(audioBuffer);
console.log(`Detected BPM: ${bpm}`);

// Advanced beat tracking
const tracker = new BeatTracker();
const result = tracker.beatTrack({
  y: audioBuffer.getChannelData(0),
  sr: audioBuffer.sampleRate,
  startBpm: 120,
  tightness: 100
});
console.log(`Found ${result.beats.length} beats`);

// Quick 2-second analysis
const quickResult = await quickBeatTrack(audioBuffer, {
  windowSize: 2.0,
  genreHint: 'electronic'
});
```

## 🛠️ Building from Source

```bash
# Clone and build
git clone [repository-url]
cd pleco-xa-working
npm install

# Run Astro demo
npx astro dev

# Run BPM demo
cd BPM-DEMO
npm install
npm run dev
```

## 📖 API Documentation

The library exports 272+ functions across categories:

- **Beat Tracking**: `BeatTracker`, `quickBeatTrack`, `beatTrack`
- **BPM Detection**: `detectBPM`, `estimateTempo`, `tempoTrack`
- **Audio Analysis**: `onset_strength`, `spectral_centroid`, `mfcc`
- **Signal Processing**: `stft`, `istft`, `fft`, `ifft`
- **Loop Analysis**: `analyzeLoop`, `findBestLoop`, `createSeamlessLoop`
- **Drum Detection**: `detectDrumHits`, `classifyDrumHits`
- **Visualization**: `BeatTrackingUI`, `generateClickTrack`

## 🔧 Advanced Usage

### Web Worker Support

```javascript
// Use the optimized web worker version for heavy processing
import { BeatTrackerWorker } from 'pleco-xa';

const worker = new BeatTrackerWorker();
const result = await worker.analyze(audioBuffer);
```

### Genre-Specific Analysis

```javascript
// Optimized for different music genres
const hipHopBPM = await detectBPM(audioBuffer, { genre: 'hip-hop' });
const houseBPM = await detectBPM(audioBuffer, { genre: 'house' });
const rockBPM = await detectBPM(audioBuffer, { genre: 'rock' });
```

### Real-time Processing

```javascript
// Live audio analysis
const liveTracker = new BeatTracker({ realtime: true });
liveTracker.on('beat', (time, confidence) => {
  console.log(`Beat at ${time}s (${confidence}% confidence)`);
});
```

## 🎵 Enhanced Features

- **Interval-Based Analysis** - Uses onset peaks for better accuracy
- **Tempo Confusion Resolution** - Handles common patterns (86 vs 108, 93 vs 140)
- **Tempo Relationships** - Detects half-time, double-time, triplet relationships
- **Common Dance Tempo Database** - Weighted scoring for genre-specific tempos
- **Quick Detection Mode** - 2-bar analysis for faster results
- **Rhythm Start Detection** - Finds actual musical content start
- **Sample Rate Auto-Detection** - Robust AudioContext integration

## 📊 Performance

- **Fast Analysis** - 2-second windows for real-time processing
- **Memory Efficient** - Optimized for large audio files
- **Web Worker Ready** - Non-blocking analysis
- **Browser Compatible** - Works in all modern browsers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with both demos
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [GitHub Repository](#)
- [API Documentation](#)
- [Examples](#)
- [Issues](#)
