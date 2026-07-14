/**
 * engine/nodes/xa-panner.js — PlecoPannerNode (P19).
 *
 * Spec-shaped PannerNode (spec § The PannerNode Interface): positions an
 * incoming mono/stereo stream in 3D space relative to the context's single
 * AudioListener (BaseAudioContext.listener — vended through
 * getContextListener, see xa-listener.js). One input, one output; the output
 * is hard-coded to stereo. Node table: channelCount 2 (constraints),
 * channelCountMode 'clamped-max' (constraints), channelInterpretation
 * 'speakers', tail-time zero under equalpower.
 *
 * SIX a-rate AudioParams: positionX/positionY/positionZ (default 0) and
 * orientationX/orientationY/orientationZ (default 1/0/0), each with the full
 * single-float nominal range.
 *
 * EQUALPOWER PANNING (§ Azimuth and Elevation + § PannerNode "equalpower"
 * Panning, both implemented verbatim, per sample): the azimuth algorithm with
 * its three degenerate-case exits (source at the listener; forward/up
 * linearly dependent so listenerRight is zero; source on the up axis so the
 * projection is zero — the spec normalizes a zero vector there, pleco takes
 * azimuth 0, matching the reference), then the spec's clamp-to-[-180,180] +
 * wrap-to-[-90,90], the mono x = (azimuth+90)/180 / stereo two-branch
 * normalization, gainL = cos(x·π/2), gainR = sin(x·π/2), and the asymmetric
 * stereo mix branches. Elevation is computed by the spec algorithm but
 * IGNORED by equalpower (§ "in which case the elevation value is ignored"),
 * so pleco does not compute it. All vector math runs on scalar locals —
 * allocation-free per sample; math in double precision with the Float32Array
 * store as the float32 boundary.
 *
 * GAIN ORDERING (§ equalpower step 6): panning is applied FIRST (stored to
 * float32), then the block is scaled by totalGain = coneGain · distanceGain.
 *
 * DISTANCE (§ Distance Effects + the DistanceModelType formulas, verbatim):
 *   linear       1 − f'·(clamp(d, d'ref, d'max) − d'ref)/(d'max − d'ref)
 *                with d'ref = min(dref, dmax), d'max = max(dref, dmax), and
 *                f' = rolloffFactor clamped to the linear model's nominal
 *                range [0, 1] AT PROCESSING TIME (the attribute keeps the set
 *                value); d'ref = d'max degenerates to 1 − f'.
 *   inverse      dref / (dref + f·(max(d, dref) − dref)); dref = 0 → 0.
 *   exponential  (max(d, dref)/dref)^(−f); dref = 0 → 0.
 *
 * SOUND CONE (§ Sound Cones, verbatim): unity when the orientation is zero or
 * both angles are 360; inner half-angle → 1, outer half-angle →
 * coneOuterGain, linear interpolation between. DOCUMENTED DIVERGENCE from
 * the spec PSEUDOCODE: the spec's coneGain() computes sourceToListener as
 * sourcePosition − listenerPosition, but the prose ("a sound source pointing
 * directly at the listener will be louder"), the cone diagram, the audiojs
 * reference, and shipping browsers all require the listener − source
 * direction; pleco uses listener − source. A source AT the listener has no
 * defined direction — cone gain is unity there.
 *
 * ATTRIBUTE CONSTRAINTS (all spec-normative): refDistance set negative →
 * RangeError; maxDistance set non-positive → RangeError; rolloffFactor set
 * negative → RangeError; coneOuterGain set outside [0, 1] →
 * InvalidStateError DOMException; coneInnerAngle/coneOuterAngle accept any
 * finite double (behavior outside [0, 360] is spec-undefined; pleco follows
 * the spec cone algorithm's |angle|/2 handling verbatim). All six are IDL
 * doubles: non-finite → TypeError (WebIDL binding; rejecting non-numbers is
 * pleco strictness). panningModel/distanceModel are WebIDL enum attributes —
 * invalid ASSIGNMENT is silently ignored; an invalid enum string in the
 * constructor dictionary is a binding TypeError (house rules). Channel
 * constraints (§ Channel Limitations, shared with StereoPannerNode):
 * channelCount > 2 → NotSupportedError; channelCountMode 'max' →
 * NotSupportedError — on attribute assignment AND through the constructor
 * dictionary.
 *
 * HRTF — EXPLICIT OPEN PARITY GAP: 'HRTF' is a valid PanningModelType value
 * and is accepted by the attribute and the dictionary (spec § PanningModelType).
 * Spec HRTF rendering requires convolution with a measured head-related
 * impulse-response dataset; pleco (like the audiojs reference) ships no such
 * dataset, and substituting equalpower silently would fabricate a result the
 * caller didn't ask for. HONEST BEHAVIOR: with panningModel 'HRTF' the node
 * outputs STEREO SILENCE — never an equalpower substitution. (The spec's
 * HRTF-mode side effects — params behaving k-rate, non-zero tail-time — are
 * moot while the output is silence and are part of the same gap.) Also
 * deliberately deferred with it: the spec's "not actively processing →
 * single channel of silence" output-channel rule; pleco's output is always
 * stereo.
 *
 * DEPRECATED CONVENIENCES (spec § PannerNode Methods, both marked DEPRECATED):
 * setPosition(x, y, z) / setOrientation(x, y, z) are equivalent to setting
 * the corresponding AudioParams' .value; NotSupportedError if any touched
 * param has an active setValueCurveAtTime automation at call time (checked
 * atomically across all three before any write — same policy as
 * PlecoAudioListener).
 */
import { PlecoNode, CHANNEL_COUNT_MODES, coerceNodeOptions} from '../xa-node.js'
import { PlecoAudioParam } from '../xa-param.js'
import { RENDER_QUANTUM } from '../xa-constants.js'
import { createPlecoAudioBuffer } from '../xa-buffer.js'
import { notSupportedError, invalidStateError } from '../xa-errors.js'
import { getContextListener, webidlFloat, assertNoActiveSetValueCurve } from '../xa-listener.js'

const HALF_PI = Math.PI / 2
const RAD_TO_DEG = 180 / Math.PI

/** Spec enums (§ PanningModelType / § DistanceModelType). */
const PANNING_MODELS = ['equalpower', 'HRTF']
const DISTANCE_MODELS = ['linear', 'inverse', 'exponential']

/** WebIDL `double` conversion for the distance/cone attributes: non-finite → TypeError. */
function webidlDouble(method, name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`${method}: ${name} must be a finite number, got ${v}`)
  }
  return v
}

export class PlecoPannerNode extends PlecoNode {
  #positionX
  #positionY
  #positionZ
  #orientationX
  #orientationY
  #orientationZ
  #panningModel = 'equalpower'
  #distanceModel = 'inverse'
  #refDistance = 1
  #maxDistance = 10000
  #rolloffFactor = 1
  #coneInnerAngle = 360
  #coneOuterAngle = 360
  #coneOuterGain = 0

  /**
   * @param {object} context — the owning PlecoBaseContext.
   * @param {object} [options] — PannerOptions (§ PannerOptions): panningModel,
   *   distanceModel, positionX/Y/Z, orientationX/Y/Z, refDistance,
   *   maxDistance, rolloffFactor, coneInnerAngle, coneOuterAngle,
   *   coneOuterGain, merged with AudioNodeOptions. Node table defaults:
   *   channelCount 2, channelCountMode 'clamped-max', channelInterpretation
   *   'speakers'.
   */
  constructor(context, options = {}) {
    // WebIDL: a non-object 2nd argument (e.g. new XNode(ctx, 42)) is a TypeError.
    options = coerceNodeOptions(options)
    options = options ?? {} // WebIDL dictionary conversion: null is the empty dictionary
    const {
      panningModel,
      distanceModel,
      positionX,
      positionY,
      positionZ,
      orientationX,
      orientationY,
      orientationZ,
      refDistance,
      maxDistance,
      rolloffFactor,
      coneInnerAngle,
      coneOuterAngle,
      coneOuterGain,
      ...nodeOptions
    } = options
    // Dictionary-path channelCountMode pre-validation (house pattern — the
    // base constructor stores the mode without running the per-node hook):
    // WebIDL enum conversion FIRST (invalid string → TypeError), then the
    // spec constraint (valid-but-forbidden 'max' → NotSupportedError).
    const channelCountMode = nodeOptions.channelCountMode ?? 'clamped-max'
    if (!CHANNEL_COUNT_MODES.includes(channelCountMode)) {
      throw new TypeError(
        `PlecoPannerNode: channelCountMode must be 'max' | 'clamped-max' | 'explicit', got ${channelCountMode}`,
      )
    }
    if (channelCountMode === 'max') {
      throw notSupportedError("PlecoPannerNode: channelCountMode cannot be set to 'max'")
    }
    // Constructor-dictionary enum members: an invalid PanningModelType /
    // DistanceModelType string is a WebIDL binding TypeError (house rule —
    // unlike attribute assignment, which silently ignores it below).
    if (panningModel !== undefined && !PANNING_MODELS.includes(panningModel)) {
      throw new TypeError(`PlecoPannerNode: panningModel must be 'equalpower' | 'HRTF', got ${panningModel}`)
    }
    if (distanceModel !== undefined && !DISTANCE_MODELS.includes(distanceModel)) {
      throw new TypeError(
        `PlecoPannerNode: distanceModel must be 'linear' | 'inverse' | 'exponential', got ${distanceModel}`,
      )
    }
    // WebIDL float dictionary members — non-finite → binding TypeError before
    // the node is constructed.
    for (const [name, v] of [
      ['positionX', positionX],
      ['positionY', positionY],
      ['positionZ', positionZ],
      ['orientationX', orientationX],
      ['orientationY', orientationY],
      ['orientationZ', orientationZ],
    ]) {
      if (v !== undefined) webidlFloat('PlecoPannerNode', `options.${name}`, v)
    }
    // channelCount ≤ 2 is enforced by the _validateChannelCount hook, which
    // the base constructor's validated channelCount setter runs during super().
    super(context, { ...nodeOptions, numberOfInputs: 1, numberOfOutputs: 1, channelCountMode })

    // The context's ONE listener — same instance BaseAudioContext.listener
    // vends (spec: all PannerNodes spatialize relative to it).
    this._listener = getContextListener(context)

    this.#positionX = new PlecoAudioParam({ defaultValue: 0, context })
    this.#positionY = new PlecoAudioParam({ defaultValue: 0, context })
    this.#positionZ = new PlecoAudioParam({ defaultValue: 0, context })
    this.#orientationX = new PlecoAudioParam({ defaultValue: 1, context })
    this.#orientationY = new PlecoAudioParam({ defaultValue: 0, context })
    this.#orientationZ = new PlecoAudioParam({ defaultValue: 0, context })
    // Factory/constructor algorithm sets only PASSED parameters (house
    // pattern): an explicit member initializes the param's value or the
    // attribute; an omitted one keeps the spec default.
    if (positionX !== undefined) this.#positionX.value = positionX
    if (positionY !== undefined) this.#positionY.value = positionY
    if (positionZ !== undefined) this.#positionZ.value = positionZ
    if (orientationX !== undefined) this.#orientationX.value = orientationX
    if (orientationY !== undefined) this.#orientationY.value = orientationY
    if (orientationZ !== undefined) this.#orientationZ.value = orientationZ
    if (panningModel !== undefined) this.#panningModel = panningModel
    if (distanceModel !== undefined) this.#distanceModel = distanceModel
    // Double members route through the attribute setters so the dictionary
    // path enforces the same RangeError / InvalidStateError constraints.
    if (refDistance !== undefined) this.refDistance = refDistance
    if (maxDistance !== undefined) this.maxDistance = maxDistance
    if (rolloffFactor !== undefined) this.rolloffFactor = rolloffFactor
    if (coneInnerAngle !== undefined) this.coneInnerAngle = coneInnerAngle
    if (coneOuterAngle !== undefined) this.coneOuterAngle = coneOuterAngle
    if (coneOuterGain !== undefined) this.coneOuterGain = coneOuterGain

    // Preallocated a-rate param blocks — _process never allocates these.
    this._posXBlock = new Float32Array(RENDER_QUANTUM)
    this._posYBlock = new Float32Array(RENDER_QUANTUM)
    this._posZBlock = new Float32Array(RENDER_QUANTUM)
    this._oriXBlock = new Float32Array(RENDER_QUANTUM)
    this._oriYBlock = new Float32Array(RENDER_QUANTUM)
    this._oriZBlock = new Float32Array(RENDER_QUANTUM)
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

  get orientationX() {
    return this.#orientationX
  }

  get orientationY() {
    return this.#orientationY
  }

  get orientationZ() {
    return this.#orientationZ
  }

  get panningModel() {
    return this.#panningModel
  }

  set panningModel(v) {
    if (!PANNING_MODELS.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    this.#panningModel = v
  }

  get distanceModel() {
    return this.#distanceModel
  }

  set distanceModel(v) {
    if (!DISTANCE_MODELS.includes(v)) return // WebIDL enum attribute: invalid assignment is silently ignored
    this.#distanceModel = v
  }

  get refDistance() {
    return this.#refDistance
  }

  set refDistance(v) {
    const d = webidlDouble('PlecoPannerNode', 'refDistance', v)
    if (d < 0) {
      throw new RangeError(`PlecoPannerNode: refDistance must be non-negative, got ${v}`)
    }
    this.#refDistance = d
  }

  get maxDistance() {
    return this.#maxDistance
  }

  set maxDistance(v) {
    const d = webidlDouble('PlecoPannerNode', 'maxDistance', v)
    if (d <= 0) {
      throw new RangeError(`PlecoPannerNode: maxDistance must be positive, got ${v}`)
    }
    this.#maxDistance = d
  }

  get rolloffFactor() {
    return this.#rolloffFactor
  }

  set rolloffFactor(v) {
    const d = webidlDouble('PlecoPannerNode', 'rolloffFactor', v)
    if (d < 0) {
      throw new RangeError(`PlecoPannerNode: rolloffFactor must be non-negative, got ${v}`)
    }
    // Spec: the linear model's [0, 1] nominal-range clamp happens during
    // processing; the attribute reflects the value that was set.
    this.#rolloffFactor = d
  }

  get coneInnerAngle() {
    return this.#coneInnerAngle
  }

  set coneInnerAngle(v) {
    this.#coneInnerAngle = webidlDouble('PlecoPannerNode', 'coneInnerAngle', v)
  }

  get coneOuterAngle() {
    return this.#coneOuterAngle
  }

  set coneOuterAngle(v) {
    this.#coneOuterAngle = webidlDouble('PlecoPannerNode', 'coneOuterAngle', v)
  }

  get coneOuterGain() {
    return this.#coneOuterGain
  }

  set coneOuterGain(v) {
    const d = webidlDouble('PlecoPannerNode', 'coneOuterGain', v)
    if (d < 0 || d > 1) {
      throw invalidStateError(`PlecoPannerNode: coneOuterGain must be in [0, 1], got ${v}`)
    }
    this.#coneOuterGain = d
  }

  // Spec constraint hooks (§ Channel Limitations — shared with
  // StereoPannerNode; both NotSupportedError).
  _validateChannelCount(v) {
    if (v > 2) {
      throw notSupportedError(`PlecoPannerNode: channelCount cannot be greater than 2, got ${v}`)
    }
  }

  _validateChannelCountMode(v) {
    if (v === 'max') {
      throw notSupportedError("PlecoPannerNode: channelCountMode cannot be set to 'max'")
    }
  }

  /**
   * DEPRECATED (spec § PannerNode setPosition()) — flagged convenience,
   * equivalent to setting positionX/positionY/positionZ .value with x/y/z.
   * NotSupportedError if any of the three has an active setValueCurveAtTime
   * automation at the current time (checked atomically — see file header).
   */
  setPosition(x, y, z) {
    const fx = webidlFloat('PlecoPannerNode.setPosition', 'x', x)
    const fy = webidlFloat('PlecoPannerNode.setPosition', 'y', y)
    const fz = webidlFloat('PlecoPannerNode.setPosition', 'z', z)
    assertNoActiveSetValueCurve(
      'PlecoPannerNode.setPosition',
      [this.#positionX, this.#positionY, this.#positionZ],
      this.context.currentTime,
    )
    this.#positionX.value = fx
    this.#positionY.value = fy
    this.#positionZ.value = fz
  }

  /**
   * DEPRECATED (spec § PannerNode setOrientation()) — flagged convenience,
   * equivalent to setting orientationX/orientationY/orientationZ .value with
   * x/y/z. NotSupportedError if any of the three has an active
   * setValueCurveAtTime automation at the current time (atomic).
   */
  setOrientation(x, y, z) {
    const fx = webidlFloat('PlecoPannerNode.setOrientation', 'x', x)
    const fy = webidlFloat('PlecoPannerNode.setOrientation', 'y', y)
    const fz = webidlFloat('PlecoPannerNode.setOrientation', 'z', z)
    assertNoActiveSetValueCurve(
      'PlecoPannerNode.setOrientation',
      [this.#orientationX, this.#orientationY, this.#orientationZ],
      this.context.currentTime,
    )
    this.#orientationX.value = fx
    this.#orientationY.value = fy
    this.#orientationZ.value = fz
  }

  _process(input) {
    const now = this.context.currentTime
    const out = createPlecoAudioBuffer(2, RENDER_QUANTUM, this.context.sampleRate)
    if (this.#panningModel !== 'equalpower') {
      // 'HRTF': explicit open parity gap — stereo silence, NEVER an
      // equalpower substitution (see file header).
      return out
    }
    const outL = out.getChannelData(0)
    const outR = out.getChannelData(1)

    // a-rate computedValue blocks: the panner's six params...
    const px = this.#positionX.fillBlock(this._posXBlock, now)
    const py = this.#positionY.fillBlock(this._posYBlock, now)
    const pz = this.#positionZ.fillBlock(this._posZBlock, now)
    const ox = this.#orientationX.fillBlock(this._oriXBlock, now)
    const oy = this.#orientationY.fillBlock(this._oriYBlock, now)
    const oz = this.#orientationZ.fillBlock(this._oriZBlock, now)
    // ...and the listener's nine, computed once per quantum and shared
    // across every panner in the graph (xa-listener.js).
    const lb = this._listener._quantum(now)
    const lpx = lb.px
    const lpy = lb.py
    const lpz = lb.pz
    const lfx = lb.fx
    const lfy = lb.fy
    const lfz = lb.fz
    const lux = lb.ux
    const luy = lb.uy
    const luz = lb.uz

    // Mono-to-stereo when every connection is mono, else stereo-to-stereo
    // (§ Panning Algorithm). The input port delivers at most 2 channels
    // under the node's channelCount ≤ 2 + non-'max' mode constraints.
    const stereo = input.numberOfChannels > 1
    const srcL = input.getChannelData(0)
    const srcR = stereo ? input.getChannelData(1) : srcL

    for (let i = 0; i < RENDER_QUANTUM; i++) {
      // Source − listener vector (reused for azimuth AND distance).
      const dx = px[i] - lpx[i]
      const dy = py[i] - lpy[i]
      const dz = pz[i] - lpz[i]

      // § equalpower steps 1-2: azimuth, clamped to [-180, 180] then wrapped
      // to [-90, 90].
      let azimuth = this._azimuth(dx, dy, dz, lfx[i], lfy[i], lfz[i], lux[i], luy[i], luz[i])
      if (azimuth < -180) azimuth = -180
      else if (azimuth > 180) azimuth = 180
      if (azimuth < -90) azimuth = -180 - azimuth
      else if (azimuth > 90) azimuth = 180 - azimuth

      // § steps 3-5: normalized x, equal-power gains, mono/stereo branches.
      if (stereo) {
        const x = azimuth <= 0 ? (azimuth + 90) / 90 : azimuth / 90
        const gainL = Math.cos(x * HALF_PI)
        const gainR = Math.sin(x * HALF_PI)
        if (azimuth <= 0) {
          outL[i] = srcL[i] + srcR[i] * gainL
          outR[i] = srcR[i] * gainR
        } else {
          outL[i] = srcL[i] * gainL
          outR[i] = srcR[i] + srcL[i] * gainR
        }
      } else {
        const x = (azimuth + 90) / 180
        outL[i] = srcL[i] * Math.cos(x * HALF_PI)
        outR[i] = srcL[i] * Math.sin(x * HALF_PI)
      }

      // § step 6: distance gain and cone gain, applied AFTER panning (the
      // float32 store above is the spec's precision boundary).
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const totalGain =
        this._coneGain(-dx, -dy, -dz, ox[i], oy[i], oz[i]) * this._distanceGain(distance)
      outL[i] *= totalGain
      outR[i] *= totalGain
    }
    return out
  }

  /**
   * § Azimuth and Elevation, azimuth only (equalpower ignores elevation —
   * see file header). (sx, sy, sz) is the UNNORMALIZED source − listener
   * vector; (fx, fy, fz)/(ux, uy, uz) are the listener forward/up vectors.
   * Scalar locals only — allocation-free.
   */
  _azimuth(sx, sy, sz, fx, fy, fz, ux, uy, uz) {
    // Degenerate: source and listener at the same point.
    const sMag = Math.sqrt(sx * sx + sy * sy + sz * sz)
    if (sMag === 0) return 0
    sx /= sMag
    sy /= sMag
    sz /= sMag
    // listenerRight = forward × up. Degenerate: linearly dependent forward/up
    // (including either being zero) — 'right' cannot be determined.
    let rx = fy * uz - fz * uy
    let ry = fz * ux - fx * uz
    let rz = fx * uy - fy * ux
    const rMag = Math.sqrt(rx * rx + ry * ry + rz * rz)
    if (rMag === 0) return 0
    rx /= rMag
    ry /= rMag
    rz /= rMag
    // forward is nonzero here (a zero forward would have zeroed 'right').
    const fMag = Math.sqrt(fx * fx + fy * fy + fz * fz)
    const fnx = fx / fMag
    const fny = fy / fMag
    const fnz = fz / fMag
    // up' = rightNorm × forwardNorm; project the source vector onto the
    // horizontal plane.
    const upx = ry * fnz - rz * fny
    const upy = rz * fnx - rx * fnz
    const upz = rx * fny - ry * fnx
    const upProjection = sx * upx + sy * upy + sz * upz
    let qx = sx - upx * upProjection
    let qy = sy - upy * upProjection
    let qz = sz - upz * upProjection
    // Degenerate: source on the up axis — the spec pseudocode normalizes a
    // zero vector here; pleco takes azimuth 0 (the reference's behavior).
    const qMag = Math.sqrt(qx * qx + qy * qy + qz * qz)
    if (qMag === 0) return 0
    qx /= qMag
    qy /= qMag
    qz /= qMag
    // acos of the (float-safety clamped) dot with 'right', in degrees.
    let dotR = qx * rx + qy * ry + qz * rz
    if (dotR < -1) dotR = -1
    else if (dotR > 1) dotR = 1
    let azimuth = RAD_TO_DEG * Math.acos(dotR)
    // Source in front or behind the listener.
    if (qx * fnx + qy * fny + qz * fnz < 0) azimuth = 360 - azimuth
    // Make azimuth relative to 'forward' instead of 'right'.
    return azimuth >= 0 && azimuth <= 270 ? 90 - azimuth : 450 - azimuth
  }

  /**
   * § Sound Cones coneGain(), verbatim except the documented
   * listener − source direction fix (see file header). (tx, ty, tz) is the
   * UNNORMALIZED listener − source vector; (ox, oy, oz) is the source
   * orientation at this sample-frame.
   */
  _coneGain(tx, ty, tz, ox, oy, oz) {
    if (
      (ox === 0 && oy === 0 && oz === 0) ||
      (this.#coneInnerAngle === 360 && this.#coneOuterAngle === 360)
    ) {
      return 1 // no cone specified — unity gain
    }
    const tMag = Math.sqrt(tx * tx + ty * ty + tz * tz)
    if (tMag === 0) return 1 // source at the listener: no direction — inside every cone
    const oMag = Math.sqrt(ox * ox + oy * oy + oz * oz)
    let dot = (tx * ox + ty * oy + tz * oz) / (tMag * oMag)
    if (dot < -1) dot = -1
    else if (dot > 1) dot = 1
    const absAngle = Math.abs(RAD_TO_DEG * Math.acos(dot))
    const absInnerAngle = Math.abs(this.#coneInnerAngle) / 2
    const absOuterAngle = Math.abs(this.#coneOuterAngle) / 2
    if (absAngle <= absInnerAngle) return 1
    if (absAngle >= absOuterAngle) return this.#coneOuterGain
    const x = (absAngle - absInnerAngle) / (absOuterAngle - absInnerAngle)
    return 1 - x + this.#coneOuterGain * x
  }

  /** § DistanceModelType distanceGain formulas, verbatim (see file header). */
  _distanceGain(d) {
    const ref = this.#refDistance
    const max = this.#maxDistance
    const f = this.#rolloffFactor
    switch (this.#distanceModel) {
      case 'linear': {
        const dRef = Math.min(ref, max)
        const dMax = Math.max(ref, max)
        // rolloffFactor's linear-model nominal range is [0, 1], clamped as
        // part of processing (the attribute keeps the set value).
        const fc = f > 1 ? 1 : f
        if (dRef === dMax) return 1 - fc
        const dc = d < dRef ? dRef : d > dMax ? dMax : d
        return 1 - (fc * (dc - dRef)) / (dMax - dRef)
      }
      case 'inverse': {
        if (ref === 0) return 0
        return ref / (ref + f * (Math.max(d, ref) - ref))
      }
      case 'exponential': {
        if (ref === 0) return 0
        return Math.pow(Math.max(d, ref) / ref, -f)
      }
      default:
        // Unreachable: #distanceModel only ever holds a valid enum value.
        throw invalidStateError(`PlecoPannerNode: unknown distanceModel '${this.#distanceModel}'`)
    }
  }
}
