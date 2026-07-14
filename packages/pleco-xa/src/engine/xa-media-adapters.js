/**
 * engine/xa-media-adapters.js — FLAGGED ENV-ADAPTER DUCK-TYPE CONTRACTS for
 * the P22 media nodes + the shipped test/mock adapter implementations.
 *
 * ⚑ OUT-OF-SPEC ADAPTER SURFACE. HTMLMediaElement, MediaStream and
 * MediaStreamTrack belong to the HTML and Media Capture and Streams specs,
 * not to Web Audio — pleco does not implement them and never claims parity
 * for them (parity-checklist § Out of spec, dispositions 1–3). They enter the
 * engine only as the DUCK-TYPE SHAPES below, satisfied either by the shims in
 * this file (headless/tests) or by a host environment adapter wrapping the
 * real browser objects (P23 scope). Nothing in this file is a Pleco* spec
 * class; the reference implementation's nonstandard pushData()/read()/
 * readable conveniences live HERE (adapter-side), never on Pleco node classes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SAMPLE-FEED CONTRACT (the one pleco extension seam)
 * ─────────────────────────────────────────────────────────────────────────────
 * Media objects carry audio into (and out of) the graph through a single
 * documented extension member, `plecoSampleFeed` — an object with:
 *
 *   channelCount → integer in [1, 32] (readable property; MAY change between
 *     quanta — e.g. a media element whose src changed, or a destination track
 *     following its node's channelCount)
 *   sampleRate → number (OPTIONAL readable property). When present it MUST
 *     equal the consuming context's sampleRate: the spec's "resample to the
 *     context rate" step is ADAPTER scope, and a mismatched feed is refused
 *     loudly (NotSupportedError) instead of silently resampled or detuned.
 *     When absent, the contract is that the adapter already delivers frames
 *     at the context rate.
 *   read(frames) → Float32Array[] | null
 *     Deliver UP TO `frames` sample-frames as planar channel data: an array
 *     of exactly channelCount Float32Arrays of equal nonzero length
 *     ≤ frames, or null when nothing is buffered. A short (or null) read is
 *     the UNDERRUN signal — the consumer renders explicit silence for the
 *     missing tail and accounts it (never fabricated signal). Frames handed
 *     out are consumed (a feed is a FIFO, not a peek).
 *
 * The same contract serves both directions: source nodes read a track's (or
 * element stand-in's) feed into the graph; MediaStreamAudioDestinationNode
 * writes its input mix into its own track's feed for the HOST to read.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DUCK-TYPE SHAPES (what the P22 nodes validate)
 * ─────────────────────────────────────────────────────────────────────────────
 * track-like  = { kind: string ('audio' | 'video'),
 *                 id: string (spec first-track selection sorts on it),
 *                 readyState: 'live' | 'ended',
 *                 enabled: boolean,
 *                 plecoSampleFeed: <feed contract above> }
 *   kind/id/readyState/enabled are EXACTLY the browser MediaStreamTrack
 *   members, so a real track satisfies the structural half as-is; only
 *   plecoSampleFeed is the pleco extension a raw browser track lacks. A
 *   track-like WITHOUT a feed is "unfed": the consuming node names the
 *   missing adapter with a NotSupportedError at construction (same rule as
 *   the P21 missing-sink-adapter gate — no silent zero-rendering). Absent
 *   readyState is treated as 'live' and absent enabled as true (only the
 *   explicit values 'ended' / false trigger the silent states — documented
 *   leniency so minimal duck tracks stay minimal).
 *
 * stream-like = { getAudioTracks() → track-like[] }
 *   Exactly the browser MediaStream member the nodes consume — a real
 *   MediaStream satisfies it structurally (its tracks still need feeds).
 *
 * element-like = { plecoSampleFeed: <feed contract above> }
 *   MediaElementAudioSourceNode accepts ANY object as the element stand-in
 *   (a real HTMLMediaElement passes shape validation), but rendering
 *   requires the feed: an unfed element throws NotSupportedError at
 *   construction (parity-checklist disposition 3 — never the reference's
 *   silent zero stub). Element playback state (play/pause/seek/volume) is
 *   adapter scope: the feed simply having no data IS "not producing".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SHIPPED ADAPTERS (headless/test implementations of those shapes)
 * ─────────────────────────────────────────────────────────────────────────────
 * PlecoMediaSampleFeed — FIFO chunk queue implementing the feed contract,
 *   plus the push-side convenience enqueue(channels) (adapter-side analogue
 *   of the reference's pushData; float32 planar only — PCM conversion is a
 *   host-adapter concern, out of scope here). enqueue TAKES OWNERSHIP of the
 *   arrays passed in (no defensive copy — push copies if it must reuse).
 *   channelCount may be constructed as a zero-arg function for a live
 *   binding (the destination track's channel count follows its node).
 *   read() never mixes widths: when queued chunks straddle a channelCount
 *   change, a read stops at the width boundary and the next read continues.
 * PlecoMediaStreamTrackShim — track-like with unique ids ('pleco-track-N'),
 *   stop() → readyState 'ended', mutable enabled, and an owned
 *   PlecoMediaSampleFeed (or a caller-provided feed; pass feed: null to
 *   build an UNFED track for exercising the missing-adapter error path).
 * PlecoMediaStreamShim — stream-like over a fixed track list with the
 *   browser's getTracks()/getAudioTracks()/getVideoTracks() filtering.
 * PlecoMediaElementShim — element-like stand-in: just the feed (pass
 *   feed: null for the unfed error path).
 */

/** Engine channel ceiling — same value as PlecoAudioBuffer/PlecoNode. */
const MAX_CHANNELS = 32

let nextTrackId = 0

/**
 * The FIFO sample feed: implements the feed contract (channelCount /
 * sampleRate / read) plus the adapter-side push seam (enqueue).
 */
export class PlecoMediaSampleFeed {
  /** number | () => number — resolved live by the channelCount getter. */
  #channelCount
  #sampleRate
  /** Queued planar chunks (Array<Float32Array[]>), oldest first. */
  #chunks = []
  /** Read offset into #chunks[0] (frames already handed out of it). */
  #offset = 0

  /**
   * @param {object} [options]
   * @param {number|function} [options.channelCount=1] — integer in [1, 32],
   *   or a zero-arg function returning one (live binding).
   * @param {number} [options.sampleRate] — the rate the queued frames are at;
   *   omit to promise delivery at whatever rate the consumer runs at.
   */
  constructor({ channelCount = 1, sampleRate } = {}) {
    if (typeof channelCount !== 'function') validateChannelCount(channelCount, 'PlecoMediaSampleFeed')
    if (sampleRate !== undefined && (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate) || sampleRate <= 0)) {
      throw new TypeError(`PlecoMediaSampleFeed: sampleRate must be a finite number > 0 (or omitted), got ${sampleRate}`)
    }
    this.#channelCount = channelCount
    this.#sampleRate = sampleRate
  }

  /** Contract channelCount: the planar width of the frames this feed carries (live). */
  get channelCount() {
    const n = typeof this.#channelCount === 'function' ? this.#channelCount() : this.#channelCount
    validateChannelCount(n, 'PlecoMediaSampleFeed')
    return n
  }

  /** Contract sampleRate (optional member): undefined = "already at the consumer's rate". */
  get sampleRate() {
    return this.#sampleRate
  }

  /** Total frames currently queued (across all widths). */
  get bufferedFrames() {
    let total = 0
    for (const chunk of this.#chunks) total += chunk[0].length
    return total - this.#offset
  }

  /**
   * Adapter-side push seam: queue one planar chunk — exactly channelCount
   * Float32Arrays of equal nonzero length. The arrays become the feed's
   * property (no copy).
   */
  enqueue(channels) {
    const width = this.channelCount
    if (!Array.isArray(channels) || channels.length !== width) {
      throw new TypeError(
        `PlecoMediaSampleFeed.enqueue: expected an array of ${width} Float32Arrays (channelCount), got ${
          Array.isArray(channels) ? channels.length : channels
        }`,
      )
    }
    const len = channels[0] instanceof Float32Array ? channels[0].length : 0
    if (len === 0) {
      throw new TypeError('PlecoMediaSampleFeed.enqueue: chunks must be nonzero-length Float32Arrays')
    }
    for (const ch of channels) {
      if (!(ch instanceof Float32Array) || ch.length !== len) {
        throw new TypeError('PlecoMediaSampleFeed.enqueue: every channel must be a Float32Array of the same length')
      }
    }
    this.#chunks.push(channels)
  }

  /**
   * Contract read(frames): hand out up to `frames` queued frames as planar
   * arrays of one consistent width (a queued width change ends the read
   * early; the next read continues at the new width). null when empty.
   */
  read(frames) {
    if (!Number.isInteger(frames) || frames < 1) {
      throw new TypeError(`PlecoMediaSampleFeed.read: frames must be an integer >= 1, got ${frames}`)
    }
    if (this.#chunks.length === 0) return null
    const width = this.#chunks[0].length
    // First pass: how many frames can this read deliver at a single width?
    let take = 0
    for (const chunk of this.#chunks) {
      if (chunk.length !== width || take >= frames) break
      const available = chunk[0].length - (chunk === this.#chunks[0] ? this.#offset : 0)
      take += Math.min(available, frames - take)
    }
    // Second pass: copy out and drain.
    const out = []
    for (let c = 0; c < width; c++) out.push(new Float32Array(take))
    let written = 0
    while (written < take) {
      const chunk = this.#chunks[0]
      const count = Math.min(chunk[0].length - this.#offset, take - written)
      for (let c = 0; c < width; c++) {
        out[c].set(chunk[c].subarray(this.#offset, this.#offset + count), written)
      }
      written += count
      this.#offset += count
      if (this.#offset >= chunk[0].length) {
        this.#chunks.shift()
        this.#offset = 0
      }
    }
    return out
  }
}

/**
 * track-like shim: the four browser MediaStreamTrack members the nodes
 * consume + an owned sample feed. Not a MediaStreamTrack — a duck.
 */
export class PlecoMediaStreamTrackShim {
  #kind
  #id
  #readyState = 'live'
  /** Media Capture `enabled`: false renders silence without draining. */
  enabled = true
  /** The pleco extension seam (null = deliberately UNFED, for error-path tests). */
  plecoSampleFeed

  /**
   * @param {object} [options]
   * @param {string} [options.kind='audio']
   * @param {string} [options.id] — defaults to a unique 'pleco-track-N'.
   * @param {number|function} [options.channelCount=1] — for the owned feed.
   * @param {number} [options.sampleRate] — for the owned feed.
   * @param {object|null} [options.feed] — a ready feed to adopt, or null to
   *   build an unfed track; omit to own a fresh PlecoMediaSampleFeed.
   */
  constructor({ kind = 'audio', id = `pleco-track-${++nextTrackId}`, channelCount = 1, sampleRate, feed } = {}) {
    if (typeof kind !== 'string') throw new TypeError(`PlecoMediaStreamTrackShim: kind must be a string, got ${kind}`)
    if (typeof id !== 'string') throw new TypeError(`PlecoMediaStreamTrackShim: id must be a string, got ${id}`)
    this.#kind = kind
    this.#id = id
    this.plecoSampleFeed = feed !== undefined ? feed : new PlecoMediaSampleFeed({ channelCount, sampleRate })
  }

  get kind() {
    return this.#kind
  }

  get id() {
    return this.#id
  }

  get readyState() {
    return this.#readyState
  }

  /** Media Capture stop(): the track ends permanently. Idempotent. */
  stop() {
    this.#readyState = 'ended'
  }
}

/** stream-like shim: a fixed track list with the browser's filter accessors. */
export class PlecoMediaStreamShim {
  #tracks

  /** @param {Array} [tracks] — the track-likes this stream carries (copied). */
  constructor(tracks = []) {
    if (!Array.isArray(tracks)) {
      throw new TypeError(`PlecoMediaStreamShim: tracks must be an array, got ${tracks}`)
    }
    this.#tracks = [...tracks]
  }

  getTracks() {
    return [...this.#tracks]
  }

  getAudioTracks() {
    return this.#tracks.filter((t) => t.kind === 'audio')
  }

  getVideoTracks() {
    return this.#tracks.filter((t) => t.kind === 'video')
  }
}

/**
 * element-like shim: the minimal HTMLMediaElement stand-in — just the feed.
 * Playback semantics (play/pause/seek/src) are host-adapter scope; headless,
 * "the element is producing audio" simply means "the feed has frames".
 */
export class PlecoMediaElementShim {
  /** The pleco extension seam (null = deliberately UNFED, for error-path tests). */
  plecoSampleFeed

  /**
   * @param {object} [options]
   * @param {number|function} [options.channelCount=2] — for the owned feed.
   * @param {number} [options.sampleRate] — for the owned feed.
   * @param {object|null} [options.feed] — a ready feed to adopt, or null for
   *   an unfed element; omit to own a fresh PlecoMediaSampleFeed.
   */
  constructor({ channelCount = 2, sampleRate, feed } = {}) {
    this.plecoSampleFeed = feed !== undefined ? feed : new PlecoMediaSampleFeed({ channelCount, sampleRate })
  }
}

/** Shared channelCount validation for the feed contract. */
function validateChannelCount(n, who) {
  if (!Number.isInteger(n) || n < 1 || n > MAX_CHANNELS) {
    throw new TypeError(`${who}: channelCount must be an integer in [1, ${MAX_CHANNELS}], got ${n}`)
  }
}
