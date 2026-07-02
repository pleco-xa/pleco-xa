import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'

vi.mock('../src/core/index.js', () => ({
  signatureDemo: vi.fn()
}))

import { signatureDemo } from '../src/core/index.js'

let dom
let btn
let applyLoop
let audioBuffer

function setupDom() {
  dom = new JSDOM(`<button id="sigDemoBtn">Demo</button>`)
  global.window = dom.window
  global.document = dom.window.document

  applyLoop = vi.fn()
  audioBuffer = {}

  async function runDemo() {
    const steps = signatureDemo(audioBuffer)
    for (const { fn, op } of steps) {
      const { buffer: newBuf, loop } = fn()
      applyLoop(newBuf, loop, op)

      await new Promise(r => setTimeout(r, 400))
    }
  }

  const el = document.getElementById('sigDemoBtn')
  el.addEventListener('click', () => {
    runDemo()
  })

  btn = el
}

describe('SignatureDemoButton', () => {
  beforeEach(() => {
    setupDom()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    dom.window.close()
  })

  it('applies demo steps', async () => {
    const steps = [
      { op: 'op1', fn: vi.fn(() => ({ buffer: {}, loop: {} })) },
      { op: 'op2', fn: vi.fn(() => ({ buffer: {}, loop: {} })) },
      { op: 'op3', fn: vi.fn(() => ({ buffer: {}, loop: {} })) }
    ]
    signatureDemo.mockReturnValue(steps)

    btn.click()
    await vi.runAllTimersAsync()

    expect(applyLoop).toHaveBeenCalledTimes(3)
  })
})
