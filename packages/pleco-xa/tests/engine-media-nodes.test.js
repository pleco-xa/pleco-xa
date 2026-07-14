import { describe, it, expect } from 'vitest'
import { PlecoAudioContext } from '../src/engine/xa-audio-context.js'
import { PlecoMockSink } from '../src/engine/xa-sink.js'
import { PlecoOfflineAudioContext } from '../src/engine/xa-offline-context.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'
import {
  PlecoMediaElementAudioSourceNode,
  PlecoMediaStreamAudioSourceNode,
  PlecoMediaStreamTrackAudioSourceNode,
  PlecoMediaStreamAudioDestinationNode,
} from '../src/engine/nodes/xa-media-nodes.js'
import {
  PlecoMediaSampleFeed,
  PlecoMediaStreamTrackShim,
  PlecoMediaStreamShim,
  PlecoMediaElementShim,
} from '../src/engine/xa-media-adapters.js'

// P22 — the four AudioContext-only media nodes (checklist section 22), fully
// headless: the flagged env-adapter duck-type contracts (xa-media-adapters.js),
// constructor validation matrices (required members, InvalidStateError track
// rules, spec first-track id ordering, the pleco missing-feed / mismatched-
// sample-rate NotSupportedError gates), mock-feed → rendered-output
// sample-exactness through a manually-stepped MockSink, honest underrun
// accounting, and the MediaStreamAudioDestinationNode inverse direction
// (input mix → track feed) including a cross-context round-trip.

const SR = 44100

/** A fresh realtime context wired to a fresh recording PlecoMockSink. */
function mockContext(ctxOptions = {}) {
  const sink = new PlecoMockSink()
  const ctx = new PlecoAudioContext({ sink, ...ctxOptions })
  return { ctx, sink }
}

/** A planar ramp chunk: channel c, frame i = base + c + i * step. */
function rampChunk(channels, frames, base = 0, step = 1e-4) {
  const chunk = []
  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(frames)
    for (let i = 0; i < frames; i++) data[i] = Math.fround(base + c + i * step)
    chunk.push(data)
  }
  return chunk
}

/** A stream-like with one fed audio track; returns { stream, track, feed }. */
function fedStream(trackOptions = {}) {
  const track = new PlecoMediaStreamTrackShim({ channelCount: 2, sampleRate: SR, ...trackOptions })
  return { stream: new PlecoMediaStreamShim([track]), track, feed: track.plecoSampleFeed }
}

// ── The adapter shims (the flagged duck-type contracts) ─────────────────────

describe('PlecoMediaSampleFeed — the sample-feed contract', () => {
  it('round-trips an enqueued chunk exactly and drains it (FIFO, not a peek)', () => {
    const feed = new PlecoMediaSampleFeed({ channelCount: 2, sampleRate: SR })
    const chunk = rampChunk(2, 64)
    feed.enqueue(chunk)
    expect(feed.bufferedFrames).toBe(64)
    const out = feed.read(64)
    expect(out).toHaveLength(2)
    expect(Array.from(out[0])).toEqual(Array.from(chunk[0]))
    expect(Array.from(out[1])).toEqual(Array.from(chunk[1]))
    expect(feed.bufferedFrames).toBe(0)
    expect(feed.read(1)).toBeNull()
  })

  it('read() spans chunk boundaries and delivers partial tails', () => {
    const feed = new PlecoMediaSampleFeed({ channelCount: 1 })
    feed.enqueue([Float32Array.from([1, 2, 3])])
    feed.enqueue([Float32Array.from([4, 5])])
    const a = feed.read(4)
    expect(Array.from(a[0])).toEqual([1, 2, 3, 4])
    const b = feed.read(4) // only 1 frame left — a SHORT read, never padding
    expect(Array.from(b[0])).toEqual([5])
    expect(feed.read(4)).toBeNull()
  })

  it('read() on an empty feed answers null; read validates frames', () => {
    const feed = new PlecoMediaSampleFeed({ channelCount: 1 })
    expect(feed.read(128)).toBeNull()
    expect(() => feed.read(0)).toThrow(TypeError)
    expect(() => feed.read(1.5)).toThrow(TypeError)
  })

  it('enqueue validates planar shape: width, Float32Array type, equal nonzero lengths', () => {
    const feed = new PlecoMediaSampleFeed({ channelCount: 2 })
    expect(() => feed.enqueue([new Float32Array(8)])).toThrow(TypeError) // wrong width
    expect(() => feed.enqueue([new Float32Array(8), new Float64Array(8)])).toThrow(TypeError)
    expect(() => feed.enqueue([new Float32Array(8), new Float32Array(7)])).toThrow(TypeError)
    expect(() => feed.enqueue([new Float32Array(0), new Float32Array(0)])).toThrow(TypeError)
    expect(() => feed.enqueue('nope')).toThrow(TypeError)
  })

  it('constructor validates channelCount and sampleRate loudly', () => {
    expect(() => new PlecoMediaSampleFeed({ channelCount: 0 })).toThrow(TypeError)
    expect(() => new PlecoMediaSampleFeed({ channelCount: 33 })).toThrow(TypeError)
    expect(() => new PlecoMediaSampleFeed({ channelCount: 1.5 })).toThrow(TypeError)
    expect(() => new PlecoMediaSampleFeed({ sampleRate: -1 })).toThrow(TypeError)
    expect(new PlecoMediaSampleFeed().channelCount).toBe(1)
    expect(new PlecoMediaSampleFeed().sampleRate).toBeUndefined()
  })

  it('a function channelCount is a live binding, and read() never mixes widths across a change', () => {
    let width = 1
    const feed = new PlecoMediaSampleFeed({ channelCount: () => width })
    feed.enqueue([Float32Array.from([1, 2])])
    width = 2
    expect(feed.channelCount).toBe(2)
    feed.enqueue([Float32Array.from([3, 4]), Float32Array.from([5, 6])])
    const first = feed.read(128) // stops at the width boundary
    expect(first).toHaveLength(1)
    expect(Array.from(first[0])).toEqual([1, 2])
    const second = feed.read(128)
    expect(second).toHaveLength(2)
    expect(Array.from(second[0])).toEqual([3, 4])
    expect(Array.from(second[1])).toEqual([5, 6])
  })
})

describe('PlecoMediaStreamTrackShim + PlecoMediaStreamShim + PlecoMediaElementShim', () => {
  it('track shim: browser-member structural half (kind/id/readyState/enabled) + owned feed', () => {
    const track = new PlecoMediaStreamTrackShim()
    expect(track.kind).toBe('audio')
    expect(typeof track.id).toBe('string')
    expect(track.readyState).toBe('live')
    expect(track.enabled).toBe(true)
    expect(track.plecoSampleFeed).toBeInstanceOf(PlecoMediaSampleFeed)
    // ids are unique per shim
    expect(new PlecoMediaStreamTrackShim().id).not.toBe(new PlecoMediaStreamTrackShim().id)
  })

  it('track shim: stop() ends the track permanently; feed: null builds an UNFED track', () => {
    const track = new PlecoMediaStreamTrackShim()
    track.stop()
    expect(track.readyState).toBe('ended')
    track.stop() // idempotent
    expect(track.readyState).toBe('ended')
    expect(new PlecoMediaStreamTrackShim({ feed: null }).plecoSampleFeed).toBeNull()
  })

  it('stream shim filters by kind exactly like the browser accessors', () => {
    const a = new PlecoMediaStreamTrackShim({ kind: 'audio' })
    const v = new PlecoMediaStreamTrackShim({ kind: 'video' })
    const stream = new PlecoMediaStreamShim([v, a])
    expect(stream.getTracks()).toEqual([v, a])
    expect(stream.getAudioTracks()).toEqual([a])
    expect(stream.getVideoTracks()).toEqual([v])
  })

  it('element shim: defaults to a stereo feed; feed: null builds an UNFED element', () => {
    expect(new PlecoMediaElementShim().plecoSampleFeed.channelCount).toBe(2)
    expect(new PlecoMediaElementShim({ feed: null }).plecoSampleFeed).toBeNull()
  })
})

// ── PlecoMediaElementAudioSourceNode ────────────────────────────────────────

describe('PlecoMediaElementAudioSourceNode — validation', () => {
  it('requires an AudioContext: an OfflineAudioContext throws TypeError (spec IDL)', () => {
    const off = new PlecoOfflineAudioContext(1, RENDER_QUANTUM, SR)
    const el = new PlecoMediaElementShim({ sampleRate: SR })
    expect(() => new PlecoMediaElementAudioSourceNode(off, { mediaElement: el })).toThrow(TypeError)
  })

  it('options and the required mediaElement member are mandatory (TypeError); null options = empty dict', () => {
    const { ctx } = mockContext()
    expect(() => new PlecoMediaElementAudioSourceNode(ctx)).toThrow(TypeError)
    expect(() => new PlecoMediaElementAudioSourceNode(ctx, {})).toThrow(TypeError)
    expect(() => new PlecoMediaElementAudioSourceNode(ctx, null)).toThrow(TypeError)
    expect(() => new PlecoMediaElementAudioSourceNode(ctx, { mediaElement: 'video' })).toThrow(TypeError)
  })

  it('an UNFED element stand-in surfaces the missing adapter: NotSupportedError, never silent zeros', () => {
    const { ctx } = mockContext()
    const unfed = new PlecoMediaElementShim({ feed: null })
    expect(() => new PlecoMediaElementAudioSourceNode(ctx, { mediaElement: unfed })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => ctx.createMediaElementSource(unfed)).toThrow(/adapter/)
  })

  it('a feed declaring a mismatched sampleRate is refused: NotSupportedError (resampling is adapter scope)', () => {
    const { ctx } = mockContext() // 44100
    const el = new PlecoMediaElementShim({ sampleRate: 48000 })
    expect(() => new PlecoMediaElementAudioSourceNode(ctx, { mediaElement: el })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
  })

  it('node shape: 0 in / 1 out, AudioNode defaults, [SameObject] mediaElement', () => {
    const { ctx } = mockContext()
    const el = new PlecoMediaElementShim({ sampleRate: SR })
    const node = new PlecoMediaElementAudioSourceNode(ctx, { mediaElement: el })
    expect(node.numberOfInputs).toBe(0)
    expect(node.numberOfOutputs).toBe(1)
    expect(node.channelCount).toBe(2)
    expect(node.channelCountMode).toBe('max')
    expect(node.channelInterpretation).toBe('speakers')
    expect(node.mediaElement).toBe(el)
    expect(node.mediaElement).toBe(node.mediaElement) // [SameObject]
    expect(node._underrunFrames).toBe(0)
  })

  it('createMediaElementSource(mediaElement) factory builds the node around the element', () => {
    const { ctx } = mockContext()
    const el = new PlecoMediaElementShim({ sampleRate: SR })
    const node = ctx.createMediaElementSource(el)
    expect(node).toBeInstanceOf(PlecoMediaElementAudioSourceNode)
    expect(node.mediaElement).toBe(el)
  })
})

describe('PlecoMediaElementAudioSourceNode — rendering', () => {
  it('renders the element feed sample-exactly (mono feed up-mixed to the stereo destination)', async () => {
    const { ctx, sink } = mockContext()
    const el = new PlecoMediaElementShim({ channelCount: 1, sampleRate: SR })
    const [ramp] = rampChunk(1, RENDER_QUANTUM, 0.125)
    el.plecoSampleFeed.enqueue([ramp.slice()])
    ctx.createMediaElementSource(el).connect(ctx.destination)
    await ctx.resume()
    sink.step(1)
    // speakers 1→2 up-mix: the mono signal lands in BOTH channels.
    expect(Array.from(sink.blocks[0][0])).toEqual(Array.from(ramp))
    expect(Array.from(sink.blocks[0][1])).toEqual(Array.from(ramp))
  })

  it('an empty feed renders explicit silence and counts the underrun honestly', async () => {
    const { ctx, sink } = mockContext()
    const el = new PlecoMediaElementShim({ channelCount: 1, sampleRate: SR })
    const node = ctx.createMediaElementSource(el)
    node.connect(ctx.destination)
    await ctx.resume()
    sink.step(1)
    expect(sink.blocks[0][0].every((v) => v === 0)).toBe(true)
    expect(node._underrunFrames).toBe(RENDER_QUANTUM)
  })
})

// ── PlecoMediaStreamAudioSourceNode ─────────────────────────────────────────

describe('PlecoMediaStreamAudioSourceNode — validation', () => {
  it('requires an AudioContext: an OfflineAudioContext throws TypeError (spec IDL)', () => {
    const off = new PlecoOfflineAudioContext(1, RENDER_QUANTUM, SR)
    const { stream } = fedStream()
    expect(() => new PlecoMediaStreamAudioSourceNode(off, { mediaStream: stream })).toThrow(TypeError)
  })

  it('options and the required mediaStream member are mandatory; non-stream-likes throw TypeError', () => {
    const { ctx } = mockContext()
    expect(() => new PlecoMediaStreamAudioSourceNode(ctx)).toThrow(TypeError)
    expect(() => new PlecoMediaStreamAudioSourceNode(ctx, {})).toThrow(TypeError)
    expect(() => new PlecoMediaStreamAudioSourceNode(ctx, null)).toThrow(TypeError)
    expect(() => new PlecoMediaStreamAudioSourceNode(ctx, { mediaStream: { getTracks: () => [] } })).toThrow(TypeError)
  })

  it('a stream with no audio track throws InvalidStateError (spec constructor step 1)', () => {
    const { ctx } = mockContext()
    const empty = new PlecoMediaStreamShim([])
    const videoOnly = new PlecoMediaStreamShim([new PlecoMediaStreamTrackShim({ kind: 'video' })])
    expect(() => new PlecoMediaStreamAudioSourceNode(ctx, { mediaStream: empty })).toThrowError(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )
    expect(() => ctx.createMediaStreamSource(videoOnly)).toThrowError(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )
  })

  it('an UNFED selected track surfaces the missing adapter: NotSupportedError naming the track', () => {
    const { ctx } = mockContext()
    const stream = new PlecoMediaStreamShim([new PlecoMediaStreamTrackShim({ id: 'raw-browser-track', feed: null })])
    expect(() => ctx.createMediaStreamSource(stream)).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => ctx.createMediaStreamSource(stream)).toThrow(/raw-browser-track/)
  })

  it('a mismatched feed sampleRate is refused: NotSupportedError', () => {
    const { ctx } = mockContext()
    const { stream } = fedStream({ sampleRate: 48000 })
    expect(() => ctx.createMediaStreamSource(stream)).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
  })

  it('node shape: 0 in / 1 out, AudioNode defaults, [SameObject] mediaStream', () => {
    const { ctx } = mockContext()
    const { stream } = fedStream()
    const node = ctx.createMediaStreamSource(stream)
    expect(node.numberOfInputs).toBe(0)
    expect(node.numberOfOutputs).toBe(1)
    expect(node.channelCount).toBe(2)
    expect(node.channelCountMode).toBe('max')
    expect(node.channelInterpretation).toBe('speakers')
    expect(node.mediaStream).toBe(stream)
    expect(node.mediaStream).toBe(node.mediaStream)
  })
})

describe('PlecoMediaStreamAudioSourceNode — first-track selection (spec id code-unit ordering)', () => {
  it('selects the audio track with the code-unit-smallest id, not the stream-order first', async () => {
    const { ctx, sink } = mockContext()
    const mk = (id, value) => {
      const track = new PlecoMediaStreamTrackShim({ id, channelCount: 1, sampleRate: SR })
      const data = new Float32Array(RENDER_QUANTUM).fill(value)
      track.plecoSampleFeed.enqueue([data])
      return track
    }
    // Stream order 'b','a','c' — the sort on id picks 'a'.
    const b = mk('b', 0.5)
    const a = mk('a', 0.25)
    const c = mk('c', 0.75)
    ctx.createMediaStreamSource(new PlecoMediaStreamShim([b, a, c])).connect(ctx.destination)
    await ctx.resume()
    sink.step(1)
    expect(sink.blocks[0][0].every((v) => v === Math.fround(0.25))).toBe(true)
    // Only the selected track's feed is drained.
    expect(a.plecoSampleFeed.bufferedFrames).toBe(0)
    expect(b.plecoSampleFeed.bufferedFrames).toBe(RENDER_QUANTUM)
    expect(c.plecoSampleFeed.bufferedFrames).toBe(RENDER_QUANTUM)
  })

  it("code-unit order is NOT locale order: 'Z' sorts before 'a'", () => {
    const { ctx } = mockContext()
    const z = new PlecoMediaStreamTrackShim({ id: 'Z', channelCount: 1, sampleRate: SR })
    const aLower = new PlecoMediaStreamTrackShim({ id: 'a', feed: null }) // unfed — must NOT be selected
    const node = ctx.createMediaStreamSource(new PlecoMediaStreamShim([aLower, z]))
    // Constructing succeeded ⇒ the FED 'Z' track was selected ('a' would have
    // thrown the unfed NotSupportedError).
    expect(node).toBeInstanceOf(PlecoMediaStreamAudioSourceNode)
  })
})

describe('PlecoMediaStreamAudioSourceNode — rendering states', () => {
  it('renders a stereo track feed sample-exactly through the stereo destination', async () => {
    const { ctx, sink } = mockContext()
    const { stream, feed } = fedStream()
    const chunk = rampChunk(2, RENDER_QUANTUM, 0.03)
    feed.enqueue(chunk.map((ch) => ch.slice()))
    ctx.createMediaStreamSource(stream).connect(ctx.destination)
    await ctx.resume()
    sink.step(1)
    expect(Array.from(sink.blocks[0][0])).toEqual(Array.from(chunk[0]))
    expect(Array.from(sink.blocks[0][1])).toEqual(Array.from(chunk[1]))
  })

  it('a short read renders data-then-explicit-silence and accounts exactly the missing frames', async () => {
    const { ctx, sink } = mockContext()
    const { stream, feed } = fedStream({ channelCount: 1 })
    feed.enqueue([new Float32Array(100).fill(0.5)])
    const node = ctx.createMediaStreamSource(stream)
    node.connect(ctx.destination)
    await ctx.resume()
    sink.step(1)
    const out = sink.blocks[0][0]
    expect(Array.from(out.subarray(0, 100))).toEqual(Array(100).fill(0.5))
    expect(out.subarray(100).every((v) => v === 0)).toBe(true)
    expect(node._underrunFrames).toBe(RENDER_QUANTUM - 100)
    sink.step(1) // fully empty quantum
    expect(node._underrunFrames).toBe(2 * RENDER_QUANTUM - 100)
  })

  it('a disabled track renders silence WITHOUT draining; re-enabling resumes exactly where it left off', async () => {
    const { ctx, sink } = mockContext()
    const { stream, track, feed } = fedStream({ channelCount: 1 })
    const [ramp] = rampChunk(1, 2 * RENDER_QUANTUM, 0.2)
    feed.enqueue([ramp.slice()])
    const node = ctx.createMediaStreamSource(stream)
    node.connect(ctx.destination)
    track.enabled = false
    await ctx.resume()
    sink.step(1)
    expect(sink.blocks[0][0].every((v) => v === 0)).toBe(true)
    expect(feed.bufferedFrames).toBe(2 * RENDER_QUANTUM) // nothing drained
    expect(node._underrunFrames).toBe(0) // disabled is media semantics, not an underrun
    track.enabled = true
    sink.step(2)
    expect(Array.from(sink.blocks[1][0])).toEqual(Array.from(ramp.subarray(0, RENDER_QUANTUM)))
    expect(Array.from(sink.blocks[2][0])).toEqual(Array.from(ramp.subarray(RENDER_QUANTUM)))
  })

  it("an ended track outputs the spec's ONE channel of silence and never drains the feed", () => {
    const { ctx } = mockContext()
    const { stream, track, feed } = fedStream() // stereo feed
    feed.enqueue(rampChunk(2, RENDER_QUANTUM))
    const node = ctx.createMediaStreamSource(stream)
    track.stop()
    const block = node._tick() // direct engine pull — no graph needed
    expect(block.numberOfChannels).toBe(1)
    expect(block.getChannelData(0).every((v) => v === 0)).toBe(true)
    expect(feed.bufferedFrames).toBe(RENDER_QUANTUM)
  })
})

// ── PlecoMediaStreamTrackAudioSourceNode ────────────────────────────────────

describe('PlecoMediaStreamTrackAudioSourceNode', () => {
  it('requires an AudioContext and the mediaStreamTrack member (TypeError)', () => {
    const off = new PlecoOfflineAudioContext(1, RENDER_QUANTUM, SR)
    const track = new PlecoMediaStreamTrackShim({ sampleRate: SR })
    expect(() => new PlecoMediaStreamTrackAudioSourceNode(off, { mediaStreamTrack: track })).toThrow(TypeError)
    const { ctx } = mockContext()
    expect(() => new PlecoMediaStreamTrackAudioSourceNode(ctx)).toThrow(TypeError)
    expect(() => new PlecoMediaStreamTrackAudioSourceNode(ctx, {})).toThrow(TypeError)
    expect(() => new PlecoMediaStreamTrackAudioSourceNode(ctx, { mediaStreamTrack: 42 })).toThrow(TypeError)
  })

  it("kind !== 'audio' throws InvalidStateError (spec constructor step 1 — absent from the reference)", () => {
    const { ctx } = mockContext()
    const video = new PlecoMediaStreamTrackShim({ kind: 'video' })
    expect(() => ctx.createMediaStreamTrackSource(video)).toThrowError(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )
  })

  it('an unfed track → NotSupportedError; a mismatched feed rate → NotSupportedError', () => {
    const { ctx } = mockContext()
    expect(() => ctx.createMediaStreamTrackSource(new PlecoMediaStreamTrackShim({ feed: null }))).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(() => ctx.createMediaStreamTrackSource(new PlecoMediaStreamTrackShim({ sampleRate: 22050 }))).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
  })

  it('spec IDL declares NO attributes: the track is not re-exposed on the node', () => {
    const { ctx } = mockContext()
    const track = new PlecoMediaStreamTrackShim({ sampleRate: SR })
    const node = ctx.createMediaStreamTrackSource(track)
    expect(node).toBeInstanceOf(PlecoMediaStreamTrackAudioSourceNode)
    expect(node.mediaStreamTrack).toBeUndefined()
    expect(node.numberOfInputs).toBe(0)
    expect(node.numberOfOutputs).toBe(1)
  })

  it('renders its track feed sample-exactly (explicit track choice, no id sorting involved)', async () => {
    const { ctx, sink } = mockContext()
    const track = new PlecoMediaStreamTrackShim({ channelCount: 2, sampleRate: SR })
    const chunk = rampChunk(2, RENDER_QUANTUM, 0.07)
    track.plecoSampleFeed.enqueue(chunk.map((ch) => ch.slice()))
    ctx.createMediaStreamTrackSource(track).connect(ctx.destination)
    await ctx.resume()
    sink.step(1)
    expect(Array.from(sink.blocks[0][0])).toEqual(Array.from(chunk[0]))
    expect(Array.from(sink.blocks[0][1])).toEqual(Array.from(chunk[1]))
  })
})

// ── PlecoMediaStreamAudioDestinationNode ────────────────────────────────────

describe('PlecoMediaStreamAudioDestinationNode — validation + shape', () => {
  it('requires an AudioContext (TypeError on an OfflineAudioContext)', () => {
    const off = new PlecoOfflineAudioContext(1, RENDER_QUANTUM, SR)
    expect(() => new PlecoMediaStreamAudioDestinationNode(off)).toThrow(TypeError)
  })

  it("spec node table: 1 in / 0 out, channelCount 2, mode 'explicit', interpretation 'speakers'", () => {
    const { ctx } = mockContext()
    const node = ctx.createMediaStreamDestination()
    expect(node.numberOfInputs).toBe(1)
    expect(node.numberOfOutputs).toBe(0)
    expect(node.channelCount).toBe(2)
    expect(node.channelCountMode).toBe('explicit')
    expect(node.channelInterpretation).toBe('speakers')
  })

  it("stream: one 'audio'-kind track whose feed width is the node's channelCount, [SameObject]", () => {
    const { ctx } = mockContext()
    const node = ctx.createMediaStreamDestination()
    expect(node.stream).toBe(node.stream)
    const tracks = node.stream.getAudioTracks()
    expect(tracks).toHaveLength(1)
    expect(node.stream.getTracks()).toHaveLength(1)
    expect(tracks[0].kind).toBe('audio')
    expect(tracks[0].readyState).toBe('live')
    expect(tracks[0].plecoSampleFeed.channelCount).toBe(2)
    expect(tracks[0].plecoSampleFeed.sampleRate).toBe(ctx.sampleRate)
  })

  it('AudioNodeOptions apply: channelCount follows into the track feed; invalid enum → ctor-dict TypeError; null = empty dict', () => {
    const { ctx } = mockContext()
    const mono = new PlecoMediaStreamAudioDestinationNode(ctx, { channelCount: 1 })
    expect(mono.channelCount).toBe(1)
    expect(mono.stream.getAudioTracks()[0].plecoSampleFeed.channelCount).toBe(1)
    expect(() => new PlecoMediaStreamAudioDestinationNode(ctx, { channelCountMode: 'nope' })).toThrow(TypeError)
    expect(() => new PlecoMediaStreamAudioDestinationNode(ctx, { channelCount: 0 })).toThrowError(
      expect.objectContaining({ name: 'NotSupportedError' }),
    )
    expect(new PlecoMediaStreamAudioDestinationNode(ctx, null).channelCount).toBe(2)
  })
})

describe('PlecoMediaStreamAudioDestinationNode — input mix → track feed', () => {
  it('exposes the input mix through the track feed, one chunk per rendered quantum, sample-exact', async () => {
    const { ctx, sink } = mockContext()
    const node = ctx.createMediaStreamDestination()
    const source = ctx.createConstantSource()
    source.offset.value = 0.25
    source.connect(node)
    source.start(0)
    await ctx.resume()
    sink.step(3)
    const feed = node.stream.getAudioTracks()[0].plecoSampleFeed
    expect(feed.bufferedFrames).toBe(3 * RENDER_QUANTUM)
    const out = feed.read(3 * RENDER_QUANTUM)
    expect(out).toHaveLength(2) // mono constant up-mixed to the explicit stereo input
    expect(out[0].every((v) => v === Math.fround(0.25))).toBe(true)
    expect(out[1].every((v) => v === Math.fround(0.25))).toBe(true)
  })

  it('an unconnected destination captures silence at the track width (documented ports shortcut adaptation)', async () => {
    const { ctx, sink } = mockContext()
    const node = ctx.createMediaStreamDestination()
    await ctx.resume()
    sink.step(1)
    const out = node.stream.getAudioTracks()[0].plecoSampleFeed.read(RENDER_QUANTUM)
    expect(out).toHaveLength(2)
    expect(out[0].every((v) => v === 0)).toBe(true)
    expect(out[1].every((v) => v === 0)).toBe(true)
  })

  it('down-mixes a wider input to the track width under non-explicit mode (sums, never drops — speakers interpretation)', async () => {
    // Track width is pinned to node.channelCount (=1 here). A caller who moves
    // channelCountMode off 'explicit' and feeds a stereo source must get the
    // spec 'speakers' stereo->mono down-mix 0.5*(L+R), not a dropped R channel.
    const { ctx, sink } = mockContext()
    const node = ctx.createMediaStreamDestination()
    node.channelCount = 1
    node.channelCountMode = 'max' // now the stereo source's 2 channels reach the input
    const merger = ctx.createChannelMerger(2)
    const l = ctx.createConstantSource(); l.offset.value = 0.4
    const r = ctx.createConstantSource(); r.offset.value = 0.2
    l.connect(merger, 0, 0); r.connect(merger, 0, 1)
    merger.connect(node)
    l.start(0); r.start(0)
    await ctx.resume()
    sink.step(1)
    const out = node.stream.getAudioTracks()[0].plecoSampleFeed.read(RENDER_QUANTUM)
    expect(out).toHaveLength(1) // track width = channelCount 1
    const expected = Math.fround(0.5 * (Math.fround(0.4) + Math.fround(0.2)))
    expect(out[0].every((v) => v === expected)).toBe(true) // summed, not dropped
  })

  it('a stopped track receives no further chunks (Media Capture: ended never produces again)', async () => {
    const { ctx, sink } = mockContext()
    const node = ctx.createMediaStreamDestination()
    const track = node.stream.getAudioTracks()[0]
    await ctx.resume()
    sink.step(1)
    expect(track.plecoSampleFeed.bufferedFrames).toBe(RENDER_QUANTUM)
    track.stop()
    sink.step(2)
    expect(track.plecoSampleFeed.bufferedFrames).toBe(RENDER_QUANTUM)
  })

  it('round-trip: destination stream in one context feeds a MediaStreamAudioSourceNode in another, sample-exact', async () => {
    // Context A: constant 0.25 → media destination (its track feed fills up).
    const { ctx: ctxA, sink: sinkA } = mockContext()
    const dest = ctxA.createMediaStreamDestination()
    const source = ctxA.createConstantSource()
    source.offset.value = 0.25
    source.connect(dest)
    source.start(0)
    await ctxA.resume()
    sinkA.step(2)
    // Context B consumes dest.stream directly — the duck shapes line up by
    // construction (stream-like → track-like → feed), the inverse direction.
    const { ctx: ctxB, sink: sinkB } = mockContext()
    ctxB.createMediaStreamSource(dest.stream).connect(ctxB.destination)
    await ctxB.resume()
    sinkB.step(2)
    for (const block of sinkB.blocks) {
      expect(block[0].every((v) => v === Math.fround(0.25))).toBe(true)
      expect(block[1].every((v) => v === Math.fround(0.25))).toBe(true)
    }
  })
})

// ── Factory placement (AudioContext-only, per the spec IDL) ─────────────────

describe('the four factories live on AudioContext, NOT BaseAudioContext', () => {
  it('OfflineAudioContext has none of the four create* methods', () => {
    const off = new PlecoOfflineAudioContext(1, RENDER_QUANTUM, SR)
    expect(off.createMediaElementSource).toBeUndefined()
    expect(off.createMediaStreamSource).toBeUndefined()
    expect(off.createMediaStreamTrackSource).toBeUndefined()
    expect(off.createMediaStreamDestination).toBeUndefined()
  })

  it('PlecoAudioContext vends all four node types', () => {
    const { ctx } = mockContext()
    const { stream, track } = fedStream()
    expect(ctx.createMediaElementSource(new PlecoMediaElementShim({ sampleRate: SR }))).toBeInstanceOf(
      PlecoMediaElementAudioSourceNode,
    )
    expect(ctx.createMediaStreamSource(stream)).toBeInstanceOf(PlecoMediaStreamAudioSourceNode)
    expect(ctx.createMediaStreamTrackSource(track)).toBeInstanceOf(PlecoMediaStreamTrackAudioSourceNode)
    expect(ctx.createMediaStreamDestination()).toBeInstanceOf(PlecoMediaStreamAudioDestinationNode)
  })
})
