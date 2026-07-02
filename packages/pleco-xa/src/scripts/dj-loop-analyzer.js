// @ts-check
/**
 * Complete DJ Loop Analyzer with DTW-based similarity matching
 * Advanced audio analysis for DJ applications and loop organization
 */

import { dtw, dtwDistanceMatrix, dtwKMeans } from './xa-dtw.js'
import { chroma_cqt, enhance_chroma, chroma_energy } from './xa-chroma.js'
import { tempo, beat_track, analyze_groove } from './xa-tempo.js'
import { onset_strength } from './xa-onset.js'
import { debugLog } from './debug.js'
import { spectralCentroid } from './xa-spectral.js'

/**
 * Complete DJ Loop Analyzer Class
 * Provides intelligent loop analysis, similarity matching, and organization
 */
export class DJLoopAnalyzer {
  constructor() {
    this.loops = new Map()
    this.similarityMatrix = null
    this.clusters = null
    this.analysisCache = new Map()
  }

  /**
   * Analyze a loop and extract all features
   * @param {AudioBuffer} audioBuffer - Audio buffer to analyze
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Complete loop analysis
   */
  async analyzeLoop(audioBuffer, metadata = {}) {
    const channelData = audioBuffer.getChannelData(0)
    const sampleRate = audioBuffer.sampleRate
    const loopId = crypto.randomUUID()

    debugLog(`🎵 Analyzing loop: ${metadata.name || loopId}`)

    try {
      // Extract all features
      const features = await this.extractAllFeatures(channelData, sampleRate)

      // Create loop object
      const loop = {
        id: loopId,
        audioBuffer: audioBuffer,
        features: features,
        metadata: {
          ...metadata,
          duration: audioBuffer.duration,
          sampleRate: sampleRate,
          analyzedAt: new Date(),
          energy: this.calculateOverallEnergy(features),
          complexity: this.calculateComplexity(features),
        },
        tags: this.generateTags(features),
        similarLoops: [],
      }

      this.loops.set(loopId, loop)

      // Update similarity matrix if we have multiple loops
      if (this.loops.size > 1) {
        this.updateSimilarityMatrix()
      }

      debugLog(
        `✅ Loop analyzed: ${loop.metadata.energy.toFixed(2)} energy, ${features.tempo.bpm.toFixed(1)} BPM`,
      )

      return loop
    } catch (error) {
      console.error('Error analyzing loop:', error)
      throw error
    }
  }

  /**
   * Extract comprehensive audio features
   * @param {Float32Array} audioData - Audio time series
   * @param {number} sampleRate - Sample rate
   * @returns {Promise<Object>} Extracted features
   */
  async extractAllFeatures(audioData, sampleRate) {
    const cacheKey = this.generateCacheKey(audioData)

    if (this.analysisCache.has(cacheKey)) {
      return this.analysisCache.get(cacheKey)
    }

    // Harmonic features
    const chroma = chroma_cqt(audioData, sampleRate)
    const enhanced_chroma = enhance_chroma(chroma)

    // Rhythmic features
    const tempo_result = tempo(audioData, sampleRate)
    const beat_result = beat_track(audioData, sampleRate, 512, tempo_result.bpm)
    const groove = analyze_groove(beat_result.beat_times, sampleRate)

    // Spectral features
    const onset_env = onset_strength(audioData, { sr: sampleRate })
    const spectral_cent = spectralCentroid({
      y: Array.from(audioData),
      sr: sampleRate,
    })

    // Musical key detection
    const key_result = this.estimateKey(chroma)

    // Timbral characteristics
    const timbral = this.extractTimbralFeatures(audioData, sampleRate)

    // Energy and dynamics
    const energy_features = this.extractEnergyFeatures(audioData, onset_env)

    const features = {
      // Harmonic
      chroma: chroma,
      enhanced_chroma: enhanced_chroma,
      key: key_result,

      // Rhythmic
      tempo: tempo_result,
      beats: beat_result,
      groove: groove,

      // Spectral
      onset_strength: onset_env,
      spectral_centroid: spectral_cent,
      spectral_features: timbral,

      // Energy
      energy: energy_features,

      // Structural
      structure: this.analyzeStructure(onset_env, beat_result.beat_times),
    }

    this.analysisCache.set(cacheKey, features)
    return features
  }

  /**
   * Find similar loops using DTW and multiple feature comparison
   * @param {string} loopId - Target loop ID
   * @param {Object} options - Search options
   * @returns {Array} Similar loops ranked by similarity
   */
  findSimilarLoops(loopId, options = {}) {
    const {
      maxResults = 10,
      chromaWeight = 0.4,
      tempoWeight = 0.3,
      keyWeight = 0.2,
      energyWeight = 0.1,
      tempoTolerance = 5,
      keyCompatible = false,
    } = options

    const targetLoop = this.loops.get(loopId)
    if (!targetLoop) throw new Error('Loop not found')

    const similarities = []

    for (let [id, loop] of this.loops) {
      if (id === loopId) continue

      // Calculate various similarity metrics
      const chromaSim = this.calculateChromaSimilarity(targetLoop, loop)
      const tempoSim = this.calculateTempoSimilarity(
        targetLoop,
        loop,
        tempoTolerance,
      )
      const keySim = this.calculateKeyCompatibility(
        targetLoop.features.key,
        loop.features.key,
      )
      const energySim = this.calculateEnergySimilarity(targetLoop, loop)

      // Combined similarity score
      const similarity =
        chromaSim * chromaWeight +
        tempoSim * tempoWeight +
        keySim * keyWeight +
        energySim * energyWeight

      // Filter by key compatibility if requested
      if (keyCompatible && keySim < 0.7) continue

      similarities.push({
        loop: loop,
        similarity: similarity,
        breakdown: {
          chroma: chromaSim,
          tempo: tempoSim,
          key: keySim,
          energy: energySim,
        },
        compatible: {
          tempo:
            Math.abs(targetLoop.features.tempo.bpm - loop.features.tempo.bpm) <
            tempoTolerance,
          key: keySim > 0.7,
          energy:
            Math.abs(targetLoop.metadata.energy - loop.metadata.energy) < 0.3,
        },
      })
    }

    // Sort by similarity and return top matches
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults)
  }

  /**
   * Calculate chroma similarity using DTW
   * @param {Object} loop1 - First loop
   * @param {Object} loop2 - Second loop
   * @returns {number} Similarity score (0-1)
   */
  calculateChromaSimilarity(loop1, loop2) {
    try {
      const { distance } = dtw(
        loop1.features.enhanced_chroma,
        loop2.features.enhanced_chroma,
        'cosine',
      )

      // Convert distance to similarity (0-1)
      return 1 / (1 + distance)
    } catch (error) {
      console.warn('DTW calculation failed, using fallback similarity')
      return this.fallbackChromaSimilarity(loop1, loop2)
    }
  }

  /**
   * Fallback chroma similarity using mean vectors
   * @param {Object} loop1 - First loop
   * @param {Object} loop2 - Second loop
   * @returns {number} Similarity score
   */
  fallbackChromaSimilarity(loop1, loop2) {
    const mean1 = this.computeChromaMean(loop1.features.chroma)
    const mean2 = this.computeChromaMean(loop2.features.chroma)

    // Cosine similarity
    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (let i = 0; i < 12; i++) {
      dotProduct += mean1[i] * mean2[i]
      norm1 += mean1[i] * mean1[i]
      norm2 += mean2[i] * mean2[i]
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }

  /**
   * Calculate tempo similarity
   * @param {Object} loop1 - First loop
   * @param {Object} loop2 - Second loop
   * @param {number} tolerance - BPM tolerance
   * @returns {number} Similarity score (0-1)
   */
  calculateTempoSimilarity(loop1, loop2, tolerance) {
    const bpm1 = loop1.features.tempo.bpm
    const bpm2 = loop2.features.tempo.bpm

    const diff = Math.abs(bpm1 - bpm2)

    // Check for harmonic relationships (2:1, 3:2, etc.)
    const ratios = [1, 0.5, 2, 2 / 3, 3 / 2, 3 / 4, 4 / 3]

    for (let ratio of ratios) {
      const expectedBpm = bpm1 * ratio
      if (Math.abs(expectedBpm - bpm2) < tolerance) {
        return 0.9 - (Math.abs(expectedBpm - bpm2) / tolerance) * 0.1
      }
    }

    // Linear similarity within tolerance
    if (diff <= tolerance) {
      return 1 - diff / tolerance
    }

    return Math.max(0, 1 - diff / 50) // Falloff over 50 BPM
  }

  /**
   * Calculate energy similarity
   * @param {Object} loop1 - First loop
   * @param {Object} loop2 - Second loop
   * @returns {number} Similarity score (0-1)
   */
  calculateEnergySimilarity(loop1, loop2) {
    const energy1 = loop1.metadata.energy
    const energy2 = loop2.metadata.energy

    const diff = Math.abs(energy1 - energy2)
    return Math.max(0, 1 - diff * 2) // Scale energy difference
  }

  /**
   * Calculate key compatibility using Camelot Wheel
   * @param {Object} key1 - First key
   * @param {Object} key2 - Second key
   * @returns {number} Compatibility score (0-1)
   */
  calculateKeyCompatibility(key1, key2) {
    const camelotWheel = {
      'C major': '8B',
      'A minor': '8A',
      'G major': '9B',
      'E minor': '9A',
      'D major': '10B',
      'B minor': '10A',
      'A major': '11B',
      'F# minor': '11A',
      'E major': '12B',
      'C# minor': '12A',
      'B major': '1B',
      'G# minor': '1A',
      'F# major': '2B',
      'D# minor': '2A',
      'C# major': '3B',
      'A# minor': '3A',
      'G# major': '4B',
      'F minor': '4A',
      'D# major': '5B',
      'C minor': '5A',
      'A# major': '6B',
      'G minor': '6A',
      'F major': '7B',
      'D minor': '7A',
    }

    const pos1 = camelotWheel[key1.key]
    const pos2 = camelotWheel[key2.key]

    if (!pos1 || !pos2) return 0.5

    // Perfect match
    if (pos1 === pos2) return 1.0

    const num1 = parseInt(pos1)
    const num2 = parseInt(pos2)
    const letter1 = pos1[pos1.length - 1]
    const letter2 = pos2[pos2.length - 1]

    // Same number, different letter (relative major/minor)
    if (num1 === num2) return 0.9

    // Adjacent numbers, same letter
    const numDiff = Math.abs(num1 - num2)
    if ((numDiff === 1 || numDiff === 11) && letter1 === letter2) return 0.8

    // Energy boost/drop (±7 semitones)
    if (numDiff === 7 && letter1 === letter2) return 0.7

    return 0.3
  }

  /**
   * Cluster loops into similar groups
   * @param {number} nClusters - Number of clusters
   * @returns {Array} Cluster results
   */
  clusterLoops(nClusters = 5) {
    if (this.loops.size < nClusters) {
      nClusters = Math.max(1, this.loops.size)
    }

    const sequences = Array.from(this.loops.values()).map(
      (loop) => loop.features.enhanced_chroma,
    )

    try {
      const clustering = dtwKMeans(sequences, nClusters)

      // Add loop metadata to clusters
      const enrichedClusters = clustering.map((cluster, index) => ({
        id: index,
        center: cluster.center,
        members: cluster.members
          .map((_, memberIndex) => {
            const loopArray = Array.from(this.loops.values())
            return loopArray.find(
              (loop) =>
                loop.features.enhanced_chroma === cluster.members[memberIndex],
            )
          })
          .filter(Boolean),
        characteristics: this.analyzeClusterCharacteristics(cluster.members),
      }))

      this.clusters = enrichedClusters
      return enrichedClusters
    } catch (error) {
      console.error('Clustering failed:', error)
      // Fallback: group by tempo ranges
      return this.fallbackClustering(nClusters)
    }
  }

  /**
   * Analyze cluster characteristics
   * @param {Array} members - Cluster members
   * @returns {Object} Cluster characteristics
   */
  analyzeClusterCharacteristics(members) {
    if (members.length === 0) return {}

    // This would analyze the actual loop objects if properly linked
    return {
      avgTempo: 120, // Placeholder
      dominantKey: 'C major',
      energyRange: [0.3, 0.7],
      commonTags: ['house', 'melodic'],
    }
  }

  /**
   * Fallback clustering by tempo
   * @param {number} nClusters - Number of clusters
   * @returns {Array} Tempo-based clusters
   */
  fallbackClustering(nClusters) {
    const loops = Array.from(this.loops.values())
    const tempos = loops.map((loop) => loop.features.tempo.bpm)

    const minTempo = Math.min(...tempos)
    const maxTempo = Math.max(...tempos)
    const tempoRange = maxTempo - minTempo

    const clusters = Array(nClusters)
      .fill(null)
      .map((_, i) => ({
        id: i,
        members: [],
        tempoRange: [
          minTempo + (i * tempoRange) / nClusters,
          minTempo + ((i + 1) * tempoRange) / nClusters,
        ],
      }))

    // Assign loops to tempo clusters
    loops.forEach((loop) => {
      const bpm = loop.features.tempo.bpm
      const clusterIndex = Math.min(
        nClusters - 1,
        Math.floor(((bpm - minTempo) / tempoRange) * nClusters),
      )
      clusters[clusterIndex].members.push(loop)
    })

    return clusters
  }

  /**
   * Get harmonic mixing suggestions
   * @param {string} currentLoopId - Currently playing loop
   * @returns {Array} Harmonically compatible loops
   */
  getHarmonicMixingOptions(currentLoopId) {
    const current = this.loops.get(currentLoopId)
    if (!current) throw new Error('Loop not found')

    const compatible = this.findSimilarLoops(currentLoopId, {
      keyCompatible: true,
      tempoTolerance: 3,
      maxResults: 20,
    })

    // Group by mixing technique
    const mixingOptions = {
      seamless: compatible.filter(
        (match) => match.compatible.tempo && match.compatible.key,
      ),
      harmonic: compatible.filter(
        (match) => match.compatible.key && match.breakdown.key > 0.8,
      ),
      energyBoost: compatible.filter(
        (match) => match.loop.metadata.energy > current.metadata.energy,
      ),
      energyDrop: compatible.filter(
        (match) => match.loop.metadata.energy < current.metadata.energy,
      ),
      doubleTime: compatible.filter(
        (match) =>
          Math.abs(
            match.loop.features.tempo.bpm - current.features.tempo.bpm * 2,
          ) < 5,
      ),
      halfTime: compatible.filter(
        (match) =>
          Math.abs(
            match.loop.features.tempo.bpm - current.features.tempo.bpm / 2,
          ) < 5,
      ),
    }

    return /** @type {any} */ (mixingOptions)
  }

  /**
   * Generate automatic tags based on features
   * @param {Object} features - Extracted features
   * @returns {Array} Generated tags
   */
  generateTags(features) {
    const tags = []

    // Tempo-based tags
    const bpm = features.tempo.bpm
    if (bpm < 90) tags.push('slow', 'chill')
    else if (bpm < 110) tags.push('midtempo', 'groove')
    else if (bpm < 130) tags.push('house', 'dance')
    else if (bpm < 150) tags.push('techno', 'driving')
    else if (bpm < 180) tags.push('trance', 'uplifting')
    else tags.push('hardcore', 'fast')

    // Energy-based tags
    const energy = this.calculateOverallEnergy(features)
    if (energy < 0.3) tags.push('ambient', 'minimal')
    else if (energy < 0.6) tags.push('groove', 'smooth')
    else if (energy < 0.8) tags.push('energetic', 'driving')
    else tags.push('intense', 'peak-time')

    // Key-based tags
    if (features.key.mode === 'major') {
      tags.push('uplifting', 'bright')
    } else {
      tags.push('dark', 'emotional')
    }

    // Structural tags
    if (features.structure.hasBreakdown) tags.push('breakdown')
    if (features.structure.hasDrop) tags.push('drop')

    return [...new Set(tags)] // Remove duplicates
  }

  /**
   * Helper methods
   */
  generateCacheKey(audioData) {
    // Simple hash of audio data for caching
    let hash = 0
    for (let i = 0; i < Math.min(audioData.length, 1000); i += 100) {
      hash = ((hash << 5) - hash + audioData[i] * 1000) & 0xffffffff
    }
    return hash.toString()
  }

  computeChromaMean(chroma) {
    const mean = new Float32Array(12)
    const nFrames = chroma[0].length

    for (let c = 0; c < 12; c++) {
      let sum = 0
      for (let t = 0; t < nFrames; t++) {
        sum += chroma[c][t]
      }
      mean[c] = sum / nFrames
    }

    return mean
  }

  calculateOverallEnergy(features) {
    // Combine multiple energy indicators
    const onsetEnergy =
      features.onset_strength.reduce((a, b) => a + b, 0) /
      features.onset_strength.length
    const spectralEnergy =
      features.spectral_centroid.reduce((a, b) => a + b, 0) /
      features.spectral_centroid.length

    return Math.min(1, onsetEnergy * 0.7 + (spectralEnergy / 2000) * 0.3)
  }

  calculateComplexity(features) {
    // Measure of rhythmic and harmonic complexity
    const rhythmicComplexity =
      features.onset_strength.filter((x) => x > 0.5).length /
      features.onset_strength.length
    const harmonicComplexity =
      chroma_energy(features.chroma).reduce((a, b) => a + Math.abs(b), 0) /
      features.chroma[0].length

    return (rhythmicComplexity + harmonicComplexity) / 2
  }

  estimateKey(chroma) {
    // Simplified key detection using chroma mean
    const chromaMean = this.computeChromaMean(chroma)

    // Key profiles (Krumhansl-Kessler)
    const keyProfiles = {
      major: [
        6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
      ],
      minor: [
        6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
      ],
    }

    const noteNames = [
      'C',
      'C#',
      'D',
      'D#',
      'E',
      'F',
      'F#',
      'G',
      'G#',
      'A',
      'A#',
      'B',
    ]

    let bestKey = 'C major'
    let bestScore = -Infinity

    // Test all 24 keys
    for (let tonic = 0; tonic < 12; tonic++) {
      for (let mode of ['major', 'minor']) {
        let score = 0
        for (let i = 0; i < 12; i++) {
          const profileIdx = (i - tonic + 12) % 12
          score += chromaMean[i] * keyProfiles[mode][profileIdx]
        }

        if (score > bestScore) {
          bestScore = score
          bestKey = `${noteNames[tonic]} ${mode}`
        }
      }
    }

    return {
      key: bestKey,
      confidence: bestScore,
      mode: bestKey.includes('major') ? 'major' : 'minor',
      tonic: bestKey.split(' ')[0],
    }
  }

  extractTimbralFeatures(audioData, sampleRate) {
    // Placeholder for timbral feature extraction
    return {
      brightness: 0.5,
      roughness: 0.3,
      warmth: 0.7,
    }
  }

  extractEnergyFeatures(audioData, onsetEnv) {
    const rms = Math.sqrt(
      audioData.reduce((sum, val) => sum + val * val, 0) / audioData.length,
    )
    const peak = Math.max(...audioData.map(Math.abs))
    const crestFactor = peak / rms

    return {
      rms: rms,
      peak: peak,
      crest_factor: crestFactor,
      dynamic_range: crestFactor,
      onset_density: onsetEnv.filter((x) => x > 0.1).length / onsetEnv.length,
    }
  }

  analyzeStructure(onsetEnv, beatTimes) {
    // Simple structural analysis
    const hasBreakdown = onsetEnv.some((val, i) => {
      if (i < 50) return false
      const window = onsetEnv.slice(Math.max(0, i - 25), i + 25)
      const localMean = window.reduce((a, b) => a + b, 0) / window.length
      return val < localMean * 0.3
    })

    const hasDrop = onsetEnv.some((val, i) => {
      if (i < 50 || i > onsetEnv.length - 50) return false
      const before = onsetEnv.slice(i - 25, i)
      const after = onsetEnv.slice(i, i + 25)
      const beforeMean = before.reduce((a, b) => a + b, 0) / before.length
      const afterMean = after.reduce((a, b) => a + b, 0) / after.length
      return afterMean > beforeMean * 2
    })

    return {
      hasBreakdown,
      hasDrop,
      beatCount: beatTimes.length,
      structuralComplexity: hasBreakdown || hasDrop ? 0.8 : 0.4,
    }
  }

  updateSimilarityMatrix() {
    const sequences = Array.from(this.loops.values()).map(
      (loop) => loop.features.enhanced_chroma,
    )
    try {
      this.similarityMatrix = dtwDistanceMatrix(sequences)
    } catch (error) {
      console.warn('Failed to update similarity matrix:', error)
    }
  }
}

/**
 * Quick loop comparison utility
 * @param {AudioBuffer} buffer1 - First audio buffer
 * @param {AudioBuffer} buffer2 - Second audio buffer
 * @returns {Promise<Object>} Comparison result
 */
export async function compareLoops(buffer1, buffer2) {
  const analyzer = new DJLoopAnalyzer()

  const loop1 = await analyzer.analyzeLoop(buffer1, { name: 'Loop 1' })
  const loop2 = await analyzer.analyzeLoop(buffer2, { name: 'Loop 2' })

  const similarity = analyzer.findSimilarLoops(loop1.id)[0]

  return {
    similarity: similarity?.similarity || 0,
    tempoMatch:
      Math.abs(loop1.features.tempo.bpm - loop2.features.tempo.bpm) < 5,
    keyCompatible:
      analyzer.calculateKeyCompatibility(
        loop1.features.key,
        loop2.features.key,
      ) > 0.7,
    energyDiff: Math.abs(loop1.metadata.energy - loop2.metadata.energy),
    recommendation:
      similarity?.similarity > 0.7
        ? 'Highly compatible'
        : similarity?.similarity > 0.5
          ? 'Moderately compatible'
          : 'Low compatibility',
  }
}
