/**
 * engine/xa-listener.js — PlecoAudioListener (AudioListener) + the context
 * listener vend (P19).
 *
 * Spec-shaped AudioListener (spec § The AudioListener Interface): the position
 * and orientation of the person listening to the audio scene, expressed as
 * NINE readonly a-rate AudioParams — positionX/positionY/positionZ (default
 * 0/0/0), forwardX/forwardY/forwardZ (default 0/0/-1) and upX/upY/upZ
 * (default 0/1/0) — each with the full single-float nominal range. All
 * PannerNodes spatialize in relation to the context's single listener
 * (BaseAudioContext.listener). Per the spec's Processing note, every
 * PannerNode effectively has the AudioListener as an input: pleco's pull
 * graph realizes that ordering naturally, because each panner pulls the
 * listener's params (and, through their input ports, any AudioNodes
 * connected to them) inside its own _process.
 *
 * PER-QUANTUM CACHING: _quantum(now) renders all nine params' a-rate blocks
 * into preallocated Float32Arrays ONCE per render quantum (keyed by
 * context.currentTime) and hands the same block set to every PannerNode in
 * the graph — the checklist's "per-quantum caching shared across
 * PannerNodes". The blocks are a-rate because the spec's equalpower panning
 * demands a-rate processing whenever ANY panner/listener AudioParam is
 * a-rate (§ PannerNode "equalpower" Panning), and all nine default to
 * a-rate.
 *
 * THE VEND: the spec's AudioListener has no constructor — it exists only as
 * BaseAudioContext.listener. getContextListener(context) is the engine's
 * single vending path (lazy, one listener per context, stored on
 * context._listener), designed so the BaseAudioContext getter is trivial:
 *
 *     get listener() { return getContextListener(this) }
 *
 * (That one-line getter + this file's import are the ONLY xa-base-context.js
 * additions this slice needs; they are reported, not applied, because the
 * file is owned by a concurrent slice.) PlecoAudioListener stays directly
 * constructible for the same documented reason as PlecoAudioParam (P04
 * header): engine-internal composition; the public surface only ever sees
 * the context's singleton.
 *
 * DEPRECATED CONVENIENCES (spec § AudioListener, Methods — both marked
 * DEPRECATED in the spec and shipped here as flagged conveniences):
 * setPosition(x, y, z) and setOrientation(x, y, z, xUp, yUp, zUp) are
 * equivalent to setting the corresponding AudioParams' .value attributes.
 * Argument conversion follows WebIDL float: non-finite → TypeError (rejecting
 * non-numbers outright is deliberate pleco strictness, not spec behavior).
 * Per the spec's normative clause, a NotSupportedError MUST be thrown if any
 * of the touched params has an automation curve set with setValueCurveAtTime
 * at the time the method is called — pleco checks ALL touched params BEFORE
 * writing any value, so a throwing call leaves every param untouched
 * (atomic; pure sequential .value delegation would half-apply).
 */

import { PlecoAudioParam } from './xa-param.js'
import { RENDER_QUANTUM } from './xa-constants.js'
import { notSupportedError } from './xa-errors.js'

/**
 * The engine's single AudioListener vending path: lazily construct one
 * listener per context and memoize it on context._listener. This is the
 * exact body the BaseAudioContext.listener getter delegates to.
 */
export function getContextListener(context) {
  return context._listener ?? (context._listener = new PlecoAudioListener(context))
}

/**
 * WebIDL `float` conversion for the deprecated 3D setters: non-finite →
 * TypeError, finite values round to float32. (Rejecting non-number arguments
 * instead of ToNumber coercion is pleco strictness — see file header.)
 * Shared with PlecoPannerNode's deprecated setters.
 */
export function webidlFloat(method, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`${method}: ${name} must be a finite number, got ${v}`)
  }
  return Math.fround(v)
}

/**
 * Spec deprecated-method guard (§ AudioListener/§ PannerNode Methods): if any
 * of `params` has a setValueCurveAtTime window containing time `t`, throw
 * NotSupportedError. This is exactly the condition the .value setter's
 * implicit setValueAtTime(value, currentTime) would hit — hoisted so the
 * check runs across ALL touched params before ANY value is written.
 * Shared with PlecoPannerNode's deprecated setters.
 */
export function assertNoActiveSetValueCurve(method, params, t) {
  for (const p of params) {
    for (const e of p._events) {
      if (e.type === 'setValueCurve' && t >= e.time && t < e.time + e.duration) {
        throw notSupportedError(
          `${method}: an AudioParam has an active setValueCurveAtTime automation at time ${t}`,
        )
      }
    }
  }
}

export class PlecoAudioListener {
  #positionX
  #positionY
  #positionZ
  #forwardX
  #forwardY
  #forwardZ
  #upX
  #upY
  #upZ

  /** @param {object} context — the owning PlecoBaseContext. */
  constructor(context) {
    if (context == null || typeof context.sampleRate !== 'number') {
      throw new TypeError('PlecoAudioListener: a context is required')
    }
    this._context = context
    // Nine a-rate AudioParams (spec attribute table): full single-float
    // nominal range (the PlecoAudioParam default), defaults per spec —
    // forward (0, 0, -1), up (0, 1, 0), position at the origin.
    this.#positionX = new PlecoAudioParam({ defaultValue: 0, context })
    this.#positionY = new PlecoAudioParam({ defaultValue: 0, context })
    this.#positionZ = new PlecoAudioParam({ defaultValue: 0, context })
    this.#forwardX = new PlecoAudioParam({ defaultValue: 0, context })
    this.#forwardY = new PlecoAudioParam({ defaultValue: 0, context })
    this.#forwardZ = new PlecoAudioParam({ defaultValue: -1, context })
    this.#upX = new PlecoAudioParam({ defaultValue: 0, context })
    this.#upY = new PlecoAudioParam({ defaultValue: 1, context })
    this.#upZ = new PlecoAudioParam({ defaultValue: 0, context })
    // Per-quantum a-rate block cache, shared by every PannerNode: p* =
    // position, f* = forward, u* = up. Preallocated once — _quantum never
    // allocates.
    this._cacheTime = -1
    this._blocks = {
      px: new Float32Array(RENDER_QUANTUM),
      py: new Float32Array(RENDER_QUANTUM),
      pz: new Float32Array(RENDER_QUANTUM),
      fx: new Float32Array(RENDER_QUANTUM),
      fy: new Float32Array(RENDER_QUANTUM),
      fz: new Float32Array(RENDER_QUANTUM),
      ux: new Float32Array(RENDER_QUANTUM),
      uy: new Float32Array(RENDER_QUANTUM),
      uz: new Float32Array(RENDER_QUANTUM),
    }
  }

  get positionX() {
    return this.#positionX
  }

  get positionY() {
    return this.#positionY
  }

  get positionZ() {
    return this.#positionZ
  }

  get forwardX() {
    return this.#forwardX
  }

  get forwardY() {
    return this.#forwardY
  }

  get forwardZ() {
    return this.#forwardZ
  }

  get upX() {
    return this.#upX
  }

  get upY() {
    return this.#upY
  }

  get upZ() {
    return this.#upZ
  }

  /**
   * The listener's a-rate blocks for the quantum starting at context time
   * `now`, computed once per quantum and shared across every PannerNode
   * (see file header). Pulling a param's fillBlock also pulls any AudioNodes
   * connected to it, which is what makes the listener an implicit input of
   * every panner (spec § AudioListener Processing).
   */
  _quantum(now) {
    if (this._cacheTime === now) return this._blocks
    const b = this._blocks
    this.#positionX.fillBlock(b.px, now)
    this.#positionY.fillBlock(b.py, now)
    this.#positionZ.fillBlock(b.pz, now)
    this.#forwardX.fillBlock(b.fx, now)
    this.#forwardY.fillBlock(b.fy, now)
    this.#forwardZ.fillBlock(b.fz, now)
    this.#upX.fillBlock(b.ux, now)
    this.#upY.fillBlock(b.uy, now)
    this.#upZ.fillBlock(b.uz, now)
    this._cacheTime = now
    return b
  }

  /**
   * DEPRECATED (spec § AudioListener setPosition()) — flagged convenience,
   * equivalent to setting positionX/positionY/positionZ .value with x/y/z.
   * NotSupportedError if any of the three has an active setValueCurveAtTime
   * automation at the current time (checked atomically — see file header).
   */
  setPosition(x, y, z) {
    const fx = webidlFloat('PlecoAudioListener.setPosition', 'x', x)
    const fy = webidlFloat('PlecoAudioListener.setPosition', 'y', y)
    const fz = webidlFloat('PlecoAudioListener.setPosition', 'z', z)
    assertNoActiveSetValueCurve(
      'PlecoAudioListener.setPosition',
      [this.#positionX, this.#positionY, this.#positionZ],
      this._context.currentTime,
    )
    this.#positionX.value = fx
    this.#positionY.value = fy
    this.#positionZ.value = fz
  }

  /**
   * DEPRECATED (spec § AudioListener setOrientation()) — flagged convenience,
   * equivalent to setting forwardX/forwardY/forwardZ and upX/upY/upZ .value
   * with x/y/z and xUp/yUp/zUp. NotSupportedError if any of the six has an
   * active setValueCurveAtTime automation at the current time (atomic).
   */
  setOrientation(x, y, z, xUp, yUp, zUp) {
    const fx = webidlFloat('PlecoAudioListener.setOrientation', 'x', x)
    const fy = webidlFloat('PlecoAudioListener.setOrientation', 'y', y)
    const fz = webidlFloat('PlecoAudioListener.setOrientation', 'z', z)
    const fux = webidlFloat('PlecoAudioListener.setOrientation', 'xUp', xUp)
    const fuy = webidlFloat('PlecoAudioListener.setOrientation', 'yUp', yUp)
    const fuz = webidlFloat('PlecoAudioListener.setOrientation', 'zUp', zUp)
    assertNoActiveSetValueCurve(
      'PlecoAudioListener.setOrientation',
      [this.#forwardX, this.#forwardY, this.#forwardZ, this.#upX, this.#upY, this.#upZ],
      this._context.currentTime,
    )
    this.#forwardX.value = fx
    this.#forwardY.value = fy
    this.#forwardZ.value = fz
    this.#upX.value = fux
    this.#upY.value = fuy
    this.#upZ.value = fuz
  }
}
