/**
 * engine/xa-audio-worklet.js — PlecoAudioWorklet (AudioWorklet) +
 * PlecoAudioWorkletGlobalScope (AudioWorkletGlobalScope) +
 * PlecoAudioWorkletProcessor (AudioWorkletProcessor) + the context vend (P20).
 *
 * THE SINGLE-THREAD ANALOGUE. The spec's AudioWorklet machinery is a
 * two-thread protocol: addModule() evaluates a module script inside an
 * AudioWorkletGlobalScope on the rendering thread, registerProcessor()
 * populates the scope's "node name to processor constructor map" (and, via a
 * queued task, the AudioWorklet's "node name to parameter descriptor map"),
 * and each AudioWorkletNode construction queues a control message that
 * constructs the paired AudioWorkletProcessor in that scope. Pleco's engine
 * is single-threaded, so the 'worklet global scope' is an ENGINE-INTERNAL
 * EVALUATION SCOPE — a dedicated `node:vm` context (one per BaseAudioContext,
 * exactly as the spec mandates one AudioWorkletGlobalScope per context) with
 * the scope's spec globals injected as bare identifiers — and every "queue a
 * control message" hop collapses to a synchronous call. The observable
 * ordering guarantees survive: registration completes before the addModule()
 * promise resolves, and processor construction happens during (never after)
 * AudioWorkletNode construction.
 *
 * addModule(moduleURL) — WHAT IS ACCEPTED, exactly (documented pleco
 * strictness, no silent fallbacks):
 * - `data:` URLs — the body (percent-encoded, or base64 with a `;base64`
 *   parameter) is the module source. A data: URL with no comma is malformed →
 *   TypeError.
 * - absolute `file://` URLs — the file's UTF-8 contents are the module
 *   source. An unreadable/missing file rejects with the HTML worklet spec's
 *   AbortError DOMException.
 * - EVERYTHING ELSE REJECTS with TypeError: non-strings, relative URLs
 *   (headless Node has no document base URL to resolve against), and any
 *   other scheme (http:, blob:, …). The HTML spec would resolve relative
 *   URLs and fetch over the network; pleco's headless engine deliberately
 *   does neither.
 * - Module source is evaluated as a CLASSIC SCRIPT inside the scope's vm
 *   context (static `import`/`export` are unsupported — a documented parity
 *   gap; real worklet scripts are module scripts). The evaluation scope
 *   exposes the AudioWorkletGlobalScope surface as bare identifiers:
 *   `registerProcessor`, `AudioWorkletProcessor`, `sampleRate`,
 *   `renderQuantumSize`, and LIVE `currentTime` / `currentFrame` (accessor-
 *   backed, so code inside process() reads the advancing clock).
 * - Per the HTML module map, the same URL is evaluated at most once: a
 *   repeated addModule(sameURL) resolves without re-running the script. A
 *   FAILED evaluation is not cached (the module may be retried) — documented
 *   choice.
 * - Errors thrown BY the module (including registerProcessor's validation
 *   ladder) propagate as the addModule() rejection AS THROWN. The HTML spec
 *   blankets every fetch-and-evaluate failure as AbortError; surfacing the
 *   real error is deliberate pleco strictness (never swallow a diagnosis).
 *
 * registerProcessor(name, processorCtor) implements the spec's full
 * validation ladder (spec § AudioWorkletGlobalScope, registerProcessor) in
 * spec order: empty name → NotSupportedError; duplicate name →
 * NotSupportedError; IsConstructor false → TypeError; prototype not an
 * Object → TypeError; then, when `parameterDescriptors` is not undefined,
 * the WebIDL sequence<AudioParamDescriptor> conversion (non-iterable →
 * TypeError; each descriptor converted with the house constructor-dictionary
 * rules — required `name`, float members, invalid AutomationRate enum →
 * TypeError) followed by the per-descriptor loop (duplicate parameter name →
 * NotSupportedError; NOT minValue ≤ defaultValue ≤ maxValue →
 * InvalidStateError). Note the spec does NOT require the class to extend
 * AudioWorkletProcessor — any constructor with an object prototype
 * registers (the audiojs reference is stricter here; pleco follows the
 * spec).
 *
 * DISPOSITIONED OUT (checklist § 20): the AudioWorklet.port /
 * AudioWorkletGlobalScope.port MessagePort pair (present in the current
 * spec draft as a main-scope ↔ global-scope messaging channel) and the
 * reference's non-spec addModule(function) overload. In pleco's
 * single-realm engine the scope-level channel would connect a realm to
 * itself; per-NODE ports (AudioWorkletNode.port ↔ AudioWorkletProcessor.port)
 * ARE fully implemented in nodes/xa-audio-worklet-node.js. Recorded as a
 * documented parity gap, not a silent omission.
 *
 * THE VEND: like the AudioListener (xa-listener.js), the spec's AudioWorklet
 * has no constructor — it exists only as BaseAudioContext.audioWorklet.
 * getContextAudioWorklet(context) is the engine's single vending path (lazy,
 * one worklet + one global scope per context, memoized on
 * context._audioWorklet), designed so the BaseAudioContext getter is
 * trivial:
 *
 *     get audioWorklet() { return getContextAudioWorklet(this) }
 *
 * (That one-line getter + this file's import are the ONLY xa-base-context.js
 * additions this slice needs; they are reported, not applied, because the
 * file is owned by a concurrent slice.)
 */

import { invalidStateError, notSupportedError } from './xa-errors.js'

/**
 * DOMException named AbortError — the HTML worklet spec's rejection for a
 * module fetch that fails. Local to this file only because xa-errors.js is
 * owned by a concurrent slice; promotion of this factory into xa-errors.js
 * is reported through the slice's integration notes.
 */
function abortError(message) {
  return new DOMException(message, 'AbortError')
}

/** The AudioParamDescriptor float-member defaults (spec IDL: ±3.4028235e38). */
const DESCRIPTOR_MIN_DEFAULT = -3.4028235e38
const DESCRIPTOR_MAX_DEFAULT = 3.4028235e38
/** The AutomationRate enum (spec § AudioParam) — constructor-dictionary tier here, so invalid → TypeError. */
const AUTOMATION_RATES = ['a-rate', 'k-rate']

/** ECMAScript IsConstructor probe: only a function with [[Construct]] survives Reflect.construct as newTarget. */
function isConstructor(fn) {
  if (typeof fn !== 'function') return false
  try {
    Reflect.construct(function probe() {}, [], fn)
    return true
  } catch {
    return false
  }
}

/** WebIDL float conversion for AudioParamDescriptor members: non-finite → TypeError, then float32 rounding. */
function descriptorFloat(member, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(
      `PlecoAudioWorkletGlobalScope.registerProcessor: AudioParamDescriptor.${member} must be a finite number, got ${v}`,
    )
  }
  return Math.fround(v)
}

/**
 * WebIDL conversion of one AudioParamDescriptor dictionary (spec
 * § AudioParamDescriptor): required DOMString `name`; float defaultValue = 0,
 * minValue = -3.4028235e38, maxValue = 3.4028235e38; AutomationRate
 * automationRate = 'a-rate'. House constructor-dictionary rules apply: an
 * invalid enum string is a TypeError, a non-object descriptor is a TypeError.
 * Returns the normalized, frozen descriptor.
 */
function convertParamDescriptor(d) {
  if (d === null || (typeof d !== 'object' && typeof d !== 'function')) {
    throw new TypeError(
      `PlecoAudioWorkletGlobalScope.registerProcessor: each parameter descriptor must be a dictionary object, got ${d}`,
    )
  }
  if (typeof d.name !== 'string') {
    throw new TypeError(
      'PlecoAudioWorkletGlobalScope.registerProcessor: AudioParamDescriptor.name is a required string member',
    )
  }
  const automationRate = d.automationRate === undefined ? 'a-rate' : d.automationRate
  if (!AUTOMATION_RATES.includes(automationRate)) {
    throw new TypeError(
      `PlecoAudioWorkletGlobalScope.registerProcessor: AudioParamDescriptor.automationRate must be 'a-rate' | 'k-rate', got ${automationRate}`,
    )
  }
  return Object.freeze({
    name: d.name,
    defaultValue: d.defaultValue === undefined ? 0 : descriptorFloat('defaultValue', d.defaultValue),
    minValue: d.minValue === undefined ? DESCRIPTOR_MIN_DEFAULT : descriptorFloat('minValue', d.minValue),
    maxValue: d.maxValue === undefined ? DESCRIPTOR_MAX_DEFAULT : descriptorFloat('maxValue', d.maxValue),
    automationRate,
  })
}

/**
 * The spec's [=pending processor construction data=] slot — written by the
 * PlecoAudioWorkletNode constructor immediately before it constructs the
 * registered processor class, consumed exactly once by the
 * PlecoAudioWorkletProcessor constructor (its super() call), and emptied by
 * the node constructor afterwards regardless (the registered class is not
 * required to extend PlecoAudioWorkletProcessor, so the slot may go
 * unclaimed). A `new PlecoAudioWorkletProcessor()` outside a node
 * construction finds the slot empty → TypeError, per the spec's
 * AudioWorkletProcessor() constructor step 1.
 */
let pendingProcessorConstructionData = null

/** ENGINE-INTERNAL: arm the pending-construction slot (called by the node constructor). */
export function _setPendingProcessorConstructionData(data) {
  pendingProcessorConstructionData = data
}

/** ENGINE-INTERNAL: empty the pending-construction slot (the invoking algorithm's final step). */
export function _clearPendingProcessorConstructionData() {
  pendingProcessorConstructionData = null
}

/**
 * PlecoErrorEvent — FLAGGED INTERNAL SHIM of the HTML spec's ErrorEvent
 * (Node has no ErrorEvent global), carrying the spec-mandated message /
 * filename / lineno / colno / error members for the `processorerror` event.
 * Same tier as the other HTML-spec host types this cluster satisfies
 * internally (Worklet, WorkletGlobalScope; MessagePort comes from the host's
 * MessageChannel).
 */
export class PlecoErrorEvent extends Event {
  #message
  #filename
  #lineno
  #colno
  #error

  constructor(type, eventInitDict = {}) {
    const init = eventInitDict ?? {}
    super(type, init)
    this.#message = typeof init.message === 'string' ? init.message : ''
    this.#filename = typeof init.filename === 'string' ? init.filename : ''
    this.#lineno = typeof init.lineno === 'number' ? init.lineno : 0
    this.#colno = typeof init.colno === 'number' ? init.colno : 0
    this.#error = init.error
  }

  get message() {
    return this.#message
  }

  get filename() {
    return this.#filename
  }

  get lineno() {
    return this.#lineno
  }

  get colno() {
    return this.#colno
  }

  get error() {
    return this.#error
  }
}

/**
 * PlecoAudioWorkletProcessor — the base class authors extend (spec
 * § The AudioWorkletProcessor Interface). Constructible ONLY during a
 * PlecoAudioWorkletNode construction: step 1 of the spec constructor throws
 * TypeError when the [=pending processor construction data=] slot is empty,
 * which covers both direct `new` outside node construction and a second
 * construction inside the same node construction (the slot is emptied by the
 * first). `port` is the processor-side MessagePort of the node↔processor
 * MessageChannel, available from the moment super() returns.
 *
 * Per the spec IDL the base class carries NO default process() and NO
 * default static parameterDescriptors — an author class without a callable
 * `process` fails at render time with the processorerror-then-silence path,
 * and a missing `parameterDescriptors` simply registers zero parameters.
 */
export class PlecoAudioWorkletProcessor {
  #port

  constructor() {
    if (pendingProcessorConstructionData === null) {
      throw new TypeError(
        'PlecoAudioWorkletProcessor: an AudioWorkletProcessor can only be constructed during PlecoAudioWorkletNode construction',
      )
    }
    this.#port = pendingProcessorConstructionData.port
    // Spec AudioWorkletProcessor() step 7: empty the slot — a second
    // construction inside the same node construction now throws above.
    pendingProcessorConstructionData = null
  }

  /** Readonly. The processor-side MessagePort paired with AudioWorkletNode.port. */
  get port() {
    return this.#port
  }
}

/**
 * PlecoAudioWorkletGlobalScope — the engine-internal analogue of the spec's
 * AudioWorkletGlobalScope (spec § The AudioWorkletGlobalScope Interface):
 * the readonly clock/config attributes (currentFrame, currentTime,
 * sampleRate, renderQuantumSize — all LIVE reads of the owning context) and
 * registerProcessor() with the full spec validation ladder. Holds BOTH spec
 * maps: the scope's "node name to processor constructor map"
 * (_processorCtorMap) and — because pleco is single-threaded, populated in
 * the same synchronous step instead of via the spec's queued task — the
 * AudioWorklet's "node name to parameter descriptor map"
 * (_parameterDescriptorMap). The two always carry an identical key set, as
 * the spec requires.
 */
export class PlecoAudioWorkletGlobalScope {
  #context

  constructor(context) {
    if (context == null || typeof context.sampleRate !== 'number') {
      throw new TypeError('PlecoAudioWorkletGlobalScope: a context is required')
    }
    this.#context = context
    /** ENGINE-INTERNAL: the spec's "node name to processor constructor map". */
    this._processorCtorMap = new Map()
    /** ENGINE-INTERNAL: the spec's "node name to parameter descriptor map" (normalized, frozen descriptors). */
    this._parameterDescriptorMap = new Map()
  }

  /** Spec: equal to the context's [[current frame]] slot — live. */
  get currentFrame() {
    return this.#context._frame
  }

  /** Spec: equal to the context's currentTime attribute — live. */
  get currentTime() {
    return this.#context.currentTime
  }

  /** Spec: the sample rate of the associated BaseAudioContext. */
  get sampleRate() {
    return this.#context.sampleRate
  }

  /** Spec: the value of the context's [[render quantum size]] slot. */
  get renderQuantumSize() {
    return this.#context.renderQuantumSize
  }

  /**
   * Spec registerProcessor(name, processorCtor) — the full validation ladder
   * in spec step order (see the file header). Rejecting a non-string `name`
   * outright (instead of WebIDL DOMString coercion) is documented pleco
   * strictness.
   */
  registerProcessor(name, processorCtor) {
    if (typeof name !== 'string') {
      throw new TypeError(`PlecoAudioWorkletGlobalScope.registerProcessor: name must be a string, got ${name}`)
    }
    // Step 1: empty name → NotSupportedError.
    if (name === '') {
      throw notSupportedError('PlecoAudioWorkletGlobalScope.registerProcessor: name must not be an empty string')
    }
    // Step 2: duplicate key → NotSupportedError.
    if (this._processorCtorMap.has(name)) {
      throw notSupportedError(
        `PlecoAudioWorkletGlobalScope.registerProcessor: a processor named '${name}' is already registered`,
      )
    }
    // Step 3: IsConstructor(processorCtor) false → TypeError.
    if (!isConstructor(processorCtor)) {
      throw new TypeError(
        'PlecoAudioWorkletGlobalScope.registerProcessor: processorCtor must be a class constructor',
      )
    }
    // Steps 4–5: Get(processorCtor, "prototype") must be of Type Object.
    const prototype = processorCtor.prototype
    if (prototype === null || (typeof prototype !== 'object' && typeof prototype !== 'function')) {
      throw new TypeError(
        'PlecoAudioWorkletGlobalScope.registerProcessor: processorCtor.prototype must be an object',
      )
    }
    // Steps 6–7: parameterDescriptors — only validated when not undefined.
    const descriptorsValue = processorCtor.parameterDescriptors
    let descriptors = []
    if (descriptorsValue !== undefined) {
      // WebIDL sequence conversion: a non-iterable is a TypeError.
      if (descriptorsValue === null || typeof descriptorsValue[Symbol.iterator] !== 'function') {
        throw new TypeError(
          'PlecoAudioWorkletGlobalScope.registerProcessor: parameterDescriptors must be iterable',
        )
      }
      for (const d of descriptorsValue) descriptors.push(convertParamDescriptor(d))
      // Step 7.3: per-descriptor constraints, in order.
      const paramNames = new Set()
      for (const d of descriptors) {
        if (paramNames.has(d.name)) {
          throw notSupportedError(
            `PlecoAudioWorkletGlobalScope.registerProcessor: duplicate parameter name '${d.name}'`,
          )
        }
        paramNames.add(d.name)
        if (!(d.minValue <= d.defaultValue && d.defaultValue <= d.maxValue)) {
          throw invalidStateError(
            `PlecoAudioWorkletGlobalScope.registerProcessor: parameter '${d.name}' defaultValue ${d.defaultValue} is outside [${d.minValue}, ${d.maxValue}]`,
          )
        }
      }
    }
    // Steps 8–9: populate both maps. The spec queues a media element task for
    // the descriptor map; single-threaded pleco appends synchronously — the
    // guarantee that matters (populated before addModule() resolves) holds.
    this._processorCtorMap.set(name, processorCtor)
    this._parameterDescriptorMap.set(name, Object.freeze(descriptors))
  }
}

/**
 * PlecoAudioWorklet — the per-context module loader (spec § The AudioWorklet
 * Interface, minus the dispositioned-out `port` attribute — see the file
 * header). Owns the context's single PlecoAudioWorkletGlobalScope and the
 * lazily-created `node:vm` evaluation context whose global object exposes
 * the scope surface as bare identifiers. The vm import is dynamic (inside
 * addModule) so merely importing the engine never touches Node-only builtins.
 */
export class PlecoAudioWorklet {
  #context
  #globalScope
  /** HTML module-map analogue: URLs whose module script has been evaluated (successfully) once. */
  #evaluatedModules = new Set()
  #vmContext = null

  constructor(context) {
    if (context == null || typeof context.sampleRate !== 'number') {
      throw new TypeError('PlecoAudioWorklet: a context is required')
    }
    this.#context = context
    this.#globalScope = new PlecoAudioWorkletGlobalScope(context)
  }

  /** ENGINE-INTERNAL: the context's one AudioWorkletGlobalScope analogue. */
  get _globalScope() {
    return this.#globalScope
  }

  /** ENGINE-INTERNAL: the spec's "node name to parameter descriptor map" (lives on the scope — see its doc). */
  get _parameterDescriptorMap() {
    return this.#globalScope._parameterDescriptorMap
  }

  /**
   * Spec Worklet.addModule(moduleURL) → Promise<undefined>. See the file
   * header for the exact accepted-URL contract (file:// and data: only) and
   * error surface. Registration performed by the module is complete before
   * the returned promise resolves (the spec's population guarantee).
   */
  async addModule(moduleURL) {
    if (typeof moduleURL !== 'string') {
      throw new TypeError(`PlecoAudioWorklet.addModule: moduleURL must be a string, got ${moduleURL}`)
    }
    let url
    try {
      url = new URL(moduleURL)
    } catch {
      throw new TypeError(
        `PlecoAudioWorklet.addModule: moduleURL must be an absolute file:// or data: URL (headless pleco has no base URL to resolve '${moduleURL}' against)`,
      )
    }
    if (url.protocol !== 'file:' && url.protocol !== 'data:') {
      throw new TypeError(
        `PlecoAudioWorklet.addModule: only file:// and data: URLs are supported in the headless engine, got scheme '${url.protocol}'`,
      )
    }
    if (this.#evaluatedModules.has(url.href)) return // module map: evaluated at most once
    const code = url.protocol === 'data:' ? decodeDataUrl(url.href) : await readFileUrl(url)
    const vmContext = await this.#ensureVmContext()
    const vm = await import('node:vm')
    // Evaluation errors (including registerProcessor's ladder) propagate as
    // the rejection AS THROWN — deliberate pleco strictness (file header).
    vm.runInContext(code, vmContext, { filename: url.href })
    this.#evaluatedModules.add(url.href)
  }

  /**
   * Lazily create the scope's vm evaluation context. Its global object
   * exposes the AudioWorkletGlobalScope surface as bare identifiers;
   * currentTime/currentFrame are accessor-backed so they stay LIVE inside
   * processor code. State written to the vm global by one module persists
   * for later modules on the same context (spec note: the global scope may
   * hold shared data such as wavetables).
   */
  async #ensureVmContext() {
    if (this.#vmContext !== null) return this.#vmContext
    const vm = await import('node:vm')
    const scope = this.#globalScope
    const backing = Object.create(null)
    Object.defineProperties(backing, {
      registerProcessor: {
        value: (name, ctor) => scope.registerProcessor(name, ctor),
        enumerable: true,
      },
      AudioWorkletProcessor: { value: PlecoAudioWorkletProcessor, enumerable: true },
      sampleRate: { get: () => scope.sampleRate, enumerable: true },
      renderQuantumSize: { get: () => scope.renderQuantumSize, enumerable: true },
      currentTime: { get: () => scope.currentTime, enumerable: true },
      currentFrame: { get: () => scope.currentFrame, enumerable: true },
    })
    this.#vmContext = vm.createContext(backing)
    return this.#vmContext
  }
}

/** Decode a data: URL body into module source (percent-encoded, or base64 with a `;base64` parameter). */
function decodeDataUrl(href) {
  const comma = href.indexOf(',')
  if (comma === -1) {
    throw new TypeError('PlecoAudioWorklet.addModule: malformed data: URL (no comma separating metadata and body)')
  }
  const meta = href.slice(5, comma).toLowerCase()
  const body = href.slice(comma + 1)
  return /;base64$/.test(meta) ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body)
}

/** Read a file:// URL's UTF-8 contents; failure → the HTML worklet spec's AbortError rejection. */
async function readFileUrl(url) {
  const { readFile } = await import('node:fs/promises')
  try {
    return await readFile(url, 'utf8')
  } catch (err) {
    throw abortError(`PlecoAudioWorklet.addModule: failed to read module at ${url.href}: ${err.message}`)
  }
}

/**
 * The engine's single AudioWorklet vending path: lazily construct one
 * worklet (and with it the context's one global scope) per context and
 * memoize it on context._audioWorklet. This is the exact body the
 * BaseAudioContext.audioWorklet getter delegates to (see the file header —
 * the getter itself is a reported one-liner, not applied here).
 */
export function getContextAudioWorklet(context) {
  if (context == null || typeof context.sampleRate !== 'number') {
    throw new TypeError('getContextAudioWorklet: a context is required')
  }
  if (context._audioWorklet === undefined) {
    context._audioWorklet = new PlecoAudioWorklet(context)
  }
  return context._audioWorklet
}
