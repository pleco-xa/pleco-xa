import { describe, it, expect } from 'vitest'
import { PlecoOfflineAudioContext, PlecoAudioWorkletNode } from '../src/engine/index.js'

// PHASE 2 — Echoplex benchmark compositions (task #65, the acceptance test / ballast).
//
// Each block builds an Echoplex behavior from ONLY the public `pleco-xa/engine`
// primitives (imported the way a real consumer would — no internal file paths),
// proving the thesis: the Echoplex contributes ZERO pleco modules; it is
// COMPOSED from the general Web Audio surface. Where a behavior cannot be built
// from primitives, we mark it `it.fails` and log the gap (see the parity matrix)
// rather than hide it — the device is the forcing function that finds shallow
// primitives. SR 8192 => 1 render quantum = 128/8192 = 0.015625 s (binary-exact).

const SR = 8192

/** Register an AudioWorklet processor from inline source via a data: URL. */
async function addProcessor(ctx, name, body) {
  const src = `registerProcessor(${JSON.stringify(name)}, class extends AudioWorkletProcessor { ${body} });`
  await ctx.audioWorklet.addModule('data:text/javascript,' + encodeURIComponent(src))
}

/** Let queued MessagePort deliveries flush after a synchronous renderSync(). */
const flushPort = () => new Promise((r) => setTimeout(r, 20))

describe('composition 1 — feedback echo = DelayNode + GainNode cycle (no feedback module)', () => {
  // The Echoplex's feedback is not a bespoke node: in Web Audio it is a
  // Gain→Delay→(back to Gain) cycle. pleco's P11 spec cycle rule makes this the
  // ONLY legal kind of cycle, and clamps the in-cycle delay to >= one render
  // quantum (128 frames) — so delayTime 64/SR renders at a 128-frame period.
  const buildEcho = (feedback) => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 640, sampleRate: SR })
    const imp = ctx.createBuffer(1, 1, SR)
    imp.getChannelData(0)[0] = 1
    const src = ctx.createBufferSource()
    src.buffer = imp
    const fb = ctx.createGain()
    fb.gain.value = feedback
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 64 / SR // clamped up to one quantum inside the cycle
    src.connect(delay)
    delay.connect(fb)
    fb.connect(delay) // the cycle — legal because it contains a DelayNode
    delay.connect(ctx.destination)
    src.start(0)
    return ctx.renderSync().getChannelData(0)
  }

  it('decays by the feedback coefficient each pass (0.5 => 1, 0.5, 0.25, 0.125 at 128-frame period)', () => {
    const out = buildEcho(0.5)
    // echoes land at n*128 (the min-one-quantum in-cycle delay), amplitude 0.5^(n-1)
    expect(out[128]).toBe(1)
    expect(out[256]).toBe(0.5)
    expect(out[384]).toBe(0.25)
    expect(out[512]).toBe(0.125)
    // nothing between the taps
    expect(out[64]).toBe(0)
    expect(out[200]).toBe(0)
  })

  it('feedback = 1.0 sustains (no decay across the rendered window)', () => {
    const out = buildEcho(1.0)
    expect(out[128]).toBe(1)
    expect(out[256]).toBe(1)
    expect(out[384]).toBe(1)
    expect(out[512]).toBe(1)
  })
})

describe('composition 2 — looper = BufferSource(loop) playback + AudioWorklet recorder', () => {
  it('loops a buffer bit-exact (8-frame ramp repeated 3x)', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 24, sampleRate: SR })
    const b = ctx.createBuffer(1, 8, SR)
    b.getChannelData(0).forEach((_, i, a) => (a[i] = i))
    const s = ctx.createBufferSource()
    s.buffer = b
    s.loop = true
    s.connect(ctx.destination)
    s.start(0)
    const out = Array.from(ctx.renderSync().getChannelData(0))
    const ramp = [0, 1, 2, 3, 4, 5, 6, 7]
    expect(out).toEqual([...ramp, ...ramp, ...ramp])
  })

  it('records the playing loop into a buffer via a worklet processor + port (capture what plays)', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    // an 8-frame ramp, looping, is the "audio at line-in"
    const b = ctx.createBuffer(1, 8, SR)
    b.getChannelData(0).forEach((_, i, a) => (a[i] = i))
    const s = ctx.createBufferSource()
    s.buffer = b
    s.loop = true
    s.start(0)
    // recorder: pass input through AND post a copy of channel 0 each quantum
    await addProcessor(
      ctx,
      'recorder',
      `process(inputs, outputs){ const ic=(inputs[0]&&inputs[0][0])||new Float32Array(128);
        this.port.postMessage(Float32Array.from(ic));
        const oc=outputs[0]&&outputs[0][0]; if(oc) oc.set(ic); return true; }`,
    )
    const rec = new PlecoAudioWorkletNode(ctx, 'recorder')
    const chunks = []
    rec.port.onmessage = (e) => chunks.push(e.data)
    s.connect(rec)
    rec.connect(ctx.destination)
    ctx.renderSync()
    await flushPort()

    const captured = chunks.flatMap((c) => Array.from(c))
    expect(chunks.length).toBe(2) // 256 frames / 128-frame quantum
    expect(captured.length).toBe(256)
    // the captured content is the looping ramp
    const ramp = [0, 1, 2, 3, 4, 5, 6, 7]
    expect(captured.slice(0, 16)).toEqual([...ramp, ...ramp])
  })
})

describe('composition 3 — overdub = (loop x feedback) + live input, written back via a worklet', () => {
  it('captures loop*feedback + input as the new loop content', async () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 256, sampleRate: SR })
    const loop = ctx.createConstantSource()
    loop.offset.value = 0.4 // the existing loop
    loop.start(0)
    const fb = ctx.createGain()
    fb.gain.value = 0.5 // feedback: existing loop decays
    loop.connect(fb)
    const live = ctx.createConstantSource()
    live.offset.value = 0.2 // the new material being overdubbed in
    live.start(0)
    // overdub processor: out = input0 (loop*feedback) + input1 (live); post the sum (the write-back)
    await addProcessor(
      ctx,
      'overdub',
      `process(inputs, outputs){
        const a=(inputs[0]&&inputs[0][0])||new Float32Array(128);
        const b=(inputs[1]&&inputs[1][0])||new Float32Array(128);
        const oc=outputs[0]&&outputs[0][0]; const n=oc?oc.length:128;
        const sum=new Float32Array(n);
        for(let i=0;i<n;i++){ const v=(a[i]||0)+(b[i]||0); sum[i]=v; if(oc) oc[i]=v; }
        this.port.postMessage(sum); return true; }`,
    )
    const node = new PlecoAudioWorkletNode(ctx, 'overdub', { numberOfInputs: 2 })
    const chunks = []
    node.port.onmessage = (e) => chunks.push(e.data)
    fb.connect(node, 0, 0) // loop*feedback -> input 0
    live.connect(node, 0, 1) // live -> input 1
    node.connect(ctx.destination)
    ctx.renderSync()
    await flushPort()

    const captured = chunks.flatMap((c) => Array.from(c))
    expect(captured.length).toBe(256)
    // 0.4*0.5 + 0.2 = 0.4 (the overdubbed loop content)
    const expected = Math.fround(Math.fround(0.4) * 0.5 + Math.fround(0.2))
    expect(captured.every((v) => v === expected)).toBe(true)
  })
})

describe('composition 4 — varispeed / half-speed via playbackRate + detune', () => {
  const rampBuffer = (ctx, n) => {
    const b = ctx.createBuffer(1, n, SR)
    b.getChannelData(0).forEach((_, i, a) => (a[i] = i))
    return b
  }

  it('playbackRate 0.5 stretches 2x with exact interpolation (ramp => j*0.5)', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 8, sampleRate: SR })
    const s = ctx.createBufferSource()
    s.buffer = rampBuffer(ctx, 128)
    s.playbackRate.value = 0.5
    s.connect(ctx.destination)
    s.start(0)
    const out = Array.from(ctx.renderSync().getChannelData(0))
    expect(out).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
  })

  it('detune +1200 doubles speed (ramp => j*2)', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 8, sampleRate: SR })
    const s = ctx.createBufferSource()
    s.buffer = rampBuffer(ctx, 128)
    s.detune.value = 1200 // 2^(1200/1200) = 2x
    s.connect(ctx.destination)
    s.start(0)
    const out = Array.from(ctx.renderSync().getChannelData(0))
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12, 14])
  })

  it('playbackRate 0.5 x detune +1200 cancel to unity (computedPlaybackRate = rate * 2^(detune/1200))', () => {
    const ctx = new PlecoOfflineAudioContext({ numberOfChannels: 1, length: 8, sampleRate: SR })
    const s = ctx.createBufferSource()
    s.buffer = rampBuffer(ctx, 128)
    s.playbackRate.value = 0.5
    s.detune.value = 1200
    s.connect(ctx.destination)
    s.start(0)
    const out = Array.from(ctx.renderSync().getChannelData(0))
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7]) // original, unresampled
  })
})
