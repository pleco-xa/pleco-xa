// Extended audio operations — SHIM (deduped 2026-07-02, tier-2 proof-of-work).
//
// This file was a near-verbatim duplicate of lib/effects/xa-fx.js
// (stutter/phase/fractal/applyQuantumOp identical). The package index exports
// applyQuantumOp from xa-fx while quantum-sequencer imported THIS copy, so the
// two could silently diverge. lib/effects/xa-fx.js is now the single canonical
// home; this module re-exports it for existing importers.
export { stutter, phase, fractal, applyQuantumOp } from '../lib/effects/xa-fx.js';
