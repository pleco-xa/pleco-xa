/**
 * engine/nodes/xa-delay.js — PlecoDelayNode (P11).
 *
 * Spec-shaped DelayNode (spec § The DelayNode Interface): one input, one
 * output, output(t) = input(t − delayTime(t)). The a-rate `delayTime`
 * AudioParam has defaultValue 0, minValue 0 and maxValue = maxDelayTime, so
 * the automation output is already clamped to [0, maxDelayTime] by the
 * param's nominal-range clamp. DelayOptions.maxDelayTime must lie in
 * (0, 180) seconds or a NotSupportedError DOMException is thrown (spec
 * § createDelay(maxDelayTime)); a non-finite maxDelayTime/delayTime is a
 * WebIDL restricted-`double` TypeError. Rejecting non-number dictionary
 * members outright instead of coercing via WebIDL ToNumber is deliberate
 * pleco strictness, not spec behavior.
 *
 * DSP: one ring buffer per channel, ceil(maxDelayTime·sampleRate) +
 * RENDER_QUANTUM frames long. Each quantum outside a cycle is
 * write-then-read — the input block is written first so delayTime 0 is an
 * exact passthrough — with a linear-interpolated fractional read: for output
 * frame i, readPos = writeIndex + i − delaySamples(i), sample =
 * ring[⌊readPos⌋] + frac·(ring[⌊readPos⌋+1] − ring[⌊readPos⌋]). Ring buffers
 * are Float32Array, so every write and every interpolated read result passes
 * the float32 boundary. When the input channel count changes, the retained
 * delayed samples are up/down-mixed to the prevailing layout via the spec
 * mixing tables (mixInto with this node's channelInterpretation), per
 * § DelayNode "all internal delay-line mixing takes place using the single
 * prevailing channel layout".
 *
 * THE CYCLE RULE, delay half (spec § rendering-loop step 4.2 — a cycle is
 * legal only if it contains a DelayNode, which is then split into a
 * DelayWriter and a DelayReader; xa-node.js owns detection): when
 * _enterCycle(now) marks this delay as inside a cycle for the quantum, it
 * switches to read-before-write with delayTime clamped to a minimum of one
 * render quantum (spec § DelayNode.delayTime: "If DelayNode is part of a
 * cycle, then the value of the delayTime attribute is clamped to a minimum
 * of one render quantum"):
 * - READ (the DelayReader): the output block comes from the ring buffer
 *   only — computable before the input resolves, so a re-entrant pull gets
 *   the exact this-quantum block via _cycleReentryBlock().
 * - DEFERRED WRITE (the DelayWriter): the input pulled mid-cycle is stale,
 *   so the write is queued on the context and flushed AFTER the graph pull
 *   (renderQuantum() ticks context._tailNodes after the destination pull —
 *   the flush hook registers there; no base-context change needed). Before
 *   re-pulling, the flush invalidates the per-quantum memo of every segment
 *   node that consumed a provisional previous-quantum re-entry block
 *   (context._cycleStaleMemos, marked by xa-node.js), so the re-pull
 *   recomputes those nodes against this delay's settled ring read and writes
 *   THAT into the ring — correct for any re-entry point, not just re-entry
 *   at the delay or at its direct input.
 * If a cycle runs through the delayTime param itself (the param's input
 * pull re-enters this delay before the a-rate block is resolved), the
 * re-entrant read falls back to a k-rate snapshot of delayTime.value for
 * that quantum — documented engine behavior, never a silent failure.
 */
import { PlecoNode } from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { mixInto } from '../xa-channel-mixing.js'
import { notSupportedError } from '../xa-errors.js'

/** Wrap per-channel ring Float32Arrays as an AudioBuffer-shaped object for mixInto(). */
function ringView(channels, length) {
  return { numberOfChannels: channels.length, length, getChannelData: (c) => channels[c] }
}

/**
 * The context's deferred-DelayWriter queue (engine-internal registry,
 * created lazily). Its flush hook is a tail entry in context._tailNodes:
 * renderQuantum() ticks the tail set immediately after the destination
 * pull, which is exactly the spec's "after the graph is processed" point —
 * and nothing ticked from the tail set can queue new deferred writes
 * (scheduled sources have zero inputs), so draining here is complete.
 */
function deferredDelayWrites(context) {
  let queue = context._delayDeferredWrites
  if (queue === undefined) {
    queue = []
    context._delayDeferredWrites = queue
    context._tailNodes.add({
      _tick() {
        // Invalidate the per-quantum memo of every node that consumed a
        // provisional (previous-quantum) re-entry block during the cycle pull
        // (marked by xa-node.js _handleCycleReentry) BEFORE flushing any
        // writer, so each _flushDeferredWrite re-pull recomputes those nodes
        // against the delay's settled ring read instead of committing a
        // stale-tainted block to the ring (spec § DelayNode processing: the
        // DelayReader is a source — in-cycle nodes consume THIS quantum's
        // reader output).
        const stale = context._cycleStaleMemos
        if (stale !== undefined && stale.size > 0) {
          for (const node of stale) node._cacheTime = -1
          stale.clear()
        }
        while (queue.length > 0) queue.shift()._flushDeferredWrite()
      },
    })
  }
  return queue
}

export class PlecoDelayNode extends PlecoNode {
  #delayTime
  #maxDelayTime

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — DelayOptions {maxDelayTime = 1, delayTime = 0}
   *   plus AudioNodeOptions. maxDelayTime outside (0, 180) s →
   *   NotSupportedError; non-finite members → TypeError.
   */
  constructor(context, options = {}) {
    options = options ?? {} // WebIDL dictionary conversion: null is the empty dictionary
    super(context, { ...options, numberOfInputs: 1, numberOfOutputs: 1 })
    const { maxDelayTime = 1, delayTime = 0 } = options
    if (typeof maxDelayTime !== 'number' || !Number.isFinite(maxDelayTime)) {
      throw new TypeError(`PlecoDelayNode: maxDelayTime must be a finite number, got ${maxDelayTime}`)
    }
    if (!(maxDelayTime > 0 && maxDelayTime < 180)) {
      throw notSupportedError(
        `PlecoDelayNode: maxDelayTime must be greater than 0 and less than 180 seconds, got ${maxDelayTime}`,
      )
    }
    if (typeof delayTime !== 'number' || !Number.isFinite(delayTime)) {
      throw new TypeError(`PlecoDelayNode: delayTime must be a finite number, got ${delayTime}`)
    }
    this.#maxDelayTime = maxDelayTime
    this.#delayTime = new PlecoAudioParam({ defaultValue: 0, minValue: 0, maxValue: maxDelayTime, context })
    if (delayTime !== 0) this.#delayTime.value = delayTime

    // Ring state. _writeIndex is where THIS quantum's input lands; it only
    // advances when a quantum is actually written (immediately outside a
    // cycle, at the deferred flush inside one).
    this._ringLength = Math.ceil(maxDelayTime * context.sampleRate) + RENDER_QUANTUM
    this._ring = [] // per-channel Float32Array(this._ringLength)
    this._writeIndex = 0
    // Per-quantum working state, keyed by currentTime so it self-expires.
    this._delayBlock = new Float32Array(RENDER_QUANTUM)
    this._delayBlockTime = -1
    this._readBlock = null
    this._readTime = -1
    this._inCycleAt = -1
    // The marker xa-node.js's cycle detection looks for (spec: a cycle is
    // legal only if it contains at least one DelayNode).
    this._isDelayCycleBreaker = true
  }

  get delayTime() {
    return this.#delayTime
  }

  /** Resolve the a-rate delayTime block BEFORE the input pull (xa-node.js hook). */
  _prepareQuantum(now) {
    if (this._delayBlockTime === now) return
    this.#delayTime.fillBlock(this._delayBlock, now)
    this._delayBlockTime = now
  }

  /** Cycle detection (xa-node.js) marks this delay as inside a cycle for the quantum. */
  _enterCycle(now) {
    this._inCycleAt = now
  }

  /** A re-entrant pull inside a legal cycle gets the exact this-quantum ring read. */
  _cycleReentryBlock(now) {
    return this._computeRead(now)
  }

  /**
   * The DelayReader: this quantum's output block from the ring buffer,
   * computed once per quantum (cached on _readTime). Inside a cycle the
   * per-sample delay is clamped to a minimum of one render quantum, so the
   * read never touches frames not yet written this quantum. If the a-rate
   * block is not resolved yet (a cycle through the delayTime param), a
   * k-rate snapshot of delayTime.value stands in for the quantum.
   */
  _computeRead(now) {
    if (this._readTime === now) return this._readBlock
    const sr = this.context.sampleRate
    const minDelaySamples = this._inCycleAt === now ? RENDER_QUANTUM : 0
    const aRateReady = this._delayBlockTime === now
    const kSnapshot = aRateReady
      ? 0
      : Math.min(this.#maxDelayTime, Math.max(0, this.#delayTime.value))
    const channels = this._ring.length === 0 ? 1 : this._ring.length
    const out = createPlecoAudioBuffer(channels, RENDER_QUANTUM, sr)
    const ringLen = this._ringLength
    const w = this._writeIndex
    for (let c = 0; c < this._ring.length; c++) {
      const ring = this._ring[c]
      const dst = out.getChannelData(c)
      for (let i = 0; i < RENDER_QUANTUM; i++) {
        const seconds = aRateReady ? this._delayBlock[i] : kSnapshot
        const d = Math.max(seconds * sr, minDelaySamples)
        let pos = (w + i - d) % ringLen
        if (pos < 0) pos += ringLen
        const k = Math.floor(pos)
        const frac = pos - k
        const a = ring[k]
        const b = ring[(k + 1) % ringLen]
        dst[i] = a + frac * (b - a) // Float32Array store — the float32 boundary
      }
    }
    this._readTime = now
    this._readBlock = out
    return out
  }

  /**
   * Match the ring's channel layout to `channels`, up/down-mixing any
   * retained delayed samples into the prevailing layout via the spec mixing
   * tables (§ DelayNode channel-count-change rule). Fresh channels start
   * silent; mixInto accumulates into them.
   */
  _ensureRing(channels) {
    if (this._ring.length === channels) return
    const old = this._ring
    const next = []
    for (let c = 0; c < channels; c++) next.push(new Float32Array(this._ringLength))
    if (old.length > 0) {
      mixInto(ringView(next, this._ringLength), ringView(old, this._ringLength), this.channelInterpretation)
    }
    this._ring = next
  }

  /**
   * The DelayWriter: write one input quantum at _writeIndex. Does NOT advance
   * the index — the reader computes offsets relative to the same quantum base,
   * so the caller advances only after the quantum's read has resolved
   * (_advanceQuantum).
   */
  _writeQuantum(input) {
    const w = this._writeIndex
    const len = this._ringLength
    for (let c = 0; c < this._ring.length; c++) {
      const ring = this._ring[c]
      const src = input.getChannelData(c)
      for (let i = 0; i < RENDER_QUANTUM; i++) ring[(w + i) % len] = src[i]
    }
  }

  /** Move the ring's quantum base forward once this quantum's write is committed. */
  _advanceQuantum() {
    this._writeIndex = (this._writeIndex + RENDER_QUANTUM) % this._ringLength
  }

  _process(input) {
    const now = this.context.currentTime
    if (this._inCycleAt === now) {
      // In a cycle: read-before-write. The output was (or is now) computed
      // from past ring data only; `input` was pulled mid-cycle and is stale,
      // so the write is deferred to the post-pull flush, which re-pulls the
      // settled memoized graph.
      deferredDelayWrites(this.context).push(this)
      return this._computeRead(now)
    }
    // Not in a cycle: write-then-read, so delayTime 0 is exact passthrough
    // and the output channel count equals the input's (spec § DelayNode).
    this._ensureRing(input.numberOfChannels)
    this._writeQuantum(input)
    const out = this._computeRead(now)
    this._advanceQuantum()
    return out
  }

  /** Post-pull DelayWriter flush: re-pull the settled input and commit it to the ring. */
  _flushDeferredWrite() {
    const input = this._inputs[0]._pull()
    this._ensureRing(input.numberOfChannels)
    this._writeQuantum(input)
    this._advanceQuantum()
  }
}
