/**
 * engine/nodes/xa-media-nodes.js — the four AudioContext-only media nodes
 * (P22, parity-checklist section 22):
 *   PlecoMediaElementAudioSourceNode   (spec: MediaElementAudioSourceNode)
 *   PlecoMediaStreamAudioSourceNode    (spec: MediaStreamAudioSourceNode)
 *   PlecoMediaStreamTrackAudioSourceNode (spec: MediaStreamTrackAudioSourceNode)
 *   PlecoMediaStreamAudioDestinationNode (spec: MediaStreamAudioDestinationNode)
 *
 * Per the spec IDL all four constructors take an AudioContext — NOT a
 * BaseAudioContext — so pleco enforces `context instanceof PlecoAudioContext`
 * with a TypeError (exactly what WebIDL argument conversion does when an
 * OfflineAudioContext is passed in a browser), and the four create* factory
 * methods live on PlecoAudioContext only.
 *
 * THE MEDIA TYPES ARE ADAPTER DUCKS: HTMLMediaElement / MediaStream /
 * MediaStreamTrack are other specs' interfaces, satisfied here by the flagged
 * env-adapter duck shapes documented in engine/xa-media-adapters.js
 * (stream-like { getAudioTracks() }, track-like { kind, id, readyState,
 * enabled, plecoSampleFeed }, element-like { plecoSampleFeed }). The shapes
 * are chosen so real browser objects pass the STRUCTURAL validation as-is;
 * the audio itself crosses the boundary only through the documented
 * `plecoSampleFeed` contract, and per the pleco no-silent-fallback rule a
 * media object WITHOUT a feed is refused at construction with a
 * NotSupportedError naming the missing adapter (parity-checklist disposition
 * 3: never the reference's silent zero stub; same gate as P21's missing sink
 * adapter). The reference's nonstandard pushData()/read()/readable stay
 * adapter-side — nothing here exposes them.
 *
 * Spec surface kept:
 * - MediaElementAudioSourceNode: 0 in / 1 out (audionode-noinput include,
 *   noo 1, tail-time No; AudioNode defaults channelCount 2 / 'max' /
 *   'speakers'); MediaElementAudioSourceOptions { required mediaElement }
 *   (does NOT extend AudioNodeOptions — unknown members ignored per WebIDL);
 *   [SameObject] readonly mediaElement. Output channel count follows the
 *   media (the feed's live channelCount).
 * - MediaStreamAudioSourceNode: 0 in / 1 out, same defaults;
 *   MediaStreamAudioSourceOptions { required mediaStream }; constructor
 *   step 1: no 'audio'-kind track → InvalidStateError; steps 2–3: the audio
 *   tracks sorted by their id "using an ordering on sequences of code unit
 *   values" (JS string < IS code-unit order) and the FIRST becomes the
 *   [[input track]] — later changes to the stream never re-select;
 *   [SameObject] readonly mediaStream. "When the MediaStreamTrack ends, this
 *   AudioNode outputs one channel of silence."
 * - MediaStreamTrackAudioSourceNode: 0 in / 1 out, same defaults;
 *   MediaStreamTrackAudioSourceOptions { required mediaStreamTrack };
 *   constructor step 1: kind !== 'audio' → InvalidStateError. The IDL
 *   declares NO attributes — the track is deliberately not re-exposed.
 * - MediaStreamAudioDestinationNode: 1 in / 0 out, channelCount 2 /
 *   channelCountMode 'explicit' / channelInterpretation 'speakers', options
 *   is a full optional AudioNodeOptions (invalid enum member → ctor-dict
 *   TypeError; null = empty dict, house rules); readonly `stream` — a
 *   stream-like carrying exactly one 'audio'-kind track whose channel count
 *   is the node's channelCount (live), its input mix exposed through that
 *   track's plecoSampleFeed (the inverse adapter direction: the HOST reads
 *   it). The node registers as a context tail node so the render loop ticks
 *   it every quantum despite its zero outputs.
 *
 * Pleco strictness / documented divergences (no silent fallbacks):
 * - Unfed media object (no plecoSampleFeed) → NotSupportedError at
 *   construction naming the adapter gap (see above).
 * - A feed declaring sampleRate ≠ context.sampleRate → NotSupportedError:
 *   the spec's "resampled to match the context's sample rate" step is
 *   adapter scope, refused loudly rather than approximated.
 * - UNDERRUN HONESTY (engine precedent — explicit silence plus accounting,
 *   never fabricated signal): when a live, enabled feed delivers fewer
 *   frames than the quantum needs, the shortfall renders as zeros and is
 *   counted on the node's `_underrunFrames` (engine-internal, excluded from
 *   the parity surface). For an element source the node cannot distinguish
 *   "paused" from "starved" — both are an empty feed; the adapter can.
 * - Disabled track (enabled === false, Media Capture semantics) → silence at
 *   the feed's width WITHOUT draining; re-enabling resumes exactly where the
 *   feed left off. Ended track → the spec's one channel of silence, feed
 *   never drained again. The ended rule is stated by the spec for
 *   MediaStreamAudioSourceNode and applied identically to the track source
 *   (its section fixes only the channel-count correspondence; sharing the
 *   rule is the documented reading, as browsers share the implementation).
 * - Feed replies are validated every quantum (planar shape, width, length
 *   ≤ quantum) — a contract-violating adapter throws TypeError instead of
 *   producing garbage audio.
 * - CORS: the spec (§MediaElementAudioSourceNode) requires a node to output
 *   SILENCE for a cross-origin media resource lacking CORS approval. Same-
 *   origin / cross-origin determination and the muting obligation are
 *   host/adapter scope — a cross-origin resource simply yields no feed here;
 *   the browser env adapter must enforce the security muting when it wraps a
 *   real HTMLMediaElement.
 */
import { PlecoNode } from '../xa-node.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { mixInto } from '../xa-channel-mixing.js'
import { invalidStateError, notSupportedError } from '../xa-errors.js'
import { PlecoAudioContext } from '../xa-audio-context.js'
import { PlecoMediaStreamTrackShim, PlecoMediaStreamShim } from '../xa-media-adapters.js'

/** Engine channel ceiling — same value as PlecoAudioBuffer/PlecoNode. */
const MAX_CHANNELS = 32

/** Spec IDL: these constructors take AudioContext, not BaseAudioContext → TypeError otherwise. */
function requireAudioContext(context, who) {
  if (!(context instanceof PlecoAudioContext)) {
    throw new TypeError(`${who}: context must be a PlecoAudioContext (the spec IDL takes AudioContext, not BaseAudioContext)`)
  }
}

/** WebIDL: a required options dictionary must be an object (null is the empty dict — then the required member is missing). */
function requireOptionsDict(options, who) {
  const dict = options === null || options === undefined ? {} : options
  if (typeof dict !== 'object') {
    throw new TypeError(`${who}: options must be a dictionary, got ${options}`)
  }
  return dict
}

/**
 * Validate the pleco sample-feed contract on a media duck. `carrier` names
 * the unfed object in the NotSupportedError (the missing-adapter gate).
 */
function requireFeed(feed, context, who, carrier) {
  if (feed === undefined || feed === null) {
    throw notSupportedError(
      `${who}: the ${carrier} has no plecoSampleFeed — media audio reaches pleco only through an env adapter ` +
        '(wrap the media object with a feed, or use the shims in engine/xa-media-adapters.js)',
    )
  }
  if (typeof feed !== 'object' || typeof feed.read !== 'function') {
    throw new TypeError(`${who}: plecoSampleFeed must be an object with read(frames) — see engine/xa-media-adapters.js`)
  }
  feedChannelCount(feed, who) // shape-check the live width up front
  if (feed.sampleRate !== undefined && feed.sampleRate !== context.sampleRate) {
    throw notSupportedError(
      `${who}: the feed delivers ${feed.sampleRate} Hz but the context runs at ${context.sampleRate} Hz — ` +
        'resampling to the context rate is adapter scope (deliver context-rate frames, or omit feed.sampleRate)',
    )
  }
  return feed
}

/** The feed's live channel width, contract-validated every read site. */
function feedChannelCount(feed, who) {
  const n = feed.channelCount
  if (!Number.isInteger(n) || n < 1 || n > MAX_CHANNELS) {
    throw new TypeError(`${who}: feed channelCount must be an integer in [1, ${MAX_CHANNELS}], got ${n}`)
  }
  return n
}

/**
 * Render one quantum from a feed into a fresh block at the feed's live
 * width. A short or null read renders explicit silence for the shortfall and
 * accounts it on node._underrunFrames (never fabricated signal). A
 * contract-violating reply (wrong planar shape/width/length) throws.
 */
function pullFeedBlock(node, feed, who) {
  const channels = feedChannelCount(feed, who)
  const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, node.context.sampleRate)
  const chunk = feed.read(RENDER_QUANTUM)
  if (chunk === null) {
    node._underrunFrames += RENDER_QUANTUM
    return out
  }
  if (!Array.isArray(chunk) || chunk.length !== channels) {
    throw new TypeError(
      `${who}: feed.read returned ${Array.isArray(chunk) ? chunk.length + ' channels' : chunk} but declared channelCount ${channels}`,
    )
  }
  const len = chunk[0] instanceof Float32Array ? chunk[0].length : 0
  if (len < 1 || len > RENDER_QUANTUM) {
    throw new TypeError(`${who}: feed.read must return nonzero Float32Arrays of length <= ${RENDER_QUANTUM}, got ${len}`)
  }
  for (let c = 0; c < channels; c++) {
    const src = chunk[c]
    if (!(src instanceof Float32Array) || src.length !== len) {
      throw new TypeError(`${who}: feed.read channels must be equal-length Float32Arrays`)
    }
    out.getChannelData(c).set(src)
  }
  if (len < RENDER_QUANTUM) node._underrunFrames += RENDER_QUANTUM - len
  return out
}

/**
 * The shared track-source render step (stream source and track source):
 * ended track → the spec's ONE channel of silence; disabled track → silence
 * at the feed width without draining; otherwise pull the feed.
 */
function pullTrackBlock(node, track, feed, who) {
  const sampleRate = node.context.sampleRate
  if (track.readyState === 'ended') {
    return createPlecoAudioBuffer(1, RENDER_QUANTUM, sampleRate)
  }
  if (track.enabled === false) {
    return createPlecoAudioBuffer(feedChannelCount(feed, who), RENDER_QUANTUM, sampleRate)
  }
  return pullFeedBlock(node, feed, who)
}

export class PlecoMediaElementAudioSourceNode extends PlecoNode {
  #mediaElement
  #feed

  /**
   * @param {PlecoAudioContext} context
   * @param {object} options — MediaElementAudioSourceOptions:
   *   { required mediaElement } (element-like duck; MUST carry a feed).
   */
  constructor(context, options) {
    requireAudioContext(context, 'PlecoMediaElementAudioSourceNode')
    const dict = requireOptionsDict(options, 'PlecoMediaElementAudioSourceNode')
    const { mediaElement } = dict
    // WebIDL required dictionary member: absent → TypeError.
    if (mediaElement === undefined || mediaElement === null || typeof mediaElement !== 'object') {
      throw new TypeError(
        `PlecoMediaElementAudioSourceNode: options.mediaElement is required and must be an element-like object, got ${mediaElement}`,
      )
    }
    // Spec node table: 0 in / 1 out; AudioNode defaults (cc 2 / 'max' /
    // 'speakers'). The options dictionary does NOT extend AudioNodeOptions.
    super(context, { numberOfInputs: 0, numberOfOutputs: 1 })
    this.#mediaElement = mediaElement
    // Pleco gate (parity-checklist disposition 3): an UNFED element surfaces
    // the missing adapter here — never the reference's silent zero stub.
    this.#feed = requireFeed(
      mediaElement.plecoSampleFeed,
      context,
      'PlecoMediaElementAudioSourceNode',
      'media element stand-in',
    )
    /** Engine-internal underrun accounting (see file header). */
    this._underrunFrames = 0
  }

  /** Spec [SameObject] readonly mediaElement: the element used at construction. */
  get mediaElement() {
    return this.#mediaElement
  }

  _process() {
    return pullFeedBlock(this, this.#feed, 'PlecoMediaElementAudioSourceNode')
  }
}

export class PlecoMediaStreamAudioSourceNode extends PlecoNode {
  #mediaStream
  #inputTrack
  #feed

  /**
   * @param {PlecoAudioContext} context
   * @param {object} options — MediaStreamAudioSourceOptions:
   *   { required mediaStream } (stream-like duck; the selected track MUST
   *   carry a feed).
   */
  constructor(context, options) {
    requireAudioContext(context, 'PlecoMediaStreamAudioSourceNode')
    const dict = requireOptionsDict(options, 'PlecoMediaStreamAudioSourceNode')
    const { mediaStream } = dict
    if (mediaStream === null || typeof mediaStream !== 'object' || typeof mediaStream.getAudioTracks !== 'function') {
      throw new TypeError(
        `PlecoMediaStreamAudioSourceNode: options.mediaStream is required and must be stream-like ({ getAudioTracks() }), got ${mediaStream}`,
      )
    }
    const tracks = mediaStream.getAudioTracks()
    if (!Array.isArray(tracks)) {
      throw new TypeError('PlecoMediaStreamAudioSourceNode: getAudioTracks() must return an array of track-likes')
    }
    // Spec constructor step 1: no audio MediaStreamTrack → InvalidStateError.
    if (tracks.length === 0) {
      throw invalidStateError('PlecoMediaStreamAudioSourceNode: the MediaStream has no audio track')
    }
    // Steps 2–3: sort the audio tracks by id on code-unit order (JS string <
    // IS that ordering); the FIRST becomes the [[input track]] — the spec's
    // deliberately arbitrary legacy selection.
    for (const track of tracks) {
      if (track === null || typeof track !== 'object' || typeof track.id !== 'string') {
        throw new TypeError(
          'PlecoMediaStreamAudioSourceNode: every audio track must be track-like with a string id (see engine/xa-media-adapters.js)',
        )
      }
    }
    const sorted = [...tracks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    super(context, { numberOfInputs: 0, numberOfOutputs: 1 })
    this.#mediaStream = mediaStream
    // [[input track]] — held for the node's lifetime; later stream changes
    // never re-select (spec note).
    this.#inputTrack = sorted[0]
    this.#feed = requireFeed(
      this.#inputTrack.plecoSampleFeed,
      context,
      'PlecoMediaStreamAudioSourceNode',
      `selected audio track '${this.#inputTrack.id}'`,
    )
    /** Engine-internal underrun accounting (see file header). */
    this._underrunFrames = 0
  }

  /** Spec [SameObject] readonly mediaStream: the stream used at construction. */
  get mediaStream() {
    return this.#mediaStream
  }

  _process() {
    return pullTrackBlock(this, this.#inputTrack, this.#feed, 'PlecoMediaStreamAudioSourceNode')
  }
}

export class PlecoMediaStreamTrackAudioSourceNode extends PlecoNode {
  #track
  #feed

  /**
   * @param {PlecoAudioContext} context
   * @param {object} options — MediaStreamTrackAudioSourceOptions:
   *   { required mediaStreamTrack } (track-like duck of kind 'audio'; MUST
   *   carry a feed). Per the spec IDL this node re-exposes NO attributes.
   */
  constructor(context, options) {
    requireAudioContext(context, 'PlecoMediaStreamTrackAudioSourceNode')
    const dict = requireOptionsDict(options, 'PlecoMediaStreamTrackAudioSourceNode')
    const { mediaStreamTrack } = dict
    if (mediaStreamTrack === null || typeof mediaStreamTrack !== 'object' || typeof mediaStreamTrack.kind !== 'string') {
      throw new TypeError(
        `PlecoMediaStreamTrackAudioSourceNode: options.mediaStreamTrack is required and must be track-like ({ kind, ... }), got ${mediaStreamTrack}`,
      )
    }
    // Spec constructor step 1: kind !== 'audio' → InvalidStateError.
    if (mediaStreamTrack.kind !== 'audio') {
      throw invalidStateError(
        `PlecoMediaStreamTrackAudioSourceNode: the MediaStreamTrack kind must be 'audio', got '${mediaStreamTrack.kind}'`,
      )
    }
    super(context, { numberOfInputs: 0, numberOfOutputs: 1 })
    this.#track = mediaStreamTrack
    this.#feed = requireFeed(
      mediaStreamTrack.plecoSampleFeed,
      context,
      'PlecoMediaStreamTrackAudioSourceNode',
      'media stream track',
    )
    /** Engine-internal underrun accounting (see file header). */
    this._underrunFrames = 0
  }

  _process() {
    return pullTrackBlock(this, this.#track, this.#feed, 'PlecoMediaStreamTrackAudioSourceNode')
  }
}

export class PlecoMediaStreamAudioDestinationNode extends PlecoNode {
  #stream
  #track

  /**
   * @param {PlecoAudioContext} context
   * @param {object} [options] — full optional AudioNodeOptions (spec node
   *   table defaults: channelCount 2, channelCountMode 'explicit',
   *   channelInterpretation 'speakers').
   */
  constructor(context, options = {}) {
    requireAudioContext(context, 'PlecoMediaStreamAudioDestinationNode')
    const dict = requireOptionsDict(options, 'PlecoMediaStreamAudioDestinationNode')
    // 1 in / 0 out; ctor-dict enum validation (TypeError) via PlecoNode.
    super(context, {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: dict.channelCount ?? 2,
      channelCountMode: dict.channelCountMode ?? 'explicit',
      channelInterpretation: dict.channelInterpretation ?? 'speakers',
    })
    // The inverse adapter direction: the node WRITES its input mix into its
    // own track's feed for the host to read. The feed's channelCount is a
    // live binding to the node's channelCount (spec: the track has "the same
    // number of channels as the node itself").
    this.#track = new PlecoMediaStreamTrackShim({
      kind: 'audio',
      channelCount: () => this.channelCount,
      sampleRate: context.sampleRate,
    })
    this.#stream = new PlecoMediaStreamShim([this.#track])
    // Zero outputs — nothing can pull this node; register as a context tail
    // node so renderQuantum() ticks it once per quantum (same mechanism as
    // unconnected started sources).
    context._tailNodes.add(this)
  }

  /** Spec readonly stream: one 'audio'-kind track carrying the input mix (same object every read). */
  get stream() {
    return this.#stream
  }

  /**
   * Each quantum: the summed input mix is copied into the track's feed —
   * unless the track was stopped, after which the mix is discarded (Media
   * Capture: an ended track never produces again). The spec pins the TRACK
   * width to the node's channelCount, so the pulled input is up/down-mixed to
   * exactly that width honoring the node's channelInterpretation (spec-default
   * 'speakers'): under the default 'explicit' mode the input is already
   * channelCount wide so this is a straight copy; if a caller moves
   * channelCountMode off 'explicit' the extra channels are correctly SUMMED
   * (down-mixed) rather than dropped, and missing channels up-mixed.
   */
  _process(input) {
    if (this.#track.readyState !== 'ended') {
      const width = this.channelCount
      const mixed = createPlecoAudioBuffer(width, RENDER_QUANTUM, this.context.sampleRate)
      mixInto(mixed, input, this.channelInterpretation)
      const chunk = []
      for (let c = 0; c < width; c++) chunk.push(mixed.getChannelData(c).slice())
      this.#track.plecoSampleFeed.enqueue(chunk)
    }
    return input
  }
}
