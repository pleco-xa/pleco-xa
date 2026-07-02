/** Tiny proof badges for web examples. Usage: badge('peak bin = 440Hz', ok) */
export function badge(label, pass, detail = '') {
  const el = document.createElement('div')
  el.style.cssText = `font:14px monospace;padding:6px 10px;margin:4px;border-radius:6px;display:inline-block;color:#fff;background:${pass ? '#2e7d32' : '#c62828'}`
  el.textContent = `${pass ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`
  document.getElementById('badges')?.appendChild(el) || document.body.appendChild(el)
  return pass
}
export function drawWave(canvas, data, color = '#4fc3f7') {
  const ctx = canvas.getContext('2d'); const { width: w, height: h } = canvas
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = color; ctx.beginPath()
  const step = Math.max(1, Math.floor(data.length / w))
  for (let x = 0; x < w; x++) { const v = data[x * step] || 0; const y = h / 2 - v * h * 0.45; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
  ctx.stroke()
}
export function drawSpectrogram(canvas, mag2d /* [freq][time] numbers */) {
  const ctx = canvas.getContext('2d'); const { width: w, height: h } = canvas
  const nF = mag2d.length, nT = mag2d[0]?.length || 0
  let max = 1e-12; for (const row of mag2d) for (const v of row) if (v > max) max = v
  const img = ctx.createImageData(w, h)
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const f = Math.floor((1 - y / h) * (nF - 1)), t = Math.floor((x / w) * (nT - 1))
    const db = 20 * Math.log10((mag2d[f][t] || 1e-12) / max)
    const v = Math.max(0, Math.min(1, (db + 80) / 80)) * 255
    const i = (y * w + x) * 4; img.data[i] = v; img.data[i + 1] = v * 0.8; img.data[i + 2] = v * 0.5 + 40; img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}
