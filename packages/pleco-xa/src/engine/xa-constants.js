/**
 * engine/xa-constants.js — engine-wide constants.
 *
 * The single source of truth for the render quantum. No other engine file may
 * hardcode 128 — every block allocation, mix, blit, and clock advance is stated
 * in these units so the quantum can never drift out of sync across modules.
 */

/** Frames per render block — the Web Audio render-quantum size. */
export const RENDER_QUANTUM = 128
