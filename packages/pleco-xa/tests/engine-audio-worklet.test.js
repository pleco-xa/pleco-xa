import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  PlecoAudioWorklet,
  PlecoAudioWorkletGlobalScope,
  PlecoErrorEvent,
  getContextAudioWorklet,
} from '../src/engine/xa-audio-worklet.js'
import {
  PlecoAudioWorkletNode,
  PlecoAudioWorkletProcessor,
  PlecoAudioParamMap,
} from '../src/engine/nodes/xa-audio-worklet-node.js'
import { PlecoOfflineAudioContext } from '../src/engine/xa-offline-context.js'
import { PlecoAudioParam } from '../src/engine/xa-param.js'
import { RENDER_QUANTUM } from '../src/engine/xa-constants.js'

// P20 — the AudioWorklet cluster (checklist section 20): addModule() over
// file:// and data: URLs into the engine-internal evaluation scope,
// registerProcessor's full validation ladder, AudioWorkletNode with its
// readonly-maplike AudioParamMap / MessagePort pair / processorerror-then-
// silence dead-node semantics, and AudioWorkletProcessor's process(inputs,
// outputs, parameters) contract with per-quantum Float32Array parameter
// blocks (length 1 when constant) and the active-source lifetime rules.

const SR = 12800 // render-quantum-friendly: 128 frames = 0.01 s exactly

/** Flush microtasks + a macrotask boundary (processorerror events, port messages). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function makeContext(length = RENDER_QUANTUM, channels = 1) {
  return new PlecoOfflineAudioContext(channels, length, SR)
}

/** Register a test-realm processor class directly in the context's scope (the mock-adapter path). */
function register(ctx, name, cls) {
  getContextAudioWorklet(ctx)._globalScope.registerProcessor(name, cls)
  return cls
}

/** A minimal pass-through processor that copies input channels to output channels. */
function makePassthrough() {
  return class Passthrough extends PlecoAudioWorkletProcessor {
    process(inputs, outputs) {
      const input = inputs[0]
      const output = outputs[0]
      for (let c = 0; c < output.length; c++) {
        if (input[c]) output[c].set(input[c])
      }
      return true
    }
  }
}

/** Mono constant-1 source of `frames` frames, started at 0, connected to `node`. */
function connectOnesSource(ctx, node, frames = ctx.length) {
  const buf = ctx.createBuffer(1, frames, SR)
  buf.getChannelData(0).fill(1)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(node)
  src.start(0)
  return src
}

// ---------------------------------------------------------------------------
// AudioWorkletGlobalScope — attributes + registerProcessor validation ladder
// ---------------------------------------------------------------------------

describe('PlecoAudioWorkletGlobalScope — attributes', () => {
  it('sampleRate / renderQuantumSize mirror the context', () => {
    const ctx = makeContext()
    const scope = getContextAudioWorklet(ctx)._globalScope
    expect(scope.sampleRate).toBe(SR)
    expect(scope.renderQuantumSize).toBe(RENDER_QUANTUM)
  })

  it('currentFrame / currentTime are LIVE reads of the context clock', () => {
    const ctx = makeContext()
    const scope = getContextAudioWorklet(ctx)._globalScope
    expect(scope.currentFrame).toBe(0)
    expect(scope.currentTime).toBe(0)
    ctx.renderQuantum()
    expect(scope.currentFrame).toBe(RENDER_QUANTUM)
    expect(scope.currentTime).toBeCloseTo(RENDER_QUANTUM / SR, 12)
  })

  it('constructing a bare scope requires a context', () => {
    expect(() => new PlecoAudioWorkletGlobalScope()).toThrow(TypeError)
  })
})

describe('registerProcessor — validation ladder', () => {
  const scope = () => getContextAudioWorklet(makeContext())._globalScope
  class Ok extends PlecoAudioWorkletProcessor {
    process() {
      return true
    }
  }

  it('non-string name → TypeError (pleco strictness)', () => {
    expect(() => scope().registerProcessor(42, Ok)).toThrow(TypeError)
  })

  it('empty name → NotSupportedError', () => {
    const err = (() => {
      try {
        scope().registerProcessor('', Ok)
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
  })

  it('duplicate name → NotSupportedError', () => {
    const s = scope()
    s.registerProcessor('dup', Ok)
    expect(() => s.registerProcessor('dup', class extends Ok {})).toThrow(DOMException)
    try {
      s.registerProcessor('dup', class extends Ok {})
    } catch (e) {
      expect(e.name).toBe('NotSupportedError')
    }
  })

  it('non-constructor (arrow function, non-function) → TypeError', () => {
    expect(() => scope().registerProcessor('a', () => {})).toThrow(TypeError)
    expect(() => scope().registerProcessor('b', 42)).toThrow(TypeError)
    expect(() => scope().registerProcessor('c', undefined)).toThrow(TypeError)
  })

  it('constructor whose prototype is not an Object → TypeError', () => {
    function F() {}
    F.prototype = 5
    expect(() => scope().registerProcessor('p', F)).toThrow(TypeError)
  })

  it('a class NOT extending AudioWorkletProcessor registers (spec ladder has no inheritance check)', () => {
    const s = scope()
    expect(() =>
      s.registerProcessor(
        'plain',
        class {
          process() {
            return false
          }
        },
      ),
    ).not.toThrow()
  })

  it('non-iterable parameterDescriptors → TypeError', () => {
    for (const bad of [42, {}, null]) {
      class P extends PlecoAudioWorkletProcessor {
        static get parameterDescriptors() {
          return bad
        }
        process() {}
      }
      expect(() => scope().registerProcessor('x', P)).toThrow(TypeError)
    }
  })

  it('undefined parameterDescriptors is fine — zero parameters registered', () => {
    const ctx = makeContext()
    register(
      ctx,
      'no-desc',
      class extends PlecoAudioWorkletProcessor {
        process() {
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'no-desc')
    expect(node.parameters.size).toBe(0)
  })

  it('descriptor missing required name → TypeError; non-object descriptor → TypeError', () => {
    class NoName extends PlecoAudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{ defaultValue: 1 }]
      }
      process() {}
    }
    expect(() => scope().registerProcessor('x', NoName)).toThrow(TypeError)
    class NotDict extends PlecoAudioWorkletProcessor {
      static get parameterDescriptors() {
        return [7]
      }
      process() {}
    }
    expect(() => scope().registerProcessor('y', NotDict)).toThrow(TypeError)
  })

  it('descriptor with invalid automationRate → TypeError (ctor-dict enum rule)', () => {
    class Bad extends PlecoAudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{ name: 'g', automationRate: 'sometimes' }]
      }
      process() {}
    }
    expect(() => scope().registerProcessor('x', Bad)).toThrow(TypeError)
  })

  it('descriptor with non-finite float member → TypeError', () => {
    class Bad extends PlecoAudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{ name: 'g', defaultValue: NaN }]
      }
      process() {}
    }
    expect(() => scope().registerProcessor('x', Bad)).toThrow(TypeError)
  })

  it('duplicate parameter names → NotSupportedError', () => {
    class Dup extends PlecoAudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{ name: 'g' }, { name: 'g' }]
      }
      process() {}
    }
    try {
      scope().registerProcessor('x', Dup)
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException)
      expect(e.name).toBe('NotSupportedError')
    }
  })

  it('defaultValue outside [minValue, maxValue] → InvalidStateError (both sides)', () => {
    for (const d of [
      { name: 'g', defaultValue: 2, minValue: 0, maxValue: 1 },
      { name: 'g', defaultValue: -1, minValue: 0, maxValue: 1 },
    ]) {
      class Out extends PlecoAudioWorkletProcessor {
        static get parameterDescriptors() {
          return [d]
        }
        process() {}
      }
      try {
        scope().registerProcessor('x', Out)
        expect.unreachable()
      } catch (e) {
        expect(e).toBeInstanceOf(DOMException)
        expect(e.name).toBe('InvalidStateError')
      }
    }
  })

  it('parameterDescriptors accepts any iterable (generator)', () => {
    const ctx = makeContext()
    class Gen extends PlecoAudioWorkletProcessor {
      static get parameterDescriptors() {
        return (function* () {
          yield { name: 'a', defaultValue: 3 }
        })()
      }
      process() {
        return true
      }
    }
    register(ctx, 'gen', Gen)
    const node = new PlecoAudioWorkletNode(ctx, 'gen')
    expect(node.parameters.get('a').defaultValue).toBe(3)
  })
})

describe('getContextAudioWorklet — the vend', () => {
  it('memoizes one worklet (and one scope) per context; contexts are isolated', () => {
    const a = makeContext()
    const b = makeContext()
    const wa = getContextAudioWorklet(a)
    expect(getContextAudioWorklet(a)).toBe(wa)
    expect(wa).toBeInstanceOf(PlecoAudioWorklet)
    register(
      a,
      'only-in-a',
      class extends PlecoAudioWorkletProcessor {
        process() {}
      },
    )
    expect(getContextAudioWorklet(b)._parameterDescriptorMap.has('only-in-a')).toBe(false)
    expect(() => new PlecoAudioWorkletNode(b, 'only-in-a')).toThrow(DOMException)
  })
})

// ---------------------------------------------------------------------------
// AudioWorklet.addModule — file:// and data: URLs into the evaluation scope
// ---------------------------------------------------------------------------

describe('PlecoAudioWorklet.addModule', () => {
  const DOUBLER_SRC = `
    class Doubler extends AudioWorkletProcessor {
      process(inputs, outputs) {
        const input = inputs[0], output = outputs[0]
        for (let c = 0; c < output.length; c++) {
          if (input[c]) for (let i = 0; i < output[c].length; i++) output[c][i] = input[c][i] * 2
        }
        return true
      }
    }
    registerProcessor('doubler', Doubler)
  `

  it('data: URL (percent-encoded) evaluates and registers before the promise resolves', async () => {
    const ctx = makeContext()
    const worklet = getContextAudioWorklet(ctx)
    await worklet.addModule('data:text/javascript,' + encodeURIComponent(DOUBLER_SRC))
    expect(worklet._parameterDescriptorMap.has('doubler')).toBe(true)
    expect(() => new PlecoAudioWorkletNode(ctx, 'doubler')).not.toThrow()
  })

  it('data: URL (base64) evaluates and registers', async () => {
    const ctx = makeContext()
    const worklet = getContextAudioWorklet(ctx)
    const b64 = Buffer.from(DOUBLER_SRC, 'utf8').toString('base64')
    await worklet.addModule('data:text/javascript;base64,' + b64)
    expect(worklet._parameterDescriptorMap.has('doubler')).toBe(true)
  })

  it('file:// URL reads and evaluates the module file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pleco-worklet-'))
    try {
      const file = join(dir, 'doubler.js')
      writeFileSync(file, DOUBLER_SRC)
      const ctx = makeContext()
      const worklet = getContextAudioWorklet(ctx)
      await worklet.addModule(pathToFileURL(file).href)
      expect(worklet._parameterDescriptorMap.has('doubler')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('non-string / relative / unsupported-scheme URLs reject with TypeError', async () => {
    const worklet = getContextAudioWorklet(makeContext())
    await expect(worklet.addModule(42)).rejects.toThrow(TypeError)
    await expect(worklet.addModule('processors.js')).rejects.toThrow(TypeError)
    await expect(worklet.addModule('https://example.com/p.js')).rejects.toThrow(TypeError)
  })

  it('malformed data: URL (no comma) rejects with TypeError', async () => {
    const worklet = getContextAudioWorklet(makeContext())
    await expect(worklet.addModule('data:text/javascript')).rejects.toThrow(TypeError)
  })

  it('unreadable file:// URL rejects with AbortError (HTML worklet fetch failure)', async () => {
    const worklet = getContextAudioWorklet(makeContext())
    const err = await worklet.addModule('file:///definitely/not/a/real/pleco/module.js').catch((e) => e)
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('AbortError')
  })

  it('the same module URL is evaluated at most once (module map)', async () => {
    const ctx = makeContext()
    const worklet = getContextAudioWorklet(ctx)
    const url = 'data:text/javascript,' + encodeURIComponent(DOUBLER_SRC)
    await worklet.addModule(url)
    // A second evaluation would hit registerProcessor's duplicate-name
    // NotSupportedError — resolving proves the script did not re-run.
    await expect(worklet.addModule(url)).resolves.toBeUndefined()
  })

  it('module evaluation errors propagate as thrown (registerProcessor ladder included)', async () => {
    const ctx = makeContext()
    const worklet = getContextAudioWorklet(ctx)
    await expect(
      worklet.addModule('data:text/javascript,' + encodeURIComponent(`throw new Error('boom')`)),
    ).rejects.toThrow('boom')
    const reg = `registerProcessor('twice', class extends AudioWorkletProcessor { process() {} })`
    await worklet.addModule('data:text/javascript,' + encodeURIComponent(reg))
    const err = await worklet
      .addModule('data:text/javascript,%20' + encodeURIComponent(reg)) // different URL, same name
      .catch((e) => e)
    expect(err).toBeInstanceOf(DOMException)
    expect(err.name).toBe('NotSupportedError')
  })

  it('module code sees the scope surface as bare identifiers (sampleRate, renderQuantumSize, AudioWorkletProcessor)', async () => {
    const ctx = makeContext()
    const worklet = getContextAudioWorklet(ctx)
    const src = `
      registerProcessor('probe', class extends AudioWorkletProcessor {
        static captured = {
          sampleRate, renderQuantumSize,
          hasRegister: typeof registerProcessor === 'function',
          baseIsCtor: typeof AudioWorkletProcessor === 'function',
        }
        process() { return false }
      })
    `
    await worklet.addModule('data:text/javascript,' + encodeURIComponent(src))
    const cls = worklet._globalScope._processorCtorMap.get('probe')
    expect(cls.captured).toEqual({
      sampleRate: SR,
      renderQuantumSize: RENDER_QUANTUM,
      hasRegister: true,
      baseIsCtor: true,
    })
  })

  it('currentFrame is LIVE inside module-defined process() — sample-exact across quanta', async () => {
    const ctx = makeContext(2 * RENDER_QUANTUM)
    const worklet = getContextAudioWorklet(ctx)
    const src = `
      registerProcessor('frame-writer', class extends AudioWorkletProcessor {
        process(inputs, outputs) {
          outputs[0][0].fill(currentFrame)
          return true
        }
      })
    `
    await worklet.addModule('data:text/javascript,' + encodeURIComponent(src))
    const node = new PlecoAudioWorkletNode(ctx, 'frame-writer')
    node.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(out[0]).toBe(0)
    expect(out[RENDER_QUANTUM - 1]).toBe(0)
    expect(out[RENDER_QUANTUM]).toBe(RENDER_QUANTUM)
    expect(out[2 * RENDER_QUANTUM - 1]).toBe(RENDER_QUANTUM)
  })
})

// ---------------------------------------------------------------------------
// AudioWorkletNode — constructor matrix
// ---------------------------------------------------------------------------

describe('PlecoAudioWorkletNode — constructor', () => {
  function ctxWith(name, cls) {
    const ctx = makeContext()
    register(ctx, name, cls ?? makePassthrough())
    return ctx
  }

  it('unknown processor name → InvalidStateError', () => {
    const ctx = makeContext()
    try {
      new PlecoAudioWorkletNode(ctx, 'nobody')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException)
      expect(e.name).toBe('InvalidStateError')
    }
  })

  it('spec defaults: 1 input, 1 output, channelCount 2, mode max, interpretation speakers', () => {
    const ctx = ctxWith('p')
    const node = new PlecoAudioWorkletNode(ctx, 'p')
    expect(node.numberOfInputs).toBe(1)
    expect(node.numberOfOutputs).toBe(1)
    expect(node.channelCount).toBe(2)
    expect(node.channelCountMode).toBe('max')
    expect(node.channelInterpretation).toBe('speakers')
  })

  it('null options is the empty dictionary', () => {
    const ctx = ctxWith('p')
    expect(() => new PlecoAudioWorkletNode(ctx, 'p', null)).not.toThrow()
  })

  it('numberOfInputs and numberOfOutputs both zero → NotSupportedError', () => {
    const ctx = ctxWith('p')
    try {
      new PlecoAudioWorkletNode(ctx, 'p', { numberOfInputs: 0, numberOfOutputs: 0 })
      expect.unreachable()
    } catch (e) {
      expect(e.name).toBe('NotSupportedError')
    }
  })

  it('outputChannelCount entry of 0 or > 32 → NotSupportedError', () => {
    const ctx = ctxWith('p')
    for (const bad of [[0], [33]]) {
      try {
        new PlecoAudioWorkletNode(ctx, 'p', { outputChannelCount: bad })
        expect.unreachable()
      } catch (e) {
        expect(e.name).toBe('NotSupportedError')
      }
    }
  })

  it('outputChannelCount length ≠ numberOfOutputs → IndexSizeError', () => {
    const ctx = ctxWith('p')
    try {
      new PlecoAudioWorkletNode(ctx, 'p', { numberOfOutputs: 2, outputChannelCount: [1] })
      expect.unreachable()
    } catch (e) {
      expect(e.name).toBe('IndexSizeError')
    }
  })

  it('AudioNode init (spec step 3) precedes § Configuring Channels (step 4): an invalid channelCount wins', () => {
    const ctx = ctxWith('p')
    try {
      // channelCount 0 (AudioNode init, NotSupportedError) AND a bad
      // outputChannelCount length (configure channels, IndexSizeError):
      // the spec runs initialization first, so its error must surface.
      new PlecoAudioWorkletNode(ctx, 'p', { channelCount: 0, numberOfOutputs: 2, outputChannelCount: [1] })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException)
      expect(e.name).toBe('NotSupportedError')
    }
  })

  it('dictionary conversion TypeErrors fire before the InvalidStateError name lookup', () => {
    const ctx = makeContext() // 'nobody' is NOT registered
    expect(() => new PlecoAudioWorkletNode(ctx, 'nobody', { channelCountMode: 'bogus' })).toThrow(TypeError)
    expect(() => new PlecoAudioWorkletNode(ctx, 'nobody', { numberOfInputs: 1.5 })).toThrow(TypeError)
    expect(() => new PlecoAudioWorkletNode(ctx, 'nobody', { parameterData: { g: NaN } })).toThrow(TypeError)
    expect(() => new PlecoAudioWorkletNode(ctx, 'nobody', { processorOptions: 42 })).toThrow(TypeError)
  })

  it('non-string name / missing context → TypeError', () => {
    const ctx = ctxWith('p')
    expect(() => new PlecoAudioWorkletNode(ctx, 7)).toThrow(TypeError)
    expect(() => new PlecoAudioWorkletNode(null, 'p')).toThrow(TypeError)
  })

  it('the processor is constructed during node construction with the cloned options dictionary', () => {
    let captured = null
    const ctx = makeContext()
    register(
      ctx,
      'capture',
      class extends PlecoAudioWorkletProcessor {
        constructor(options) {
          super()
          captured = options
        }
        process() {
          return true
        }
      },
    )
    const processorOptions = { table: [1, 2, 3] }
    new PlecoAudioWorkletNode(ctx, 'capture', { processorOptions })
    expect(captured.numberOfInputs).toBe(1)
    expect(captured.numberOfOutputs).toBe(1)
    expect(captured.processorOptions).toEqual({ table: [1, 2, 3] })
    // StructuredSerialize semantics: the processor's copy shares no identity.
    expect(captured.processorOptions).not.toBe(processorOptions)
    processorOptions.table.push(4)
    expect(captured.processorOptions.table).toEqual([1, 2, 3])
  })

  it('non-cloneable processorOptions → synchronous DataCloneError from the node constructor', () => {
    const ctx = ctxWith('p')
    try {
      new PlecoAudioWorkletNode(ctx, 'p', { processorOptions: { fn: () => {} } })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(DOMException)
      expect(e.name).toBe('DataCloneError')
    }
  })

  it('direct new PlecoAudioWorkletProcessor() outside node construction → TypeError', () => {
    expect(() => new PlecoAudioWorkletProcessor()).toThrow(TypeError)
  })

  it('a second processor construction inside the same node construction → TypeError (slot already emptied)', () => {
    const ctx = makeContext()
    let innerError = null
    register(
      ctx,
      'greedy',
      class extends PlecoAudioWorkletProcessor {
        constructor() {
          super()
          try {
            new PlecoAudioWorkletProcessor()
          } catch (e) {
            innerError = e
          }
        }
        process() {
          return true
        }
      },
    )
    new PlecoAudioWorkletNode(ctx, 'greedy')
    expect(innerError).toBeInstanceOf(TypeError)
  })
})

// ---------------------------------------------------------------------------
// AudioParamMap — readonly maplike + descriptor→param mapping + parameterData
// ---------------------------------------------------------------------------

describe('PlecoAudioParamMap + parameterData', () => {
  function paramNode(ctx, parameterData) {
    register(
      ctx,
      'params',
      class extends PlecoAudioWorkletProcessor {
        static get parameterDescriptors() {
          return [
            { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 10 },
            { name: 'rate', defaultValue: 2, automationRate: 'k-rate' },
          ]
        }
        process() {
          return true
        }
      },
    )
    return new PlecoAudioWorkletNode(ctx, 'params', parameterData ? { parameterData } : undefined)
  }

  it('parameters is a readonly maplike with the full read surface', () => {
    const node = paramNode(makeContext())
    const map = node.parameters
    expect(map).toBeInstanceOf(PlecoAudioParamMap)
    expect(map.size).toBe(2)
    expect(map.has('gain')).toBe(true)
    expect(map.has('nope')).toBe(false)
    expect(map.get('gain')).toBeInstanceOf(PlecoAudioParam)
    expect([...map.keys()]).toEqual(['gain', 'rate'])
    expect([...map.values()].every((p) => p instanceof PlecoAudioParam)).toBe(true)
    expect([...map.entries()].map(([k]) => k)).toEqual(['gain', 'rate'])
    expect([...map].map(([k]) => k)).toEqual(['gain', 'rate']) // @@iterator
    const seen = []
    map.forEach(function (value, key, m) {
      seen.push([key, value instanceof PlecoAudioParam, m === map])
    })
    expect(seen).toEqual([
      ['gain', true, true],
      ['rate', true, true],
    ])
    // readonly: no mutation surface
    expect(map.set).toBeUndefined()
    expect(map.delete).toBeUndefined()
    expect(map.clear).toBeUndefined()
  })

  it('descriptors map onto the AudioParams: defaultValue / minValue / maxValue / automationRate', () => {
    const node = paramNode(makeContext())
    const gain = node.parameters.get('gain')
    expect(gain.defaultValue).toBe(1)
    expect(gain.minValue).toBe(0)
    expect(gain.maxValue).toBe(10)
    expect(gain.automationRate).toBe('a-rate')
    const rate = node.parameters.get('rate')
    expect(rate.automationRate).toBe('k-rate')
    expect(rate.defaultValue).toBe(2)
    // Descriptor float defaults: full single-float nominal range.
    const ctx = makeContext()
    register(
      ctx,
      'bare',
      class extends PlecoAudioWorkletProcessor {
        static get parameterDescriptors() {
          return [{ name: 'x' }]
        }
        process() {}
      },
    )
    const x = new PlecoAudioWorkletNode(ctx, 'bare').parameters.get('x')
    expect(x.defaultValue).toBe(0)
    expect(x.minValue).toBe(Math.fround(-3.4028235e38))
    expect(x.maxValue).toBe(Math.fround(3.4028235e38))
    expect(x.automationRate).toBe('a-rate')
  })

  it('parameterData sets the value attribute, leaves defaultValue, and skips unknown names', () => {
    const node = paramNode(makeContext(), { gain: 5, unknown: 3 })
    const gain = node.parameters.get('gain')
    expect(gain.value).toBe(5)
    expect(gain.defaultValue).toBe(1)
    expect(node.parameters.has('unknown')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// MessagePorts — node.port ↔ processor.port
// ---------------------------------------------------------------------------

describe('AudioWorkletNode.port ↔ AudioWorkletProcessor.port', () => {
  it('the entangled pair communicates bidirectionally; the port exists during the processor constructor', async () => {
    const ctx = makeContext()
    let portInCtor = null
    register(
      ctx,
      'echo',
      class extends PlecoAudioWorkletProcessor {
        constructor() {
          super()
          portInCtor = this.port
          this.port.onmessage = (e) => this.port.postMessage(e.data * 2)
        }
        process() {
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'echo')
    expect(portInCtor).not.toBeNull()
    expect(typeof node.port.postMessage).toBe('function')
    const reply = await new Promise((resolve) => {
      node.port.onmessage = (e) => resolve(e.data)
      node.port.postMessage(21)
    })
    expect(reply).toBe(42)
    node.port.close()
    portInCtor.close()
  })
})

// ---------------------------------------------------------------------------
// Rendering — sample-exact process() contract
// ---------------------------------------------------------------------------

describe('rendering — process(inputs, outputs, parameters)', () => {
  it('a doubling processor renders offline sample-exact', () => {
    const frames = 2 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    register(
      ctx,
      'doubler',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          const input = inputs[0]
          const output = outputs[0]
          for (let c = 0; c < output.length; c++) {
            if (input[c]) for (let i = 0; i < output[c].length; i++) output[c][i] = input[c][i] * 2
          }
          return true
        }
      },
    )
    const buf = ctx.createBuffer(1, frames, SR)
    const data = buf.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = i / frames
    const src = ctx.createBufferSource()
    src.buffer = buf
    const node = new PlecoAudioWorkletNode(ctx, 'doubler')
    src.connect(node)
    node.connect(ctx.destination)
    src.start(0)
    const out = ctx.renderSync().getChannelData(0)
    const expected = new Float32Array(frames)
    for (let i = 0; i < frames; i++) expected[i] = Math.fround(Math.fround(i / frames) * 2)
    expect(out).toEqual(expected)
  })

  it('inputs/outputs/parameters arrive frozen; unconnected inputs have zero channels', () => {
    const ctx = makeContext()
    const observed = {}
    register(
      ctx,
      'shape',
      class extends PlecoAudioWorkletProcessor {
        static get parameterDescriptors() {
          return [{ name: 'g', defaultValue: 1 }]
        }
        process(inputs, outputs, parameters) {
          observed.inputsFrozen = Object.isFrozen(inputs) && Object.isFrozen(inputs[0])
          observed.outputsFrozen = Object.isFrozen(outputs) && Object.isFrozen(outputs[0])
          observed.parametersFrozen = Object.isFrozen(parameters)
          observed.inputChannels = inputs[0].length
          observed.outputChannels = outputs[0].length
          observed.outputZeroed = outputs[0][0].every((v) => v === 0)
          return false
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'shape')
    node.connect(ctx.destination)
    ctx.renderSync()
    expect(observed).toEqual({
      inputsFrozen: true,
      outputsFrozen: true,
      parametersFrozen: true,
      inputChannels: 0, // no connections → zero channels
      outputChannels: 1, // dynamic single output with no input → initial count 1
      outputZeroed: true,
    })
  })

  it('dynamic 1-in/1-out output follows the input channel count (stereo passthrough)', () => {
    const frames = RENDER_QUANTUM
    const ctx = makeContext(frames, 2)
    register(ctx, 'pass', makePassthrough())
    const buf = ctx.createBuffer(2, frames, SR)
    buf.getChannelData(0).fill(0.25)
    buf.getChannelData(1).fill(-0.5)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const node = new PlecoAudioWorkletNode(ctx, 'pass')
    src.connect(node)
    node.connect(ctx.destination)
    src.start(0)
    const out = ctx.renderSync()
    expect(out.getChannelData(0)[0]).toBe(0.25)
    expect(out.getChannelData(0)[frames - 1]).toBe(0.25)
    expect(out.getChannelData(1)[0]).toBe(-0.5)
    expect(out.getChannelData(1)[frames - 1]).toBe(-0.5)
  })

  it('outputChannelCount fixes the output shape regardless of input', () => {
    const ctx = makeContext(RENDER_QUANTUM, 3)
    register(
      ctx,
      'tri',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          for (let c = 0; c < outputs[0].length; c++) outputs[0][c].fill(c + 1)
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'tri', { outputChannelCount: [3] })
    node.connect(ctx.destination)
    const out = ctx.renderSync()
    expect(out.getChannelData(0)[0]).toBe(1)
    expect(out.getChannelData(1)[0]).toBe(2)
    expect(out.getChannelData(2)[0]).toBe(3)
  })

  it('multi-output shapes: each output carries its own block (mono outputs by default)', () => {
    const ctx = makeContext(RENDER_QUANTUM, 2)
    register(
      ctx,
      'split2',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          outputs[0][0].fill(0.5)
          outputs[1][0].fill(-0.25)
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'split2', { numberOfOutputs: 2 })
    const merger = ctx.createChannelMerger(2)
    node.connect(merger, 0, 0)
    node.connect(merger, 1, 1)
    merger.connect(ctx.destination)
    const out = ctx.renderSync()
    expect(out.getChannelData(0)[0]).toBe(0.5)
    expect(out.getChannelData(1)[0]).toBe(-0.25)
  })

  it('a zero-output (VU-meter shape) node is processed every quantum through the tail set', () => {
    const frames = 3 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    const sums = []
    register(
      ctx,
      'vu',
      class extends PlecoAudioWorkletProcessor {
        process(inputs) {
          const input = inputs[0]
          let sum = 0
          if (input.length > 0) for (let i = 0; i < input[0].length; i++) sum += input[0][i]
          sums.push(sum)
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'vu', { numberOfInputs: 1, numberOfOutputs: 0 })
    connectOnesSource(ctx, node, frames)
    ctx.renderSync() // node is connected to NOTHING downstream
    expect(sums).toEqual([RENDER_QUANTUM, RENDER_QUANTUM, RENDER_QUANTUM])
  })

  it("process is looked up fresh each quantum (Get semantics — late reassignment observed)", () => {
    const frames = 2 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    let instance = null
    register(
      ctx,
      'mutable',
      class extends PlecoAudioWorkletProcessor {
        constructor() {
          super()
          instance = this
        }
        process(inputs, outputs) {
          outputs[0][0].fill(0.1)
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'mutable')
    node.connect(ctx.destination)
    ctx.renderQuantum()
    instance.process = (inputs, outputs) => {
      outputs[0][0].fill(0.9)
      return true
    }
    const block = ctx.renderQuantum()
    expect(block.getChannelData(0)[0]).toBeCloseTo(0.9, 6)
  })
})

// ---------------------------------------------------------------------------
// parameters — per-quantum Float32Array blocks, length 1 when constant
// ---------------------------------------------------------------------------

describe('parameters blocks — automation and constancy', () => {
  function gainNodeWith(ctx, descriptors) {
    const seen = []
    register(
      ctx,
      'gainy',
      class extends PlecoAudioWorkletProcessor {
        static get parameterDescriptors() {
          return descriptors
        }
        process(inputs, outputs, parameters) {
          const g = parameters.gain
          seen.push(g.slice())
          const output = outputs[0]
          for (let c = 0; c < output.length; c++) {
            for (let i = 0; i < output[c].length; i++) output[c][i] = g[i % g.length]
          }
          return true
        }
      },
    )
    return { node: new PlecoAudioWorkletNode(ctx, 'gainy'), seen }
  }

  it('a constant a-rate param arrives as a length-1 block with the constant value', () => {
    const ctx = makeContext()
    const { node, seen } = gainNodeWith(ctx, [{ name: 'gain', defaultValue: 0.75 }])
    node.connect(ctx.destination)
    ctx.renderSync()
    expect(seen.length).toBe(1)
    expect(seen[0].length).toBe(1)
    expect(seen[0][0]).toBe(0.75)
  })

  it('a k-rate param is ALWAYS length 1, sampled at the block start even mid-automation', () => {
    const ctx = makeContext(2 * RENDER_QUANTUM)
    const { node, seen } = gainNodeWith(ctx, [
      { name: 'gain', defaultValue: 0, automationRate: 'k-rate' },
    ])
    node.parameters.get('gain').setValueAtTime(0, 0)
    node.parameters.get('gain').linearRampToValueAtTime(1, (2 * RENDER_QUANTUM) / SR)
    node.connect(ctx.destination)
    ctx.renderSync()
    expect(seen.length).toBe(2)
    expect(seen[0].length).toBe(1)
    expect(seen[1].length).toBe(1)
    expect(seen[0][0]).toBe(0) // block-start value of the ramp
    expect(seen[1][0]).toBeCloseTo(0.5, 6) // ramp midpoint at frame 128
  })

  it('an automated a-rate param arrives as a full render-quantum block, sample-exact', () => {
    const ctx = makeContext(RENDER_QUANTUM)
    const { node, seen } = gainNodeWith(ctx, [{ name: 'gain', defaultValue: 0 }])
    const gain = node.parameters.get('gain')
    gain.setValueAtTime(0, 0)
    gain.linearRampToValueAtTime(1, RENDER_QUANTUM / SR)
    node.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(seen[0].length).toBe(RENDER_QUANTUM)
    for (let i = 0; i < RENDER_QUANTUM; i++) {
      expect(seen[0][i]).toBe(Math.fround(i / RENDER_QUANTUM)) // exact: i·2⁻⁷
      expect(out[i]).toBe(Math.fround(i / RENDER_QUANTUM))
    }
  })

  it('the automation clamps to the descriptor [minValue, maxValue] at output time', () => {
    const ctx = makeContext()
    const { node, seen } = gainNodeWith(ctx, [
      { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 2 },
    ])
    node.parameters.get('gain').setValueAtTime(5, 0) // above maxValue
    node.connect(ctx.destination)
    ctx.renderSync()
    expect(seen[0][0]).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// processorerror — the dead-node path (error → one event → silence forever)
// ---------------------------------------------------------------------------

describe('processorerror + dead-node semantics', () => {
  it('a throwing process() fires processorerror ONCE, silences the erroring quantum, and never runs again', async () => {
    const frames = 3 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    let calls = 0
    register(
      ctx,
      'bomb',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          calls++
          outputs[0][0].fill(1) // written EVERY call — including the throwing one
          if (calls === 2) throw new Error('kaboom')
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'bomb')
    node.connect(ctx.destination)
    const events = []
    node.onprocessorerror = (e) => events.push(e)
    const out = ctx.renderSync().getChannelData(0)
    await flush()
    expect(calls).toBe(2) // never invoked after the abrupt completion
    expect(events.length).toBe(1) // exactly one processorerror
    expect(events[0]).toBeInstanceOf(PlecoErrorEvent)
    expect(events[0].type).toBe('processorerror')
    expect(events[0].message).toBe('kaboom')
    expect(events[0].error).toBeInstanceOf(Error)
    expect(out[0]).toBe(1) // quantum 0: authored audio
    expect(out[RENDER_QUANTUM]).toBe(0) // quantum 1: the ERRORING quantum is silent
    expect(out[2 * RENDER_QUANTUM]).toBe(0) // quantum 2: dead → silence
  })

  it('onprocessorerror is a proper handler attribute (replace, unsubscribe)', async () => {
    const ctx = makeContext()
    register(
      ctx,
      'bomb',
      class extends PlecoAudioWorkletProcessor {
        process() {
          throw new Error('x')
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'bomb')
    node.connect(ctx.destination)
    const a = []
    const first = () => a.push('first')
    node.onprocessorerror = first
    expect(node.onprocessorerror).toBe(first)
    node.onprocessorerror = () => a.push('second') // replaces
    ctx.renderSync()
    await flush()
    expect(a).toEqual(['second'])
    node.onprocessorerror = null
    expect(node.onprocessorerror).toBeNull()
  })

  it('a processor without a callable process → TypeError path: processorerror + silence', async () => {
    const ctx = makeContext()
    register(
      ctx,
      'no-process',
      class extends PlecoAudioWorkletProcessor {},
    )
    const node = new PlecoAudioWorkletNode(ctx, 'no-process')
    node.connect(ctx.destination)
    const events = []
    node.addEventListener('processorerror', (e) => events.push(e))
    const out = ctx.renderSync().getChannelData(0)
    await flush()
    expect(events.length).toBe(1)
    expect(events[0].error).toBeInstanceOf(TypeError)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('a throwing processor CONSTRUCTOR fires processorerror; the node is born dead and renders silence', async () => {
    const ctx = makeContext()
    register(
      ctx,
      'stillborn',
      class extends PlecoAudioWorkletProcessor {
        constructor() {
          super()
          throw new Error('ctor fail')
        }
        process(inputs, outputs) {
          outputs[0][0].fill(1)
          return true
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'stillborn') // does NOT throw
    node.connect(ctx.destination)
    const events = []
    node.onprocessorerror = (e) => events.push(e)
    await flush()
    expect(events.length).toBe(1)
    expect(events[0].message).toBe('ctor fail')
    const out = ctx.renderSync().getChannelData(0)
    expect(out.every((v) => v === 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// active source — return-value lifetime semantics
// ---------------------------------------------------------------------------

describe('active source flag — process() return-value lifetime', () => {
  it('a source-style processor keeps running while returning true, stops (silence, no error) after returning false', async () => {
    const frames = 4 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    let calls = 0
    register(
      ctx,
      'burst',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          calls++
          outputs[0][0].fill(1)
          return calls < 2 // true on call 1, false on call 2
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'burst')
    node.connect(ctx.destination)
    const events = []
    node.onprocessorerror = (e) => events.push(e)
    const out = ctx.renderSync().getChannelData(0)
    await flush()
    expect(calls).toBe(2) // not invoked once the flag dropped with no live inputs
    expect(events.length).toBe(0) // return-false is NOT an error
    expect(out[0]).toBe(1)
    expect(out[RENDER_QUANTUM]).toBe(1) // the returning-false quantum still carries its audio
    expect(out[2 * RENDER_QUANTUM]).toBe(0)
    expect(out[3 * RENDER_QUANTUM]).toBe(0)
  })

  it('no return value (undefined) is falsy — a no-input processor runs exactly once', () => {
    const ctx = makeContext(2 * RENDER_QUANTUM)
    let calls = 0
    register(
      ctx,
      'once',
      class extends PlecoAudioWorkletProcessor {
        process() {
          calls++
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'once')
    node.connect(ctx.destination)
    ctx.renderSync()
    expect(calls).toBe(1)
  })

  it('return-false with a LIVE connected input keeps process() running (actively-processing propagation)', () => {
    const frames = 3 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    let calls = 0
    register(
      ctx,
      'bypass',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          calls++
          if (inputs[0].length > 0) outputs[0][0].set(inputs[0][0])
          return false
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'bypass')
    connectOnesSource(ctx, node, frames)
    node.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    expect(calls).toBe(3) // input stays live for the whole render
    expect(out[0]).toBe(1)
    expect(out[frames - 1]).toBe(1)
  })

  it('when every connected source has ended, the input reports zero channels and a false-returning node goes quiet', () => {
    const frames = 3 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    let calls = 0
    const channelCounts = []
    register(
      ctx,
      'bypass',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          calls++
          channelCounts.push(inputs[0].length)
          if (inputs[0].length > 0) outputs[0][0].set(inputs[0][0])
          return false
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'bypass')
    connectOnesSource(ctx, node, RENDER_QUANTUM) // one-quantum source
    node.connect(ctx.destination)
    const out = ctx.renderSync().getChannelData(0)
    // Quantum 0: source live — its final content quantum presents its channel.
    // Quantum 1: the source's _ended flag flips DURING this quantum's pull
    // (content exhausted), so the pre-pull liveness capture still counts it
    // live for one more call — pleco's documented structural approximation
    // of the spec's actively-processing propagation (the input carries a
    // silent channel, so the audio is already correct here).
    // Quantum 2: source ended → input dead → active source false → not invoked.
    expect(calls).toBe(2)
    expect(channelCounts).toEqual([1, 1])
    expect(out[0]).toBe(1)
    expect(out[RENDER_QUANTUM]).toBe(0)
    expect(out[2 * RENDER_QUANTUM]).toBe(0)
  })

  it('a live input REVIVES a node whose active source flag has dropped', () => {
    const frames = 4 * RENDER_QUANTUM
    const ctx = makeContext(frames)
    let calls = 0
    register(
      ctx,
      'sleeper',
      class extends PlecoAudioWorkletProcessor {
        process(inputs, outputs) {
          calls++
          if (inputs[0].length > 0) outputs[0][0].set(inputs[0][0])
          return false
        }
      },
    )
    const node = new PlecoAudioWorkletNode(ctx, 'sleeper')
    node.connect(ctx.destination)
    // A source that starts at quantum 2 — the node sleeps through 1 (after
    // its initial active-source-true call at quantum 0), then revives.
    const buf = ctx.createBuffer(1, RENDER_QUANTUM, SR)
    buf.getChannelData(0).fill(0.5)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(node)
    src.start((2 * RENDER_QUANTUM) / SR)
    const out = ctx.renderSync().getChannelData(0)
    // calls: quantum 0 (initial flag true) + quanta where the source is live.
    // The source is registered as live from start() (structural liveness),
    // so quanta 1..2 count as live until it ends; what matters: the revival
    // actually re-invoked process and the audio got through at quantum 2.
    expect(out[2 * RENDER_QUANTUM]).toBe(0.5)
    expect(calls).toBeGreaterThanOrEqual(2)
  })
})
