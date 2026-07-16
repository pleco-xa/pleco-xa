/**
 * engine/adapters/xa-mic-feed.js — the LIVE getUserMedia → pleco bridge.
 *
 * ⚑ OUT-OF-SPEC HOST ADAPTER (parity-checklist § Out of spec). Nothing here is
 * a Pleco* spec class; this is one of the environment adapters the P22 media
 * nodes reach the outside world through — the counterpart, on the capture side,
 * to the headless shims in engine/xa-media-adapters.js. It wraps the browser's
 * Media Capture stack (navigator.mediaDevices.getUserMedia, MediaStreamSource,
 * ScriptProcessorNode) and pumps real microphone PCM into a
 * PlecoMediaSampleFeed, then dresses that feed in the track-like / stream-like
 * ducks so it can feed a PlecoMediaStreamAudioSourceNode as-is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT LOOKS THE WAY IT DOES
 * ─────────────────────────────────────────────────────────────────────────────
 * • ONE CLOCK / ONE RATE. The caller passes in the SAME native AudioContext the
 *   realtime sink created. We capture on THAT context
 *   (createMediaStreamSource + createScriptProcessor) rather than spinning up a
 *   second AudioContext, so mic frames arrive at exactly the rate the pleco
 *   graph consumes them at — there is a single sample clock end to end.
 *
 * • THE FEED OMITS sampleRate. Because capture and consumption share that one
 *   context rate, the feed is constructed WITHOUT a sampleRate (the "already at
 *   the consumer's rate" contract in engine/xa-media-adapters.js). Declaring a
 *   rate would make the P22 requireFeed() gate refuse the feed with a
 *   NotSupportedError the instant it disagreed with context.sampleRate; the
 *   engine never silently resamples, so we simply promise context-rate frames.
 *
 * • WE COPY, WE DO NOT RETAIN. onaudioprocess() hands us the ScriptProcessor's
 *   internal inputBuffer, which the audio thread reuses next quantum.
 *   feed.enqueue() takes OWNERSHIP of the arrays it is given (no defensive copy
 *   — see PlecoMediaSampleFeed), so each channel is copied into a fresh
 *   Float32Array before it is enqueued. Retaining the native buffer would let a
 *   later quantum overwrite frames still queued for the graph.
 *
 * • THE CAPTURE NODE NEEDS A SINK. A ScriptProcessorNode only fires
 *   onaudioprocess while it is part of a live rendering chain, so the capture
 *   SPN is connected through to nativeContext.destination to keep it pumping —
 *   the mic path is a source of feed data, not of loudspeaker audio, and the
 *   pleco graph downstream is what actually renders the captured signal.
 *
 * • EPXLT FLAGS. getUserMedia is asked for RAW capture —
 *   echoCancellation / noiseSuppression / autoGainControl all false — so the
 *   frames handed to the graph are the untouched device signal, matching the
 *   Echoplex-lineage capture flags rather than the browser's voice-chat DSP.
 *
 * Zero runtime deps: the only imports are the three duck shims from the media
 * adapters module (imported directly, NOT via the engine barrel, so the barrel
 * can re-export this factory without an import cycle). Every browser global
 * (navigator, the native context's factory methods, ScriptProcessorNode) is
 * touched ONLY inside the factory body, so importing this module in Node (to
 * resolve those shims) never trips over a missing DOM global — the browser
 * surface is only reached when the factory is actually called.
 */
import { PlecoMediaSampleFeed, PlecoMediaStreamTrackShim, PlecoMediaStreamShim } from '../xa-media-adapters.js'

/** ScriptProcessorNode capture block size (frames per onaudioprocess). */
const CAPTURE_BUFFER_SIZE = 1024

/** Engine channel ceiling — same value as PlecoMediaSampleFeed/PlecoNode. */
const MAX_CHANNELS = 32

/**
 * Open the microphone and stream its PCM into a pleco sample feed, returning
 * the feed already wrapped as the track-like / stream-like ducks the P22 media
 * source nodes consume.
 *
 * Typical wiring (all on the ONE native context the sink drives):
 *
 *   const mic = await createBrowserMicFeed({ nativeContext, channelCount: 1 })
 *   const src = plecoContext.createMediaStreamAudioSource({ mediaStream: mic.stream })
 *   src.connect(plecoContext.destination)
 *   // …later…
 *   mic.stop()
 *
 * @param {object} params
 * @param {AudioContext} params.nativeContext — the SAME native (realtime)
 *   AudioContext the pleco sink created; capture happens on this context so
 *   there is one clock and one sample rate end to end. Must expose
 *   createMediaStreamSource(), createScriptProcessor() and destination.
 * @param {number} [params.channelCount=1] — capture width, an integer in
 *   [1, 32]. Drives both the ScriptProcessor's channel count and the feed's
 *   planar width; every enqueued chunk carries exactly this many channels.
 * @param {(samples: Float32Array) => void} [params.onChunk] — optional
 *   main-thread capture TAP. Called once per capture block with a FRESH mono
 *   (channel-0) Float32Array of the raw mic PCM, IN ADDITION to enqueueing the
 *   full-width chunk into the feed. This lets a host collect live PCM (e.g. a
 *   looper's record/overdub/multiply/insert buffers) on the main thread WITHOUT
 *   a second AudioContext and WITHOUT draining the feed the pleco graph reads —
 *   the same seam the epxlt recorder AudioWorklet's postMessage used to fill,
 *   moved onto the one native capture callback.
 * @returns {Promise<{
 *   track: PlecoMediaStreamTrackShim,
 *   stream: PlecoMediaStreamShim,
 *   feed: PlecoMediaSampleFeed,
 *   stop: () => void,
 * }>} the pleco track/stream ducks over the live mic feed, the underlying
 *   feed, and an idempotent stop() that tears the capture chain down and
 *   releases the microphone.
 * @throws {TypeError} if nativeContext is not a usable native AudioContext.
 * @throws {RangeError} if channelCount is not an integer in [1, 32].
 * @throws {Error} if getUserMedia is unavailable in this environment; also
 *   rejects with whatever getUserMedia rejects with (e.g. NotAllowedError when
 *   the user denies microphone permission).
 */
export async function createBrowserMicFeed({ nativeContext, channelCount = 1, onChunk } = {}) {
  if (
    nativeContext === null ||
    typeof nativeContext !== 'object' ||
    typeof nativeContext.createMediaStreamSource !== 'function' ||
    typeof nativeContext.createScriptProcessor !== 'function'
  ) {
    throw new TypeError(
      'createBrowserMicFeed: nativeContext must be a native AudioContext exposing ' +
        'createMediaStreamSource() and createScriptProcessor()',
    )
  }
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > MAX_CHANNELS) {
    throw new RangeError(`createBrowserMicFeed: channelCount must be an integer in [1, ${MAX_CHANNELS}], got ${channelCount}`)
  }
  if (onChunk !== undefined && typeof onChunk !== 'function') {
    throw new TypeError(`createBrowserMicFeed: onChunk must be a function when provided, got ${onChunk}`)
  }
  if (
    typeof navigator === 'undefined' ||
    navigator.mediaDevices === undefined ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    throw new Error(
      'createBrowserMicFeed: navigator.mediaDevices.getUserMedia is unavailable — this adapter must run in a ' +
        'browser with microphone access',
    )
  }

  // The feed carries frames at the context rate, so sampleRate is OMITTED (see
  // header: declaring it would arm the requireFeed() NotSupportedError gate).
  const feed = new PlecoMediaSampleFeed({ channelCount })

  // Raw capture — mirror the epxlt flags (no browser voice-chat DSP).
  const gumStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })

  let source
  let processor
  try {
    // Reuse the caller's context: one clock, one rate.
    source = nativeContext.createMediaStreamSource(gumStream)
    processor = nativeContext.createScriptProcessor(CAPTURE_BUFFER_SIZE, channelCount, channelCount)

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer
      // EXACTLY channelCount fresh planar Float32Arrays — copied out of the
      // native inputBuffer (feed.enqueue takes ownership and the audio thread
      // reuses that buffer next quantum).
      const chunk = new Array(channelCount)
      for (let c = 0; c < channelCount; c++) {
        chunk[c] = new Float32Array(input.getChannelData(c))
      }
      feed.enqueue(chunk)
      // Main-thread capture tap: hand the host its OWN copy of the mono mic PCM
      // (channel 0). A fresh copy — not the array just handed to the feed, which
      // the feed now owns — so host and graph never alias.
      if (onChunk !== undefined) onChunk(new Float32Array(chunk[0]))
    }

    // A ScriptProcessorNode only fires while it reaches a sink, so route the
    // capture SPN through to the native destination to keep it pumping.
    source.connect(processor)
    processor.connect(nativeContext.destination)
  } catch (err) {
    // Wiring failed after the mic was granted — release it before rethrowing so
    // we never leak the capture device.
    for (const t of gumStream.getTracks()) t.stop()
    throw err
  }

  // Dress the live feed as the track-like / stream-like ducks a
  // PlecoMediaStreamAudioSourceNode consumes as-is.
  const track = new PlecoMediaStreamTrackShim({ kind: 'audio', channelCount, feed })
  const stream = new PlecoMediaStreamShim([track])

  let stopped = false
  /**
   * Tear the capture chain down and release the microphone. Idempotent — safe
   * to call more than once (later calls are no-ops).
   * @returns {void}
   */
  const stop = () => {
    if (stopped) return
    stopped = true
    processor.onaudioprocess = null
    processor.disconnect()
    source.disconnect()
    for (const t of gumStream.getTracks()) t.stop()
  }

  return { track, stream, feed, stop }
}
