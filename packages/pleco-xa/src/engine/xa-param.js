/**
 * engine/xa-param.js — PlecoAudioParam.
 *
 * Slice-1 scope: a constant scalar value, sampled a-rate across the quantum
 * (`gain.value = 0.5`). The scheduled automation curve — setValueAtTime,
 * linearRampToValueAtTime, exponentialRamp, setTargetAtTime (for de-click
 * ramps), cancelScheduledValues — is the NEXT param slice and is deliberately
 * NOT stubbed here: only the constant-value contract the render spine actually
 * exercises is implemented. Connected (audio-rate) param modulation is
 * parity-later; the Echoplex drives params with scalars, never an LFO node.
 */

import { PlecoAudioPort } from './xa-ports.js'

const F32_MAX = 3.4028234663852886e38

export class PlecoAudioParam {
  /**
   * `context` is the owning node's BaseAudioContext (used by
   * PlecoNode.connect for the spec's cross-context InvalidAccessError check);
   * `_input` is the param's input port — node→param connections land here as
   * bidirectional edges (stored now, consumed by the automation slice, P04).
   */
  constructor({ defaultValue = 0, minValue = -F32_MAX, maxValue = F32_MAX, context = null } = {}) {
    this.defaultValue = defaultValue
    this.minValue = minValue
    this.maxValue = maxValue
    this._value = defaultValue
    this._context = context
    this._input = new PlecoAudioPort(this, 0)
  }

  get value() {
    return this._value
  }

  set value(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new TypeError(`AudioParam.value must be a finite number, got ${v}`)
    }
    this._value = Math.min(this.maxValue, Math.max(this.minValue, v))
  }

  /** Fill `out` (a RENDER_QUANTUM-length Float32Array) with this quantum's a-rate values. */
  fillBlock(out) {
    out.fill(this._value)
    return out
  }
}
