#!/usr/bin/env node
/**
 * Zero-dependency static server for the proof-of-work demos.
 *
 *   npm run demos            → serves the repo root at http://localhost:5757
 *   node tools/serve-demos.mjs [port]
 *
 * The web demos import the built library via `../../packages/pleco-xa/dist/
 * pleco-xa.js`, so the server MUST be rooted at the repo root (this file's
 * parent). Browsers block ES-module imports over file://, which is why opening
 * the .html files directly shows a blank page — serve them over http instead.
 *
 * `/` renders a live index of every examples/web/*.html demo (title + blurb
 * scraped on the fly, so it never goes stale).
 */
import { createServer } from 'node:http'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PORT = Number(process.argv[2]) || 5757

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aif': 'audio/aiff',
  '.ogg': 'audio/ogg',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function buildIndex() {
  const dir = join(ROOT, 'examples/web')
  let files = []
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.html')).sort()
  } catch {
    /* no web demos */
  }
  const rows = []
  for (const f of files) {
    let title = f
    let blurb = ''
    try {
      const html = await readFile(join(dir, f), 'utf8')
      title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] || f).trim()
      // first paragraph-ish descriptive text
      blurb = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 160)
    } catch {
      /* skip unreadable */
    }
    rows.push(
      `<li><a href="/examples/web/${encodeURIComponent(f)}"><span class="t">${esc(title)}</span>` +
        `<span class="f">${esc(f)}</span></a>${blurb ? `<span class="b">${esc(blurb)}</span>` : ''}</li>`,
    )
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>pleco-xa demos</title>
<style>
 body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;background:#0f1115;color:#e6e6e6}
 h1{font-size:1.6rem;margin:0 0 .25rem} .sub{color:#9aa4b2;margin:0 0 1.5rem}
 ul{list-style:none;padding:0;display:grid;gap:.5rem}
 li a{display:flex;justify-content:space-between;gap:1rem;padding:.6rem .8rem;background:#1a1e26;border-radius:8px;text-decoration:none;color:#e6e6e6}
 li a:hover{background:#232936}
 .t{font-weight:600} .f{color:#6b7688;font:12px monospace} .b{display:block;color:#9aa4b2;font-size:13px;padding:.1rem .8rem .3rem}
 code{background:#1a1e26;padding:.1rem .3rem;border-radius:4px;font-size:13px}
</style></head><body>
<h1>🎛️ pleco-xa proof-of-work demos</h1>
<p class="sub">${rows.length} web demos. Node demos: <code>node examples/node/&lt;name&gt;.mjs</code> (each exits 0 on pass).</p>
<ul>${rows.join('')}</ul>
</body></html>`
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const server = createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0])
    if (url === '/' || url === '/index.html') {
      const body = await buildIndex()
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(body)
    }
    // Resolve safely under ROOT (block path traversal).
    const path = normalize(join(ROOT, url))
    if (!path.startsWith(ROOT)) {
      res.writeHead(403)
      return res.end('forbidden')
    }
    const info = await stat(path).catch(() => null)
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      return res.end(`404: ${url}`)
    }
    const data = await readFile(path)
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' })
    res.end(data)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end(`500: ${err.message}`)
  }
})

server.listen(PORT, () => {
  console.log(`\n  pleco-xa demos → http://localhost:${PORT}\n`)
  console.log(`  (rooted at repo root so demos resolve the dist bundle; Ctrl-C to stop)\n`)
})
