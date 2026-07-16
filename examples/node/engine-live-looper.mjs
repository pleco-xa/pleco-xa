/**
 * Proof: engine/live-looper — the Echoplex looper GRAPH, rebuilt on pleco,
 * records a live mic input and plays it back, rendered headless with NO
 * browser and NO audio device.
 *
 * This is the primary correctness gate for the realtime engine: it stands up
 * the IDENTICAL signal-chain topology of the reference Echoplex looper
 * (.dev-notes/reference/epxlt/src/main.js — initializeAudioSystem ~L635-681
 * and playLoop ~L1122-1179) on pleco's zero-dep Web Audio engine, drives it
 * with a synthetic 440 Hz "mic", and proves the recorded loop and its
 * playback are correct SAMPLE-BY-SAMPLE — no device, no timers, no browser.
 *
 * Topology (pleco node ← epxlt node):
 *   micSource (createMediaStreamSource) ← microphoneSource
 *     → inputGain            ← inputGain          (init ~L663-664)
 *         → captureTap       ← recorderWorklet IN0 (the record capture, ~L664)
 *         → inputAnalyser    ← inputAnalyser       (input level, ~L665)
 *   mixGain → outputGain → destination           ← mixGain→outputGain→dest (~L669-670)
 *   mixGain → feedbackAnalyser                   ← feedback level     (~L673)
 *   loopPlayer (looping AudioBufferSource, buffer = the assembled loop)
 *     → feedbackGain         ← player→feedbackGain (playLoop ~L1144)
 *     → mixGain              ← player→mixGain       (playLoop ~L1149)
 *
 * The reference captures mic frames in an AudioWorklet and posts them to the
 * main thread; headless, we tap inputGain with a MediaStreamAudioDestination
 * whose track feed the HOST reads (the same pleco sample-feed adapter contract,
 * run in its inverse direction). The synthetic clock is a manually-stepped
 * PlecoMockSink (a PlecoNullSink that additionally records every rendered
 * quantum) so the destination-rendered blocks are readable on the main thread.
 *
 * Asserts:
 *   (1) the whole graph constructs headless with no throw;
 *   (2) after stepping the clock while "recording", the assembled loop buffer
 *       is non-silent and matches the injected 440 Hz tone SAMPLE-EXACTLY
 *       (max|Δ| == 0), with the captured spectrum's dominant bin at 440 Hz;
 *   (3) with the loop playing, the destination-rendered quanta are non-silent
 *       (RMS > 0) and scale linearly with outputGain (1× → 0.5× → 0×).
 *
 * The same record→loop→playback graph drives the browser looper artifact
 * examples/web/pleco.html (rebuilt from the reference Echoplex at
 * .dev-notes/reference/epxlt/index.html).
 */
import {
  PlecoAudioContext,
  PlecoMockSink,
  PlecoMediaSampleFeed,
  PlecoMediaStreamTrackShim,
  PlecoMediaStreamShim,
  PlecoMediaStreamAudioDestinationNode,
} from '../../packages/pleco-xa/dist/engine.js'
import { fft, magnitude } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const SR = 44100
const Q = 128 // RENDER_QUANTUM
const FREQ = 440
const AMP = 0.5
const RECORD_QUANTA = 128 // 16384 frames — a power of two so fft() needs no padding
const RECORD_FRAMES = RECORD_QUANTA * Q
const PLAY_QUANTA = RECORD_QUANTA // one play window == exactly one loop period

// ── The synthetic mic signal: a phase-continuous 440 Hz tone ───────────────
const tone = new Float32Array(RECORD_FRAMES)
for (let n = 0; n < RECORD_FRAMES; n++) tone[n] = AMP * Math.sin((2 * Math.PI * FREQ * n) / SR)

// ── The deviceless realtime context on a manually-stepped mock sink ────────
// sinkId defaults to '' (device output); the injected PlecoMockSink IS that
// device — a null sink that also records every rendered quantum, so proof (3)
// can read the destination blocks on the main thread.
const sink = new PlecoMockSink()
const ctx = new PlecoAudioContext({ sink, sampleRate: SR })

// ── The mic: a MediaStreamSource over a track whose feed we pre-load ───────
const micFeed = new PlecoMediaSampleFeed({ channelCount: 1 })
for (let i = 0; i < RECORD_QUANTA; i++) micFeed.enqueue([tone.slice(i * Q, i * Q + Q)])
const micTrack = new PlecoMediaStreamTrackShim({ feed: micFeed })
const micStream = new PlecoMediaStreamShim([micTrack])
const micSource = ctx.createMediaStreamSource(micStream)

// ── The four looper gains + the two analysers (epxlt init ~L650-659) ───────
const inputGain = ctx.createGain()
const outputGain = ctx.createGain()
const mixGain = ctx.createGain()
const feedbackGain = ctx.createGain()
const inputAnalyser = ctx.createAnalyser()
inputAnalyser.fftSize = 256
const feedbackAnalyser = ctx.createAnalyser()
feedbackAnalyser.fftSize = 256

// ── The capture tap: inputGain's mix, read on the main thread (mono) ───────
const captureTap = new PlecoMediaStreamAudioDestinationNode(ctx, { channelCount: 1 })
const captureFeed = captureTap.stream.getAudioTracks()[0].plecoSampleFeed

// ── Wire the input + output paths (epxlt init ~L663-673) ───────────────────
micSource.connect(inputGain)
inputGain.connect(captureTap) // mic → recorder capture
inputGain.connect(inputAnalyser) // mic → input level monitor
mixGain.connect(outputGain) // mix → output
outputGain.connect(ctx.destination) // output → device
mixGain.connect(feedbackAnalyser) // mix → feedback level monitor

inputGain.gain.value = 1
outputGain.gain.value = 1
mixGain.gain.value = 1
feedbackGain.gain.value = 1

// ── PROOF 1: the whole graph constructed headless with no throw ────────────
// (reaching these rows at all proves construction did not throw; the rows
// assert concrete facts about the built graph, not a bare `true`.)
checkTrue(
  'graph builds: context suspended pre-resume, destination present',
  ctx.state === 'suspended' && ctx.destination != null,
  `state=${ctx.state}`,
)
checkTrue('graph builds: mic source is bound to the injected stream (SameObject)', micSource.mediaStream === micStream, 'ok')
checkTrue('graph builds: capture tap exposes a readable sample feed', typeof captureFeed.read === 'function', 'feed.read present')

// Open the deviceless sink; nothing renders until we step it.
await ctx.resume()
checkTrue('context is running after resume() (sink opened)', ctx.state === 'running', `state=${ctx.state}`)

// ── RECORD: step the clock while the mic feeds the capture tap ─────────────
const rendered = sink.step(RECORD_QUANTA)
check('record: sink pulled one non-null block per step', rendered, RECORD_QUANTA)

// Drain the capture tap into the assembled loop.
const captured = captureFeed.read(RECORD_FRAMES)[0]

// ── PROOF 2: the loop is non-silent and matches the injected tone ──────────
const capturedPeak = Math.max(...Array.from(captured, Math.abs))
checkTrue('record: captured loop is non-silent', capturedPeak > 0.1, `peak ${capturedPeak.toFixed(4)}`)

let maxDiff = 0
for (let n = 0; n < RECORD_FRAMES; n++) {
  const d = Math.abs(captured[n] - tone[n])
  if (d > maxDiff) maxDiff = d
}
checkTrue(
  'record: captured loop matches the injected 440 Hz tone SAMPLE-EXACTLY (max|Δ| == 0)',
  maxDiff === 0,
  `max|Δ| ${maxDiff.toExponential(2)}`,
)

// Spectral confirmation: the captured loop's dominant frequency is 440 Hz.
const mag = magnitude(fft(captured))
const half = RECORD_FRAMES / 2
let peak = 1
for (let k = 2; k < half; k++) if (mag[k] > mag[peak]) peak = k
const binHz = SR / RECORD_FRAMES
const peakFreq = peak * binHz
check('record: peak FFT bin == round(440·N/sr)', peak, Math.round((FREQ * RECORD_FRAMES) / SR))
checkTrue(
  `record: captured loop's dominant frequency is 440 Hz (bin ${peak} = ${peakFreq.toFixed(1)} Hz, within one ${binHz.toFixed(2)} Hz bin)`,
  Math.abs(peakFreq - FREQ) <= binHz,
  `Δ ${Math.abs(peakFreq - FREQ).toFixed(2)} Hz`,
)
let magSum = 0
for (let k = 1; k < half; k++) magSum += mag[k]
const magMean = magSum / (half - 1)
checkTrue('record: the 440 Hz peak dominates the spectrum (peak/mean > 20)', mag[peak] / magMean > 20, `ratio ${(mag[peak] / magMean).toFixed(1)}`)

// ── PLAY: fill a loop AudioBuffer from the capture and loop it into mixGain ─
const loopBuffer = ctx.createBuffer(1, RECORD_FRAMES, SR)
loopBuffer.copyToChannel(captured, 0)

const loopPlayer = ctx.createBufferSource()
loopPlayer.buffer = loopBuffer
loopPlayer.loop = true
loopPlayer.connect(feedbackGain) // epxlt playLoop ~L1144 (→ recorder IN1, overdub path)
loopPlayer.connect(mixGain) // epxlt playLoop ~L1149
loopPlayer.start(0)

/** RMS of destination channel 0 over recorded blocks [from, to). */
const rmsOf = (from, to) => {
  let sumSq = 0
  let count = 0
  for (let b = from; b < to; b++) {
    const ch0 = sink.blocks[b][0]
    for (let i = 0; i < ch0.length; i++) {
      sumSq += ch0[i] * ch0[i]
      count++
    }
  }
  return Math.sqrt(sumSq / count)
}

// ── PROOF 3: the destination is non-silent while the loop plays and scales
//    linearly with outputGain (1× → 0.5× → 0×) ──────────────────────────────
// Control: destination was silent during record (nothing was playing yet).
const rmsRecord = rmsOf(0, RECORD_QUANTA)
checkTrue('play: destination was silent while nothing played (RMS ~ 0)', rmsRecord < 1e-6, `RMS ${rmsRecord.toExponential(2)}`)

// outputGain 1.0 → full level.
let base = sink.blocks.length
sink.step(PLAY_QUANTA)
const rmsFull = rmsOf(base, base + PLAY_QUANTA)
checkTrue('play: destination is non-silent with the loop playing (RMS > 0.1)', rmsFull > 0.1, `RMS ${rmsFull.toFixed(4)}`)

// outputGain 0.5 → half level.
outputGain.gain.value = 0.5
base = sink.blocks.length
sink.step(PLAY_QUANTA)
const rmsHalf = rmsOf(base, base + PLAY_QUANTA)
checkTrue(
  'play: destination RMS scales with outputGain (0.5× gain → ~0.5× RMS)',
  Math.abs(rmsHalf / rmsFull - 0.5) < 0.03,
  `ratio ${(rmsHalf / rmsFull).toFixed(4)}`,
)

// outputGain 0.0 → muted.
outputGain.gain.value = 0
base = sink.blocks.length
sink.step(PLAY_QUANTA)
const rmsZero = rmsOf(base, base + PLAY_QUANTA)
checkTrue('play: outputGain 0 mutes the destination (RMS ~ 0)', rmsZero < 1e-6, `RMS ${rmsZero.toExponential(2)}`)

summary('engine/live-looper: Echoplex record→loop→playback graph, headless')
