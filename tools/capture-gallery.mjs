#!/usr/bin/env node
// Capture gallery thumbnails for every demo page.
//
// Zero dependencies: drives headless Chrome over its --remote-debugging-pipe
// (CDP), serves the built docs site with node's http, and waits for each
// demo's own PASS/FAIL badges (#badges) — the demos' built-in "I'm done"
// signal — before screenshotting.
//
// Usage:
//   npm run build:docs                 # demos must exist in apps/docs/dist
//   node tools/capture-gallery.mjs     # writes apps/docs/public/gallery-thumbs/*.png
//   node tools/capture-gallery.mjs loop-detect xa-fft   # subset by basename
//
// Output: 1280x800 captures downscaled to 640px wide (macOS `sips`; other
// platforms keep full size). Re-run any time — captures are deterministic
// because the demos compute from committed fixtures.

import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, extname, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = join(repo, 'apps/docs/dist')
const OUT = join(repo, 'apps/docs/public/gallery-thumbs')
const CHROME = process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const WIDTH = 1280, HEIGHT = 800, THUMB_W = 640
const READY_TIMEOUT_MS = 30000  // max wait for a demo's badges
const SETTLE_MS = 1500          // extra time for late canvases after first badge

if (!existsSync(join(DIST, 'demos'))) {
  console.error('capture-gallery: apps/docs/dist/demos missing — run `npm run build:docs` first')
  process.exit(1)
}
if (!existsSync(CHROME)) {
  console.error(`capture-gallery: Chrome not found at ${CHROME} (set CHROME_BIN)`)
  process.exit(1)
}
mkdirSync(OUT, { recursive: true })

// ---------- tiny static server over the built site ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.aif': 'audio/aiff', '.m4a': 'audio/mp4', '.map': 'application/json' }
const server = createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p.endsWith('/')) p += 'index.html'
    const file = join(DIST, p)
    if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  } catch { res.writeHead(500); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port

// ---------- minimal CDP client over --remote-debugging-pipe ----------
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${join(tmpdir(), 'plx-capture-profile')}`,
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--window-size=${WIDTH},${HEIGHT}`, '--force-device-scale-factor=1',
], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })

const toChrome = chrome.stdio[3], fromChrome = chrome.stdio[4]
let msgId = 0, buf = Buffer.alloc(0)
const pending = new Map()
fromChrome.on('data', chunk => {
  buf = Buffer.concat([buf, chunk])
  let idx
  while ((idx = buf.indexOf(0)) !== -1) {
    const msg = JSON.parse(buf.subarray(0, idx).toString('utf8'))
    buf = buf.subarray(idx + 1)
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result) }
  }
})
function cdp(method, params = {}, sessionId) {
  const id = ++msgId
  return new Promise((res, rej) => {
    pending.set(id, { res, rej })
    toChrome.write(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }) + '\0')
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)) } }, 60000)
  })
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function capture(name) {
  const url = `http://127.0.0.1:${port}/demos/${name}.html`
  const { targetId } = await cdp('Target.createTarget', { url })
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true })
  try {
    await cdp('Runtime.enable', {}, sessionId)
    // Wait for the demo's own completion signal: at least one PASS/FAIL badge,
    // or (fallback) a painted canvas once half the timeout has passed.
    const t0 = Date.now()
    let ready = false, badges = 0, canvases = 0
    while (Date.now() - t0 < READY_TIMEOUT_MS) {
      const { result } = await cdp('Runtime.evaluate', {
        expression: `JSON.stringify({b: document.querySelectorAll('#badges div').length, c: document.querySelectorAll('canvas').length, done: document.readyState})`,
        returnByValue: true,
      }, sessionId).catch(() => ({ result: { value: '{"b":0,"c":0}' } }))
      ;({ b: badges, c: canvases } = JSON.parse(result.value ?? '{"b":0,"c":0}'))
      if (badges > 0) { ready = true; break }
      if (canvases > 0 && Date.now() - t0 > READY_TIMEOUT_MS / 2) { ready = true; break }
      await sleep(400)
    }
    await sleep(SETTLE_MS)
    // Bias thumbnails toward the visual output: bring the first meaningful
    // canvas into view (cards carry the title, so losing the H1 is fine).
    await cdp('Runtime.evaluate', {
      expression: `(() => { const c = [...document.querySelectorAll('canvas')].find(c => c.offsetHeight > 40); if (c) c.scrollIntoView({ block: 'center' }) })()`,
    }, sessionId).catch(() => {})
    await sleep(250)
    const { data } = await cdp('Page.captureScreenshot', { format: 'png' }, sessionId)
    const out = join(OUT, `${name}.png`)
    writeFileSync(out, Buffer.from(data, 'base64'))
    if (process.platform === 'darwin') {
      try { execFileSync('sips', ['-Z', String(THUMB_W), out], { stdio: 'ignore' }) } catch { /* keep full size */ }
    }
    const kb = Math.round(statSync(out).size / 1024)
    console.log(`${ready ? 'ok  ' : 'SOFT'} ${name}.png  ${kb}KB  badges=${badges} canvases=${canvases}  ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    return { name, ready, badges, canvases }
  } finally {
    await cdp('Target.closeTarget', { targetId }).catch(() => {})
  }
}

// ---------- run ----------
const only = process.argv.slice(2)
const demos = readdirSync(join(DIST, 'demos')).filter(f => f.endsWith('.html'))
  .map(f => f.replace(/\.html$/, ''))
  .filter(n => !only.length || only.includes(n))

console.log(`capture-gallery: ${demos.length} demo(s) → ${OUT}`)
const results = []
for (const name of demos) {
  try { results.push(await capture(name)) }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); results.push({ name, ready: false, error: e.message }) }
}

chrome.kill(); server.close()
const soft = results.filter(r => !r.ready)
console.log(`\ndone: ${results.length - soft.length}/${results.length} ready-signal captures` +
  (soft.length ? `; soft/failed: ${soft.map(s => s.name).join(', ')}` : ''))
process.exit(soft.some(s => s.error) ? 1 : 0)
