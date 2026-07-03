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
  list_mela, list_thaat, mela_to_degrees,
  hz_to_svara_c, hz_to_svara_h, midi_to_svara_c, midi_to_svara_h,
  note_to_svara_c, note_to_svara_h, hz_to_fjs, interval_to_fjs,
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

// ── raga catalogs: list_mela / list_thaat / mela_to_degrees ────────────────
const melas = list_mela()
check('list_mela() enumerates all 72 melakarta', Object.keys(melas).length, 72)
check("list_mela()['kanakangi'] == 1 (first mela)", melas.kanakangi, 1)
check("list_mela()['kharaharapriya'] == 22", melas.kharaharapriya, 22)
check('list_thaat() — the 10 Hindustani thaats (librosa order)', list_thaat(),
  ['bilaval', 'khamaj', 'kafi', 'asavari', 'bhairavi', 'kalyan', 'marva', 'poorvi', 'todi', 'bhairav'])
check('mela_to_degrees(22) == [0,2,3,5,7,9,10] (librosa golden)',
  mela_to_degrees(22), [0, 2, 3, 5, 7, 9, 10])
check('mela_to_degrees by name == by number', mela_to_degrees('kharaharapriya'), mela_to_degrees(22))
let melaThrew = false
try { mela_to_degrees(73) } catch { melaThrew = true }
checkTrue('mela_to_degrees(73) throws (valid range is 1..72)', melaThrew)

// ── svara spelling: note/hz/midi → Carnatic (mela-aware) & Hindustani ───────
// Carnatic on exact kharaharapriya (22) scale degrees — matches librosa 0.11.
check('note_to_svara_c(mela 22 scale) == [S,R2,G2,M1,P,D2,N2] (librosa parity)',
  note_to_svara_c(['C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4'], 'C4', 22, true, true, false),
  ['S', 'R2', 'G2', 'M1', 'P', 'D2', 'N2'])
check('note_to_svara_h(major scale) == [S,R,G,M,P,D,N]',
  note_to_svara_h(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'], 'C4'),
  ['S', 'R', 'G', 'M', 'P', 'D', 'N'])
check("hz_to_svara_c([440], Sa=261.63, mela 22) == ['D₂'] (librosa parity)",
  hz_to_svara_c([440], 261.63, 22), ['D₂'])
check("hz_to_svara_h([440], Sa=261.63) == ['D'] (librosa parity)",
  hz_to_svara_h([440], 261.63), ['D'])
check("midi_to_svara_c([69], Sa=60, mela 22) == ['D₂'] (A4 over C4, librosa parity)",
  midi_to_svara_c([69], 60, 22), ['D₂'])
check("midi_to_svara_h([69], Sa=60) == ['D']", midi_to_svara_h([69], 60), ['D'])

// ── FJS (simplified Functional Just System): fifth→G, third→E, octave→C ─────
check("hz_to_fjs(440) == 'A4'", hz_to_fjs(440), 'A4')
check('hz_to_fjs([220,330,440]) == [A3,E4,A4]', hz_to_fjs([220, 330, 440]), ['A3', 'E4', 'A4'])
check('interval_to_fjs([3/2,5/4,2], unison C) == [G,E,C] (P5, M3, octave)',
  interval_to_fjs([3 / 2, 5 / 4, 2], 'C', undefined, false), ['G', 'E', 'C'])

summary('scripts/xa-notation.js — post-repair goldens vs librosa 0.11')
