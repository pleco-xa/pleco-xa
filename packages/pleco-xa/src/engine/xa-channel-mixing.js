/**
 * engine/xa-channel-mixing.js — W3C channel up-mix/down-mix + computedNumberOfChannels.
 *
 * Implements the normative "Channel Up-Mixing and Down-Mixing" rules of the
 * Web Audio API spec (§ channel-up-mixing-and-down-mixing): the 'speakers'
 * coefficient equations for the mono/stereo/quad/5.1 layouts (§ UpMix-sub
 * up-mix tables, § down-mix down-mix tables) and the 'discrete'
 * fill-then-zero / fill-then-drop rules, plus the computedNumberOfChannels
 * table for ChannelCountMode ('max' | 'clamped-max' | 'explicit').
 *
 * Mixing always ACCUMULATES (dest[i] += …): an AudioNode input sums every
 * connection after each is up/down-mixed, so the destination block is the
 * running sum. Channel-count pairs outside the speaker layouts (3, 5, 7, …)
 * revert to 'discrete', per spec. Operates on AudioBuffer-shaped objects
 * ({ numberOfChannels, length, getChannelData(c) }) — no buffer imports.
 *
 * Channel orders (spec § ChannelOrdering):
 *   stereo: L=0 R=1 · quad: L=0 R=1 SL=2 SR=3 · 5.1: L=0 R=1 C=2 LFE=3 SL=4 SR=5
 */

/** sqrt(1/2) rounded to float32 — the normative down-mix coefficient. */
const SQRT1_2 = Math.fround(Math.SQRT1_2)

/**
 * The spec's basic speaker layouts (mono/stereo/quad/5.1). The SPEAKER_MIX
 * table below is keyed sc*10+dc, which is only collision-free when BOTH counts
 * are gated through this set first (e.g. 1→14 would otherwise alias the 2→4
 * key 24); anything outside the set reverts to 'discrete', per spec.
 */
const SPEAKER_LAYOUTS = new Set([1, 2, 4, 6])

/** Straight per-channel summation (channel counts already match). */
function sumSame(dest, src, n) {
  for (let c = 0; c < dest.numberOfChannels; c++) {
    const d = dest.getChannelData(c)
    const s = src.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] += s[i]
  }
}

/**
 * 'discrete' mixing: up-mix fills channels until the source runs out and
 * leaves the rest untouched (i.e. contributes silence); down-mix fills as
 * many channels as possible and drops the rest.
 */
function sumDiscrete(dest, src, n) {
  const overlap = Math.min(dest.numberOfChannels, src.numberOfChannels)
  for (let c = 0; c < overlap; c++) {
    const d = dest.getChannelData(c)
    const s = src.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] += s[i]
  }
}

/**
 * 'speakers' coefficient equations, keyed src.numberOfChannels * 10 +
 * dest.numberOfChannels. Each accumulates into dest per the spec equations.
 */
const SPEAKER_MIX = {
  // ---- up-mix (spec § UpMix-sub) ----
  12(dest, src, n) {
    // mono -> stereo: output.L = input; output.R = input
    const s = src.getChannelData(0)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    for (let i = 0; i < n; i++) {
      dL[i] += s[i]
      dR[i] += s[i]
    }
  },
  14(dest, src, n) {
    // mono -> quad: output.L = input; output.R = input; output.SL = output.SR = 0
    const s = src.getChannelData(0)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    for (let i = 0; i < n; i++) {
      dL[i] += s[i]
      dR[i] += s[i]
    }
  },
  16(dest, src, n) {
    // mono -> 5.1: output.C = input (center only); all other channels = 0
    const s = src.getChannelData(0)
    const dC = dest.getChannelData(2)
    for (let i = 0; i < n; i++) dC[i] += s[i]
  },
  24(dest, src, n) {
    // stereo -> quad: L/R pass through; SL = SR = 0
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    for (let i = 0; i < n; i++) {
      dL[i] += sL[i]
      dR[i] += sR[i]
    }
  },
  26(dest, src, n) {
    // stereo -> 5.1: L/R pass through; C = LFE = SL = SR = 0
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    for (let i = 0; i < n; i++) {
      dL[i] += sL[i]
      dR[i] += sR[i]
    }
  },
  46(dest, src, n) {
    // quad -> 5.1: L/R/SL/SR pass through; C = LFE = 0
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const sSL = src.getChannelData(2)
    const sSR = src.getChannelData(3)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    const dSL = dest.getChannelData(4)
    const dSR = dest.getChannelData(5)
    for (let i = 0; i < n; i++) {
      dL[i] += sL[i]
      dR[i] += sR[i]
      dSL[i] += sSL[i]
      dSR[i] += sSR[i]
    }
  },
  // ---- down-mix (spec § down-mix) ----
  21(dest, src, n) {
    // stereo -> mono: output = 0.5 * (input.L + input.R)
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const d = dest.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] += 0.5 * (sL[i] + sR[i])
  },
  41(dest, src, n) {
    // quad -> mono: output = 0.25 * (input.L + input.R + input.SL + input.SR)
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const sSL = src.getChannelData(2)
    const sSR = src.getChannelData(3)
    const d = dest.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] += 0.25 * (sL[i] + sR[i] + sSL[i] + sSR[i])
  },
  61(dest, src, n) {
    // 5.1 -> mono: output = sqrt(1/2) * (L + R) + C + 0.5 * (SL + SR) — LFE dropped
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const sC = src.getChannelData(2)
    const sSL = src.getChannelData(4)
    const sSR = src.getChannelData(5)
    const d = dest.getChannelData(0)
    for (let i = 0; i < n; i++) {
      d[i] += SQRT1_2 * (sL[i] + sR[i]) + sC[i] + 0.5 * (sSL[i] + sSR[i])
    }
  },
  42(dest, src, n) {
    // quad -> stereo: output.L = 0.5 * (L + SL); output.R = 0.5 * (R + SR)
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const sSL = src.getChannelData(2)
    const sSR = src.getChannelData(3)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    for (let i = 0; i < n; i++) {
      dL[i] += 0.5 * (sL[i] + sSL[i])
      dR[i] += 0.5 * (sR[i] + sSR[i])
    }
  },
  62(dest, src, n) {
    // 5.1 -> stereo: output.L = L + sqrt(1/2) * (C + SL); output.R = R + sqrt(1/2) * (C + SR)
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const sC = src.getChannelData(2)
    const sSL = src.getChannelData(4)
    const sSR = src.getChannelData(5)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    for (let i = 0; i < n; i++) {
      dL[i] += sL[i] + SQRT1_2 * (sC[i] + sSL[i])
      dR[i] += sR[i] + SQRT1_2 * (sC[i] + sSR[i])
    }
  },
  64(dest, src, n) {
    // 5.1 -> quad: output.L = L + sqrt(1/2) * C; output.R = R + sqrt(1/2) * C; SL/SR pass through
    const sL = src.getChannelData(0)
    const sR = src.getChannelData(1)
    const sC = src.getChannelData(2)
    const sSL = src.getChannelData(4)
    const sSR = src.getChannelData(5)
    const dL = dest.getChannelData(0)
    const dR = dest.getChannelData(1)
    const dSL = dest.getChannelData(2)
    const dSR = dest.getChannelData(3)
    for (let i = 0; i < n; i++) {
      dL[i] += sL[i] + SQRT1_2 * sC[i]
      dR[i] += sR[i] + SQRT1_2 * sC[i]
      dSL[i] += sSL[i]
      dSR[i] += sSR[i]
    }
  },
}

/**
 * Up/down-mix `src` into `dest`, ACCUMULATING (dest[i] += …). Returns `dest`.
 *
 * `interpretation` is a ChannelInterpretation: 'speakers' (default) applies
 * the spec coefficient tables above for mono/stereo/quad/5.1 pairs, reverting
 * to 'discrete' for any other channel count; 'discrete' fills/drops channels
 * in order. Same-channel-count is always a straight per-channel sum.
 * Frames mixed: min(dest.length, src.length).
 */
export function mixInto(dest, src, interpretation = 'speakers') {
  if (interpretation !== 'speakers' && interpretation !== 'discrete') {
    throw new TypeError(
      `mixInto: interpretation must be 'speakers' or 'discrete', got ${interpretation}`,
    )
  }
  const dc = dest.numberOfChannels
  const sc = src.numberOfChannels
  const n = Math.min(dest.length, src.length)

  if (dc === sc) {
    sumSame(dest, src, n)
    return dest
  }
  if (interpretation === 'speakers' && SPEAKER_LAYOUTS.has(sc) && SPEAKER_LAYOUTS.has(dc)) {
    SPEAKER_MIX[sc * 10 + dc](dest, src, n)
    return dest
  }
  sumDiscrete(dest, src, n)
  return dest
}

/**
 * computedNumberOfChannels for an AudioNode input (spec § ChannelCountMode):
 *   'max'         — the maximum channel count across all connections
 *                   (`maxSourceChannels`); `channelCount` is ignored.
 *   'clamped-max' — as 'max', then clamped to a maximum of `channelCount`.
 *   'explicit'    — exactly `channelCount`.
 */
export function computeNumberOfChannels(mode, channelCount, maxSourceChannels) {
  if (!Number.isInteger(channelCount) || channelCount <= 0) {
    throw new RangeError(
      `computeNumberOfChannels: channelCount must be a positive integer, got ${channelCount}`,
    )
  }
  if (!Number.isInteger(maxSourceChannels) || maxSourceChannels <= 0) {
    throw new RangeError(
      `computeNumberOfChannels: maxSourceChannels must be a positive integer, got ${maxSourceChannels}`,
    )
  }
  switch (mode) {
    case 'max':
      return maxSourceChannels
    case 'clamped-max':
      return Math.min(channelCount, maxSourceChannels)
    case 'explicit':
      return channelCount
    default:
      throw new TypeError(
        `computeNumberOfChannels: mode must be 'max' | 'clamped-max' | 'explicit', got ${mode}`,
      )
  }
}
