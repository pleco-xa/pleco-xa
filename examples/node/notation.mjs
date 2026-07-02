/**
 * scripts/xa-notation.js — post-repair notation golden table vs librosa 0.11.
 *
 * Every expected value below is a librosa golden. The four repaired bugs this
 * table gates:
 *   1. mela_to_svara is now SLOT-AWARE (degree 3 is G2 in the Ga slot, not R3;
 *      degree 10 is N2 in the Ni slot, not D3) — mela 22 previously returned
 *      [S,R2,R3,M1,P,D2,D3].
 *   2. key_to_notes uses circle-of-fifths spelling (A:min previously fell
 *      back SILENTLY to a C:maj hand table; unknown keys now throw).
 *   3. THAAT_MAP kafi is [0,2,3,5,7,9,10] (previously duplicated asavari).
 *   4. fifths_to_note tracks the unison's own circle position (B+1 previously
 *      returned 'F' instead of 'F#').
 */
import { notation } from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

const {
  mela_to_svara, key_to_notes, key_to_degrees, thaat_to_degrees, fifths_to_note,
} = notation

// ── mela_to_svara (ASCII rows: librosa unicode=False goldens) ───────────────
check('mela_to_svara(22 kharaharapriya)', mela_to_svara(22, true, false),
  ['S', 'R2', 'G2', 'M1', 'P', 'D2', 'N2'])
check('mela_to_svara(1 kanakangi)', mela_to_svara(1, true, false),
  ['S', 'R1', 'G1', 'M1', 'P', 'D1', 'N1'])
check('mela_to_svara(65 mechakalyani)', mela_to_svara(65, true, false),
  ['S', 'R2', 'G3', 'M2', 'P', 'D2', 'N3'])
check('mela_to_svara(22) unicode subscripts (librosa default)',
  mela_to_svara(22), ['S', 'R₂', 'G₂', 'M₁', 'P', 'D₂', 'N₂'])
check('mela_to_svara(22) full names', mela_to_svara(22, false, false),
  ['Sa', 'Ri2', 'Ga2', 'Ma1', 'Pa', 'Dha2', 'Ni2'])

// ── key_to_notes (full 12-name spellings, pitch-class indexed) ──────────────
check("key_to_notes('Eb:maj')", key_to_notes('Eb:maj', false),
  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'])
check("key_to_notes('A:min') — relative of C:maj, all sharps", key_to_notes('A:min', false),
  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
check("key_to_notes('F#:maj') — six sharps spell E#", key_to_notes('F#:maj', false),
  ['C', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B'])
check("key_to_notes('Gb:maj') — six flats spell Cb", key_to_notes('Gb:maj', false),
  ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb'])
let threw = false
try { key_to_notes('H:maj') } catch { threw = true }
checkTrue('key_to_notes throws on unknown key (silent C:maj fallback repaired)', threw)
check("key_to_degrees('C:maj') sanity", key_to_degrees('C:maj'), [0, 2, 4, 5, 7, 9, 11])

// ── thaat_to_degrees: all 10 thaats vs librosa THAAT_MAP ────────────────────
const LIBROSA_THAAT = {
  bilaval: [0, 2, 4, 5, 7, 9, 11],
  khamaj: [0, 2, 4, 5, 7, 9, 10],
  kafi: [0, 2, 3, 5, 7, 9, 10], // the repaired row (was duplicating asavari)
  asavari: [0, 2, 3, 5, 7, 8, 10],
  bhairavi: [0, 1, 3, 5, 7, 8, 10],
  kalyan: [0, 2, 4, 6, 7, 9, 11],
  marva: [0, 1, 4, 6, 7, 9, 11],
  poorvi: [0, 1, 4, 6, 7, 8, 11],
  todi: [0, 1, 3, 6, 7, 8, 11],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
}
for (const [thaat, degrees] of Object.entries(LIBROSA_THAAT)) {
  check(`thaat_to_degrees('${thaat}')`, thaat_to_degrees(thaat), degrees)
}

// ── fifths_to_note: full circle walk from C + the boundary regression ───────
check('fifths_to_note C +1..+12', Array.from({ length: 12 }, (_, i) => fifths_to_note('C', i + 1, false)),
  ['G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#'])
check("fifths_to_note('B', 1) — boundary regression (was 'F')",
  fifths_to_note('B', 1, false), 'F#')
check("fifths_to_note('G', -3) — librosa docstring golden",
  fifths_to_note('G', -3, false), 'Bb')
check("fifths_to_note('C', -1)", fifths_to_note('C', -1, false), 'F')
check("fifths_to_note('F#', 1) — accidental-bearing unison",
  fifths_to_note('F#', 1, false), 'C#')

summary('scripts/xa-notation.js — post-repair goldens vs librosa 0.11')
