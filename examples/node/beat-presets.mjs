/**
 * Proof: scripts/beat-presets.js — preset data contract.
 * All 6 presets are 8-step bars; every op is in the quantum-sequencer vocabulary
 * {silence, half, move, reverse, stutter, double}; randomPreset() always returns
 * a member (by identity) of allPresets.
 */
import { allPresets, randomPreset } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const VOCAB = new Set(['silence', 'half', 'move', 'reverse', 'stutter', 'double'])

check('allPresets.length === 6', allPresets.length, 6)

let all8Steps = true
let outOfVocab = []
for (const preset of allPresets) {
  if (preset.length !== 8) all8Steps = false
  for (const op of preset) if (!VOCAB.has(op)) outOfVocab.push(op)
}
checkTrue('every preset has exactly 8 steps', all8Steps, allPresets.map((p) => p.length).join(','))
checkTrue('zero out-of-vocabulary ops', outOfVocab.length === 0, outOfVocab.length ? outOfVocab.join(',') : 'all ops in vocab')

let allMembers = true
for (let i = 0; i < 100; i++) {
  if (!allPresets.includes(randomPreset())) allMembers = false
}
checkTrue('100x randomPreset() each returns a member of allPresets', allMembers)

summary('beat-presets: data contract')
