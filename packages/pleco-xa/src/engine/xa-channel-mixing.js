/**
 * engine/xa-channel-mixing.js — accumulate summation into a destination block.
 *
 * Slice-1 scope: same-channel-count summation (the linear looper spine is mono)
 * plus mono up-mix (replicate into every destination channel) and a discrete
 * overlap fallback for mismatched multi-channel. The full W3C speaker up/down-mix
 * coefficient tables (quad, 5.1, the 0.5·(L+R) stereo→mono law) are parity-later,
 * added with the routing/mixer beat that first exercises them.
 */

/** Sum `src` into `dest` in place (dest[i] += src[i]), channel-matched. Returns `dest`. */
export function mixInto(dest, src) {
  const dc = dest.numberOfChannels
  const sc = src.numberOfChannels
  const n = Math.min(dest.length, src.length)

  if (dc === sc) {
    for (let c = 0; c < dc; c++) {
      const d = dest.getChannelData(c)
      const s = src.getChannelData(c)
      for (let i = 0; i < n; i++) d[i] += s[i]
    }
    return dest
  }

  if (sc === 1) {
    const s = src.getChannelData(0)
    for (let c = 0; c < dc; c++) {
      const d = dest.getChannelData(c)
      for (let i = 0; i < n; i++) d[i] += s[i]
    }
    return dest
  }

  const overlap = Math.min(dc, sc)
  for (let c = 0; c < overlap; c++) {
    const d = dest.getChannelData(c)
    const s = src.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] += s[i]
  }
  return dest
}
