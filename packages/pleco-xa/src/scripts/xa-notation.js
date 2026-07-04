/**
 * Music notation, scale theory, and key/raga functions
 * Notation utilities for JavaScript
 */

import { midi_to_hz, note_to_hz, hz_to_note, note_to_midi, midi_to_note } from './xa-convert.js';

/**
 * Melakarta raga database (Carnatic classical music)
 * Maps raga names to their melakarta number (1-72)
 */
const MELA_MAP = {
  // Suddha Madhyama (1-36)
  'kanakangi': 1, 'ratnangi': 2, 'ganamurti': 3, 'vanaspati': 4,
  'manavati': 5, 'tanarupi': 6, 'senavati': 7, 'hanumatodi': 8,
  'dhenuka': 9, 'natakapriya': 10, 'kokilapriya': 11, 'rupavati': 12,
  'gayakapriya': 13, 'vakulabharanam': 14, 'mayamalavagowla': 15, 'chakravakam': 16,
  'suryakantam': 17, 'hatakambari': 18, 'jhankaradhwani': 19, 'natabhairavi': 20,
  'keeravani': 21, 'kharaharapriya': 22, 'gourimanohari': 23, 'varunapriya': 24,
  'mararanjani': 25, 'charukesi': 26, 'sarasangi': 27, 'harikambhoji': 28,
  'dheerasankarabharanam': 29, 'naganandini': 30, 'yagapriya': 31, 'ragavardhini': 32,
  'gangeyabhushani': 33, 'vagadheeswari': 34, 'sulini': 35, 'chalanata': 36,

  // Prati Madhyama (37-72)
  'salagam': 37, 'jalarnavam': 38, 'jhalavarali': 39, 'navaneetam': 40,
  'pavani': 41, 'raghupriya': 42, 'gavambodhi': 43, 'bhavapriya': 44,
  'shubhapantuvarali': 45, 'shadvidamargini': 46, 'suvarnangi': 47, 'divyamani': 48,
  'dhavalambari': 49, 'namanarayani': 50, 'kamavardhini': 51, 'ramapriya': 52,
  'gamanashrama': 53, 'vishwambhari': 54, 'shamalangi': 55, 'shanmukhapriya': 56,
  'simhendramadhyamam': 57, 'hemavati': 58, 'dharmavati': 59, 'neetimati': 60,
  'kantamani': 61, 'rishabhapriya': 62, 'latangi': 63, 'vachaspati': 64,
  'mechakalyani': 65, 'chitrambari': 66, 'sucharitra': 67, 'jyotiswarupini': 68,
  'dhatuvardhini': 69, 'nasikabushani': 70, 'kosalam': 71, 'rasikapriya': 72
};

/**
 * Hindustani thaat database
 */
const THAAT_MAP = {
  'bilaval': [0, 2, 4, 5, 7, 9, 11],
  'khamaj': [0, 2, 4, 5, 7, 9, 10],
  'kafi': [0, 2, 3, 5, 7, 9, 10],
  'asavari': [0, 2, 3, 5, 7, 8, 10],
  'bhairavi': [0, 1, 3, 5, 7, 8, 10],
  'kalyan': [0, 2, 4, 6, 7, 9, 11],
  'marva': [0, 1, 4, 6, 7, 9, 11],
  'poorvi': [0, 1, 4, 6, 7, 8, 11],
  'todi': [0, 1, 3, 6, 7, 8, 11],
  'bhairav': [0, 1, 4, 5, 7, 8, 11]
};

/**
 * Western key signature database
 * Maps key names to their chromatic degree patterns
 */
const KEY_DEGREES = {
  // Major keys
  'C:maj': [0, 2, 4, 5, 7, 9, 11],
  'C#:maj': [1, 3, 5, 6, 8, 10, 0],
  'Db:maj': [1, 3, 5, 6, 8, 10, 0],
  'D:maj': [2, 4, 6, 7, 9, 11, 1],
  'D#:maj': [3, 5, 7, 8, 10, 0, 2],
  'Eb:maj': [3, 5, 7, 8, 10, 0, 2],
  'E:maj': [4, 6, 8, 9, 11, 1, 3],
  'F:maj': [5, 7, 9, 10, 0, 2, 4],
  'F#:maj': [6, 8, 10, 11, 1, 3, 5],
  'Gb:maj': [6, 8, 10, 11, 1, 3, 5],
  'G:maj': [7, 9, 11, 0, 2, 4, 6],
  'G#:maj': [8, 10, 0, 1, 3, 5, 7],
  'Ab:maj': [8, 10, 0, 1, 3, 5, 7],
  'A:maj': [9, 11, 1, 2, 4, 6, 8],
  'A#:maj': [10, 0, 2, 3, 5, 7, 9],
  'Bb:maj': [10, 0, 2, 3, 5, 7, 9],
  'B:maj': [11, 1, 3, 4, 6, 8, 10],
  'Cb:maj': [11, 1, 3, 4, 6, 8, 10],

  // Minor keys
  'C:min': [0, 2, 3, 5, 7, 8, 10],
  'C#:min': [1, 3, 4, 6, 8, 9, 11],
  'D:min': [2, 4, 5, 7, 9, 10, 0],
  'D#:min': [3, 5, 6, 8, 10, 11, 1],
  'Eb:min': [3, 5, 6, 8, 10, 11, 1],
  'E:min': [4, 6, 7, 9, 11, 0, 2],
  'F:min': [5, 7, 8, 10, 0, 1, 3],
  'F#:min': [6, 8, 9, 11, 1, 2, 4],
  'G:min': [7, 9, 10, 0, 2, 3, 5],
  'G#:min': [8, 10, 11, 1, 3, 4, 6],
  'Ab:min': [8, 10, 11, 1, 3, 4, 6],
  'A:min': [9, 11, 0, 2, 4, 5, 7],
  'A#:min': [10, 0, 1, 3, 5, 6, 8],
  'Bb:min': [10, 0, 1, 3, 5, 6, 8],
  'B:min': [11, 1, 2, 4, 6, 7, 9]
};

/**
 * Base note-name grids for key spelling (index == chromatic pitch class,
 * 0 == C). Corrections extend these past 6 sharps / 6 flats for full
 * enharmonic spelling.
 */
const NOTES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NOTES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
// Applied in order once the signature exceeds 6 sharps (e.g. F♯:maj is fine,
// C♯:maj respells 5→E♯ and 0→B♯, G♯:maj adds 7→F𝄪, ...)
const SHARP_CORRECTIONS = [[5, 'E♯'], [0, 'B♯'], [7, 'F𝄪'], [2, 'C𝄪'], [9, 'G𝄪'], [4, 'D𝄪'], [11, 'A𝄪']];
// Applied in order once the signature exceeds 6 flats
const FLAT_CORRECTIONS = [[11, 'C♭'], [4, 'F♭'], [9, 'B𝄫'], [2, 'E𝄫'], [7, 'A𝄫'], [0, 'D𝄫']];

const PITCH_MAP = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };

/**
 * Construct the diatonic scale degrees for a given key
 * @param {string} key - Key signature (e.g., 'C:maj', 'A:min')
 * @returns {Array<number>} Array of chromatic degree indices (0-11)
 *
 * @example
 * key_to_degrees('C:maj')  // [0, 2, 4, 5, 7, 9, 11]
 * key_to_degrees('A:min')  // [9, 11, 0, 2, 4, 5, 7]
 */
export function key_to_degrees(key) {
  if (typeof key !== 'string') {
    throw new TypeError('key must be a string');
  }

  const degrees = KEY_DEGREES[key];
  if (!degrees) {
    throw new Error(`Unknown key: ${key}. Use format like 'C:maj' or 'A:min'`);
  }

  return [...degrees];
}

/**
 * List all 12 note names in the chromatic scale, as spelled according to a
 * given key. The returned
 * array is indexed by pitch class (0 == C), NOT rotated to the tonic, and the
 * sharp/flat choice follows the key's position on the circle of fifths
 * (explicit accidental in the tonic forces the side). Unknown keys THROW \u2014
 * the legacy silent C:maj fallback is repaired.
 *
 * @param {string} key - Key signature (e.g., 'C:maj', 'Eb:min', 'F\u266F:maj')
 * @param {boolean} unicode - If true, use unicode symbols (\u266F/\uD834\uDD2A/\u266D/\uD834\uDD2B)
 * @returns {Array<string>} List of 12 note names indexed by pitch class
 *
 * @example
 * key_to_notes('C:maj', false)   // ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
 * key_to_notes('Eb:maj', false)  // ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']
 * key_to_notes('A:min', false)   // same spelling as C:maj (relative keys share a signature)
 */
export function key_to_notes(key, unicode = true) {
  if (typeof key !== 'string') {
    throw new TypeError('key must be a string');
  }

  const match = key.match(/^([A-Ga-g])([#\u266Fb!\u266D]?):(maj|min)(or)?$/);
  if (!match) {
    throw new Error(`Improper key format: ${key}. Use format like 'C:maj', 'Eb:min'`);
  }

  const tonic = match[1].toUpperCase();
  const acc = match[2];
  const offset = (acc === '#' || acc === '\u266F') ? 1 : (acc === '') ? 0 : -1;
  const major = match[3] === 'maj';

  // Steps clockwise on the circle of fifths == number of sharps (mod 12)
  const raw = major
    ? (PITCH_MAP[tonic] + offset) * 7
    : (PITCH_MAP[tonic] + offset) * 7 + 9;
  const tonicNumber = ((raw % 12) + 12) % 12;

  // Explicit accidental in the tonic forces the accidental side
  let useSharps;
  if (offset < 0) useSharps = false;
  else if (offset > 0) useSharps = true;
  else useSharps = tonicNumber < 6;

  // Mod-12 correction so B\u266F:maj (12 sharps) is not confused with C:maj (0)
  let nSharps = tonicNumber;
  if (tonicNumber === 0 && tonic === 'B') nSharps = 12;

  let notes;
  if (useSharps) {
    notes = [...NOTES_SHARP];
    for (let n = 0; n <= nSharps - 6; n++) {
      const [index, name] = SHARP_CORRECTIONS[n];
      notes[index] = name;
    }
  } else {
    const nFlats = (12 - tonicNumber) % 12;
    notes = [...NOTES_FLAT];
    for (let n = 0; n <= nFlats - 6; n++) {
      const [index, name] = FLAT_CORRECTIONS[n];
      notes[index] = name;
    }
  }

  if (!unicode) {
    notes = notes.map(note =>
      note.replace('\u266F', '#').replace('\uD834\uDD2A', '##').replace('\u266D', 'b').replace('\uD834\uDD2B', 'bb'));
  }

  return notes;
}

/**
 * List melakarta ragas by name and index
 * @returns {Object} Dictionary mapping raga names to melakarta numbers (1-72)
 *
 * @example
 * const melas = list_mela();
 * console.log(melas['kharaharapriya']);  // 22
 */
export function list_mela() {
  return { ...MELA_MAP };
}

/**
 * List supported thaats by name
 * @returns {Array<string>} List of thaat names
 *
 * @example
 * const thaats = list_thaat();  // ['bilaval', 'khamaj', 'kafi', ...]
 */
export function list_thaat() {
  return Object.keys(THAAT_MAP);
}

/**
 * Construct the svara indices (degrees) for a given melakarta raga
 * @param {string|number} mela - Melakarta raga name or number (1-72)
 * @returns {Array<number>} Array of 7 svara degrees (0-11)
 *
 * @example
 * mela_to_degrees('kharaharapriya')  // [0, 2, 3, 5, 7, 9, 10]
 * mela_to_degrees(22)                 // [0, 2, 3, 5, 7, 9, 10]
 */
export function mela_to_degrees(mela) {
  let melaNum;

  if (typeof mela === 'string') {
    melaNum = MELA_MAP[mela.toLowerCase()];
    if (!melaNum) {
      throw new Error(`Unknown melakarta raga: ${mela}`);
    }
  } else if (typeof mela === 'number') {
    if (mela < 1 || mela > 72) {
      throw new Error(`Melakarta number must be between 1 and 72, got ${mela}`);
    }
    melaNum = mela;
  } else {
    throw new TypeError('mela must be a string or number');
  }

  // Melakarta system encoding
  // Numbers 1-72 encode the raga structure
  // S (Sa) is always 0
  // P (Pa) is always 7 (except in a few ragas)

  // Decode melakarta number to get R, G, M, D, N
  const melaIndex = melaNum - 1;  // 0-indexed

  // First 36 have shuddha madhyama (M1 = 5), next 36 have prati madhyama (M2 = 6)
  const M = melaIndex < 36 ? 5 : 6;

  // Within each madhyama group, ragas are organized by R-G-D-N combinations
  const groupIndex = melaIndex % 36;

  // There are 6 R-G combinations (R1G1, R1G2, R1G3, R2G2, R2G3, R3G3)
  // and 6 D-N combinations (D1N1, D1N2, D1N3, D2N2, D2N3, D3N3)

  // R-G patterns (rows)
  const rgRow = Math.floor(groupIndex / 6);
  const RG_PATTERNS = [
    [1, 2],   // R1 G1
    [1, 3],   // R1 G2
    [1, 4],   // R1 G3
    [2, 3],   // R2 G2
    [2, 4],   // R2 G3
    [3, 4]    // R3 G3
  ];

  // D-N patterns (columns)
  const dnCol = groupIndex % 6;
  const DN_PATTERNS = [
    [8, 9],   // D1 N1
    [8, 10],  // D1 N2
    [8, 11],  // D1 N3
    [9, 10],  // D2 N2
    [9, 11],  // D2 N3
    [10, 11]  // D3 N3
  ];

  const [R, G] = RG_PATTERNS[rgRow];
  const [D, N] = DN_PATTERNS[dnCol];

  // Return the 7 svaras: S R G M P D N
  return [0, R, G, M, 7, D, N];
}

/**
 * Spell the Carnatic svara names for a given melakarta raga
 * @param {string|number} mela - Melakarta raga name or number (1-72)
 * @param {boolean} abbr - If true, use abbreviated svara names
 * @param {boolean} unicode - If true, use unicode symbols
 * @returns {Array<string>} List of 7 svara names
 *
 * @example
 * mela_to_svara('kharaharapriya')        // ['S', 'R₂', 'G₂', 'M₁', 'P', 'D₂', 'N₂']
 * mela_to_svara(22, true, false)         // ['S', 'R2', 'G2', 'M1', 'P', 'D2', 'N2']
 * mela_to_svara(22, false, false)        // ['Sa', 'Ri2', 'Ga2', 'Ma1', 'Pa', 'Dha2', 'Ni2']
 */
export function mela_to_svara(mela, abbr = true, unicode = true) {
  const degrees = mela_to_degrees(mela);

  // SLOT-AWARE naming: the same chromatic degree is
  // spelled differently depending on which svara slot it fills. Degree 2 is
  // R2 in the Ri slot but G1 in the Ga slot; degree 9 is D2 (Dha) but N1 (Ni).
  // A single-valued degree→name map cannot emit G1/G2/N1/N2 — that was the
  // repaired bug (mela 22 previously returned [S,R2,R3,M1,P,D2,D3]).
  const [, R, G, M, , D, N] = degrees;

  const R_NUM = { 1: 1, 2: 2, 3: 3 };   // Ri slot: degrees 1/2/3
  const G_NUM = { 2: 1, 3: 2, 4: 3 };   // Ga slot: degrees 2/3/4
  const M_NUM = { 5: 1, 6: 2 };         // Ma slot: degrees 5/6
  const D_NUM = { 8: 1, 9: 2, 10: 3 };  // Dha slot: degrees 8/9/10
  const N_NUM = { 9: 1, 10: 2, 11: 3 }; // Ni slot: degrees 9/10/11

  // Variant numbers render as unicode subscripts when unicode=true
  const sub = (n) => (unicode ? ['₁', '₂', '₃'][n - 1] : String(n));

  if (abbr) {
    return ['S', `R${sub(R_NUM[R])}`, `G${sub(G_NUM[G])}`, `M${sub(M_NUM[M])}`,
      'P', `D${sub(D_NUM[D])}`, `N${sub(N_NUM[N])}`];
  }
  return ['Sa', `Ri${sub(R_NUM[R])}`, `Ga${sub(G_NUM[G])}`, `Ma${sub(M_NUM[M])}`,
    'Pa', `Dha${sub(D_NUM[D])}`, `Ni${sub(N_NUM[N])}`];
}

/**
 * Construct the svara indices (degrees) for a given thaat
 * @param {string} thaat - Thaat name (e.g., 'bilaval', 'khamaj')
 * @returns {Array<number>} Array of 7 svara degrees (0-11)
 *
 * @example
 * thaat_to_degrees('bilaval')  // [0, 2, 4, 5, 7, 9, 11]
 * thaat_to_degrees('khamaj')   // [0, 2, 4, 5, 7, 9, 10]
 */
export function thaat_to_degrees(thaat) {
  if (typeof thaat !== 'string') {
    throw new TypeError('thaat must be a string');
  }

  const degrees = THAAT_MAP[thaat.toLowerCase()];
  if (!degrees) {
    throw new Error(`Unknown thaat: ${thaat}. Supported thaats: ${Object.keys(THAAT_MAP).join(', ')}`);
  }

  return [...degrees];
}

/**
 * Convert one or more frequencies (in Hz) to Functional Just System (FJS) notation
 *
 * FJS is a notation system for just intonation that extends conventional staff notation.
 * This function identifies the just intonation interval that best matches each frequency.
 *
 * @param {number|Array<number>} frequencies - Frequency value(s) in Hz
 * @param {number} fmin - Reference frequency for unison (default: C1 = ~32.7 Hz)
 * @param {string} unison - Unison note name (default: 'C')
 * @param {boolean} unicode - Use unicode symbols for accidentals (default: true)
 * @returns {string|Array<string>} FJS notation string(s)
 *
 * @example
 * hz_to_fjs(440)           // 'A4'
 * hz_to_fjs(330, 440, 'A') // 'E5^5'  (5:3 above A4)
 * hz_to_fjs([220, 330, 440]) // ['A3', 'E4^5', 'A4']
 */
export function hz_to_fjs(frequencies, fmin = null, unison = 'C', unicode = true) {
  const isScalar = typeof frequencies === 'number';
  const freqArray = isScalar ? [frequencies] : frequencies;

  // Default fmin to C1 if not specified
  if (fmin === null) {
    fmin = note_to_hz('C1');
  }

  const results = freqArray.map(freq => {
    // Calculate interval ratio from reference
    const ratio = freq / fmin;

    // Convert to semitones
    const semitones = 12 * Math.log2(ratio);

    // Find nearest 12-TET note
    const nearestNote = Math.round(semitones);
    const noteName = hz_to_note(fmin * Math.pow(2, nearestNote / 12), unicode);

    // Calculate cents deviation
    const cents = (semitones - nearestNote) * 100;

    // Determine FJS accidentals based on cents deviation
    // This is a simplified FJS algorithm - full FJS requires ratio analysis
    let fjsAccidental = '';

    if (Math.abs(cents) > 10) {
      // Approximate common just intervals
      if (Math.abs(cents - 3.9) < 5) {
        // 5-limit sharp (5:4 vs 81:64)
        fjsAccidental = unicode ? '^5' : '^5';
      } else if (Math.abs(cents + 3.9) < 5) {
        // 5-limit flat
        fjsAccidental = unicode ? '_5' : '_5';
      } else if (Math.abs(cents - 21.5) < 5) {
        // 7-limit sharp
        fjsAccidental = unicode ? '^7' : '^7';
      } else if (Math.abs(cents + 21.5) < 5) {
        // 7-limit flat
        fjsAccidental = unicode ? '_7' : '_7';
      } else if (Math.abs(cents - 27.3) < 5) {
        // 11-limit sharp
        fjsAccidental = unicode ? '^11' : '^11';
      } else if (Math.abs(cents + 27.3) < 5) {
        // 11-limit flat
        fjsAccidental = unicode ? '_11' : '_11';
      }
    }

    return noteName + fjsAccidental;
  });

  return isScalar ? results[0] : results;
}

/**
 * Convert an interval to Functional Just System (FJS) notation
 *
 * Takes a frequency ratio and converts it to FJS interval notation.
 *
 * @param {number|Array<number>} interval - Frequency ratio(s)
 * @param {string} unison - Unison note name (default: 'C')
 * @param {number} tolerance - Tolerance for ratio matching (default: 65/63 ≈ 1.0317)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} FJS interval notation
 *
 * @example
 * interval_to_fjs(3/2)      // 'P5'  (perfect fifth)
 * interval_to_fjs(5/4)      // 'M3^5' (just major third)
 * interval_to_fjs([3/2, 5/4, 7/4])  // ['P5', 'M3^5', 'm7^7']
 */
export function interval_to_fjs(interval, unison = 'C', tolerance = 65.0 / 63, unicode = true) {
  const isScalar = typeof interval === 'number';
  const intervalArray = isScalar ? [interval] : interval;

  // Reference frequency
  const refHz = note_to_hz(unison + '4');

  const results = intervalArray.map(ratio => {
    const targetHz = refHz * ratio;
    return hz_to_fjs(targetHz, refHz, unison, unicode);
  });

  return isScalar ? results[0] : results;
}

/**
 * Convert frequencies (in Hz) to Carnatic svara notation within a melakarta raga
 *
 * @param {number|Array<number>} frequencies - Frequency value(s) in Hz
 * @param {number} Sa - Reference frequency for Sa (tonic) in Hz
 * @param {string|number} mela - Melakarta raga name or number (1-72)
 * @param {boolean} abbr - Use abbreviated svara names (default: true)
 * @param {boolean} octave - Include octave notation (default: true)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} Carnatic svara notation
 *
 * @example
 * hz_to_svara_c(440, 261.63, 'kharaharapriya')  // 'G3' (approximate)
 * hz_to_svara_c([261.63, 293.66, 329.63], 261.63, 22)  // ['S', 'R2', 'G2']
 */
export function hz_to_svara_c(frequencies, Sa, mela, abbr = true, octave = true, unicode = true) {
  const isScalar = typeof frequencies === 'number';
  const freqArray = isScalar ? [frequencies] : frequencies;

  // Get melakarta degrees
  const degrees = mela_to_degrees(mela);
  const svaraNames = mela_to_svara(mela, abbr, unicode);

  const results = freqArray.map(freq => {
    // Calculate semitone distance from Sa
    const semitones = 12 * Math.log2(freq / Sa);
    const octaveNum = Math.floor(semitones / 12);
    const degreeInOctave = ((semitones % 12) + 12) % 12;

    // Find closest svara in the melakarta scale
    let closestIdx = 0;
    let minDiff = Math.abs(degreeInOctave - degrees[0]);

    for (let i = 1; i < degrees.length; i++) {
      const diff = Math.abs(degreeInOctave - degrees[i]);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    let svara = svaraNames[closestIdx];

    // Add octave notation if requested
    if (octave) {
      if (octaveNum > 0) {
        svara += unicode ? `\u{0307}`.repeat(octaveNum) : "'".repeat(octaveNum);
      } else if (octaveNum < 0) {
        svara += unicode ? `\u{0323}`.repeat(-octaveNum) : ','.repeat(-octaveNum);
      }
    }

    return svara;
  });

  return isScalar ? results[0] : results;
}

/**
 * Convert frequencies (in Hz) to Hindustani svara notation
 *
 * @param {number|Array<number>} frequencies - Frequency value(s) in Hz
 * @param {number} Sa - Reference frequency for Sa (tonic) in Hz
 * @param {boolean} abbr - Use abbreviated svara names (default: true)
 * @param {boolean} octave - Include octave notation (default: true)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} Hindustani svara notation
 *
 * @example
 * hz_to_svara_h(440, 261.63)  // 'G' or 'Ga' (depending on abbr)
 * hz_to_svara_h([261.63, 293.66, 329.63], 261.63)  // ['S', 'R', 'G']
 */
export function hz_to_svara_h(frequencies, Sa, abbr = true, octave = true, unicode = true) {
  const isScalar = typeof frequencies === 'number';
  const freqArray = isScalar ? [frequencies] : frequencies;

  // Hindustani svara names (12-tone chromatic)
  const SVARA_NAMES_ABBR = ['S', 'r', 'R', 'g', 'G', 'M', 'm', 'P', 'd', 'D', 'n', 'N'];
  const SVARA_NAMES_FULL = ['Sa', 're', 'Re', 'ga', 'Ga', 'Ma', 'ma', 'Pa', 'dha', 'Dha', 'ni', 'Ni'];

  const svaraNames = abbr ? SVARA_NAMES_ABBR : SVARA_NAMES_FULL;

  const results = freqArray.map(freq => {
    // Calculate semitone distance from Sa
    const semitones = 12 * Math.log2(freq / Sa);
    const octaveNum = Math.floor(semitones / 12);
    const degreeInOctave = Math.round(((semitones % 12) + 12) % 12);

    let svara = svaraNames[degreeInOctave];

    // Add octave notation if requested
    if (octave) {
      if (octaveNum > 0) {
        svara += unicode ? `\u{0307}`.repeat(octaveNum) : "'".repeat(octaveNum);
      } else if (octaveNum < 0) {
        svara += unicode ? `\u{0323}`.repeat(-octaveNum) : ','.repeat(-octaveNum);
      }
    }

    return svara;
  });

  return isScalar ? results[0] : results;
}

/**
 * Convert MIDI numbers to Carnatic svara within a melakarta raga
 *
 * @param {number|Array<number>} midi - MIDI note number(s)
 * @param {number} Sa - MIDI number or frequency (Hz) for Sa (tonic)
 * @param {string|number} mela - Melakarta raga name or number (1-72)
 * @param {boolean} abbr - Use abbreviated svara names (default: true)
 * @param {boolean} octave - Include octave notation (default: true)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} Carnatic svara notation
 *
 * @example
 * midi_to_svara_c(60, 60, 'kharaharapriya')  // 'S'
 * midi_to_svara_c([60, 62, 64], 60, 22)      // ['S', 'R2', 'G2']
 */
export function midi_to_svara_c(midi, Sa, mela, abbr = true, octave = true, unicode = true) {
  const isScalar = typeof midi === 'number';
  const midiArray = isScalar ? [midi] : midi;

  // Convert Sa to Hz if it's a MIDI number
  const SaHz = Sa < 100 ? midi_to_hz(Sa) : Sa;

  // Convert MIDI to Hz
  const frequencies = midiArray.map(m => midi_to_hz(m));

  const result = hz_to_svara_c(frequencies, SaHz, mela, abbr, octave, unicode);

  return result;
}

/**
 * Convert MIDI numbers to Hindustani svara
 *
 * @param {number|Array<number>} midi - MIDI note number(s)
 * @param {number} Sa - MIDI number or frequency (Hz) for Sa (tonic)
 * @param {boolean} abbr - Use abbreviated svara names (default: true)
 * @param {boolean} octave - Include octave notation (default: true)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} Hindustani svara notation
 *
 * @example
 * midi_to_svara_h(60, 60)     // 'S'
 * midi_to_svara_h([60, 62, 64], 60)  // ['S', 'R', 'G']
 */
export function midi_to_svara_h(midi, Sa, abbr = true, octave = true, unicode = true) {
  const isScalar = typeof midi === 'number';
  const midiArray = isScalar ? [midi] : midi;

  // Convert Sa to Hz if it's a MIDI number
  const SaHz = Sa < 100 ? midi_to_hz(Sa) : Sa;

  // Convert MIDI to Hz
  const frequencies = midiArray.map(m => midi_to_hz(m));

  const result = hz_to_svara_h(frequencies, SaHz, abbr, octave, unicode);

  return result;
}

/**
 * Convert western note names to Carnatic svara within a melakarta raga
 *
 * @param {string|Array<string>} notes - Note name(s) (e.g., 'C4', 'D#5')
 * @param {string} Sa - Note name for Sa (tonic)
 * @param {string|number} mela - Melakarta raga name or number (1-72)
 * @param {boolean} abbr - Use abbreviated svara names (default: true)
 * @param {boolean} octave - Include octave notation (default: true)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} Carnatic svara notation
 *
 * @example
 * note_to_svara_c('C4', 'C4', 'kharaharapriya')  // 'S'
 * note_to_svara_c(['C4', 'D4', 'E4'], 'C4', 22)  // ['S', 'R2', 'G2']
 */
export function note_to_svara_c(notes, Sa, mela, abbr = true, octave = true, unicode = true) {
  const isScalar = typeof notes === 'string';
  const noteArray = isScalar ? [notes] : notes;

  // Convert Sa to Hz
  const SaHz = note_to_hz(Sa);

  // Convert notes to Hz
  const frequencies = noteArray.map(note => note_to_hz(note));

  const result = hz_to_svara_c(frequencies, SaHz, mela, abbr, octave, unicode);

  return result;
}

/**
 * Convert western note names to Hindustani svara
 *
 * @param {string|Array<string>} notes - Note name(s) (e.g., 'C4', 'D#5')
 * @param {string} Sa - Note name for Sa (tonic)
 * @param {boolean} abbr - Use abbreviated svara names (default: true)
 * @param {boolean} octave - Include octave notation (default: true)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string|Array<string>} Hindustani svara notation
 *
 * @example
 * note_to_svara_h('C4', 'C4')      // 'S'
 * note_to_svara_h(['C4', 'D4', 'E4'], 'C4')  // ['S', 'R', 'G']
 */
export function note_to_svara_h(notes, Sa, abbr = true, octave = true, unicode = true) {
  const isScalar = typeof notes === 'string';
  const noteArray = isScalar ? [notes] : notes;

  // Convert Sa to Hz
  const SaHz = note_to_hz(Sa);

  // Convert notes to Hz
  const frequencies = noteArray.map(note => note_to_hz(note));

  const result = hz_to_svara_h(frequencies, SaHz, abbr, octave, unicode);

  return result;
}

// ============================================================================
// Notation Helper Functions
// ============================================================================

/**
 * Compute the octave-folded interval
 * Equivalent to the __o_fold helper
 *
 * Maps intervals to the range [1, 2) by removing octave multiples.
 * This is part of the FJS (Functional Just System) notation converter.
 * Equivalent to the 'red' function in FJS documentation.
 *
 * @private
 * @param {number} d - Interval ratio
 * @returns {number} Octave-folded interval in range [1, 2)
 */
function __o_fold(d) {
  return d * Math.pow(2.0, -Math.floor(Math.log2(d)))
}

/**
 * Compute the balanced, octave-folded interval
 * Equivalent to the __bo_fold helper
 *
 * Maps intervals to the range [sqrt(2)/2, sqrt(2)) using balanced octave folding.
 * This is part of the FJS notation converter.
 * Equivalent to the 'reb' function in FJS documentation.
 *
 * @private
 * @param {number} d - Interval ratio
 * @returns {number} Balanced octave-folded interval in range [sqrt(2)/2, sqrt(2))
 */
function __bo_fold(d) {
  return d * Math.pow(2.0, -Math.round(Math.log2(d)))
}

/**
 * Accelerated helper for finding number of fifths
 * Equivalent to the __fifth_search helper
 *
 * Finds the number of perfect fifths (3/2 ratio) needed to approximate
 * a given interval within a specified tolerance.
 * Used in FJS notation conversion.
 *
 * @private
 * @param {number} interval - Target interval ratio
 * @param {number} tolerance - Tolerance for approximation
 * @returns {number} Number of fifths (positive or negative)
 */
function __fifth_search(interval, tolerance) {
  const log_tolerance = Math.abs(Math.log2(tolerance))

  for (let power = 0; power < 32; power++) {
    for (const sign of [1, -1]) {
      const test_interval = interval / Math.pow(3.0, power * sign)
      const folded = __bo_fold(test_interval)

      if (Math.abs(Math.log2(folded)) <= log_tolerance) {
        return power * sign
      }
    }
  }

  return 32  // Give up after 32 fifths
}

/**
 * Translate a mode into its equivalent major key
 * Equivalent to the __mode_to_key helper
 *
 * @private
 * @param {string} signature - Mode signature (e.g., 'D:dorian')
 * @param {boolean} unicode - Return accidentals as unicode (default: true)
 * @returns {string} Equivalent major key
 */
function __mode_to_key(signature, unicode = true) {
  // Parse mode signature
  const parts = signature.split(':')
  if (parts.length !== 2) {
    throw new Error(`Invalid mode signature: ${signature}`)
  }

  const [note, mode] = parts

  // Mode to degree mapping (relative to major scale)
  const mode_degrees = {
    'ionian': 0,      // Major
    'dorian': -2,
    'phrygian': -4,
    'lydian': 1,
    'mixolydian': -1,
    'aeolian': -3,    // Minor
    'locrian': -5
  }

  const degree_shift = mode_degrees[mode.toLowerCase()]
  if (degree_shift === undefined) {
    throw new Error(`Unknown mode: ${mode}`)
  }

  // Convert note to MIDI number
  const midi = note_to_midi(note + '4')  // Arbitrary octave

  // Shift to major key
  const major_midi = midi + degree_shift
  const major_note = midi_to_note(major_midi, false, false, unicode)

  return major_note
}

/**
 * Convert note name to scale degree
 * Equivalent to the __note_to_degree helper
 *
 * Takes a note name and returns the chromatic degree (C=0, C#=1, ..., B=11).
 * Handles accidentals including sharps, flats, and combinations.
 *
 * @private
 * @param {string|Array<string>} key - Note name(s)
 * @returns {number|Array<number>} Scale degree(s) [0-11]
 */
function __note_to_degree(key) {
  const isScalar = typeof key === 'string'
  const keys = isScalar ? [key] : key

  const degrees = keys.map(k => {
    // Base note mapping
    const note_map = {
      'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
    }

    // Extract base note (first character)
    const base = k[0].toUpperCase()
    let degree = note_map[base]

    if (degree === undefined) {
      throw new Error(`Invalid note name: ${k}`)
    }

    // Process accidentals (rest of the string)
    for (let i = 1; i < k.length; i++) {
      const acc = k[i]
      if (acc === '#' || acc === '♯') {
        degree += 1
      } else if (acc === 'b' || acc === '♭') {
        degree -= 1
      }
    }

    // Normalize to [0, 11]
    return ((degree % 12) + 12) % 12
  })

  return isScalar ? degrees[0] : degrees
}

/**
 * Simplify note name by canceling accidentals
 * Equivalent to the __simplify_note helper
 *
 * Takes a note name and simplifies by canceling sharp-flat pairs
 * and compressing multiple accidentals (e.g., 'C♭♯' -> 'C', 'C##' -> 'D').
 *
 * @private
 * @param {string|Array<string>} key - Note name(s)
 * @param {string} additional_acc - Additional accidentals to add (default: '')
 * @param {boolean} unicode - Use unicode symbols for output (default: true)
 * @returns {string|Array<string>} Simplified note name(s)
 */
function __simplify_note(key, additional_acc = '', unicode = true) {
  const isScalar = typeof key === 'string'
  const keys = isScalar ? [key] : key

  const simplified = keys.map(k => {
    // Extract base note
    const base = k[0].toUpperCase()

    // Count net accidentals (sharp = +1, flat = -1)
    let net_acc = 0

    for (let i = 1; i < k.length; i++) {
      const acc = k[i]
      if (acc === '#' || acc === '♯') {
        net_acc += 1
      } else if (acc === 'b' || acc === '♭') {
        net_acc -= 1
      }
    }

    // Add additional accidentals
    for (const acc of additional_acc) {
      if (acc === '#' || acc === '♯') {
        net_acc += 1
      } else if (acc === 'b' || acc === '♭') {
        net_acc -= 1
      }
    }

    // Build simplified note
    let result = base

    if (net_acc > 0) {
      const symbol = unicode ? '♯' : '#'
      result += symbol.repeat(net_acc)
    } else if (net_acc < 0) {
      const symbol = unicode ? '♭' : 'b'
      result += symbol.repeat(Math.abs(net_acc))
    }

    return result
  })

  return isScalar ? simplified[0] : simplified
}

/**
 * Calculate the note name for a given number of perfect fifths
 *
 * Starting from a given unison note, computes the note name that is
 * `fifths` perfect fifths away.
 *
 * @param {string} unison - The starting note (e.g., 'C')
 * @param {number} fifths - Number of fifths (positive for up, negative for down)
 * @param {boolean} unicode - Use unicode symbols (default: true)
 * @returns {string} The resulting note name
 *
 * @example
 * fifths_to_note('C', 1)        // 'G'   (up one fifth)
 * fifths_to_note('C', -1)       // 'F'   (down one fifth)
 * fifths_to_note('C', 7, false) // 'C#'  (7 fifths = one sharp on the tonic letter)
 * fifths_to_note('B', 1, false) // 'F#'  (crossing the B→F♯ boundary adds the sharp)
 * fifths_to_note('G', -3, false)// 'Bb'  (docstring golden)
 */
export function fifths_to_note(unison, fifths, unicode = true) {
  // Letters ordered by fifths. A note's absolute circle-of-fifths index is
  // its letter position plus 7 per sharp (minus 7 per flat); adding `fifths`
  // and converting back gives both the new letter AND the accidental count.
  // This is exact for any distance — the legacy floor((fifths+1)/7) formula
  // ignored the unison's own circle position (B+1 wrongly returned 'F').
  const FIFTHS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

  if (typeof unison !== 'string' || unison.length === 0) {
    throw new Error(`Invalid unison note: ${unison}`);
  }
  const pos = FIFTHS_ORDER.indexOf(unison[0].toUpperCase());
  if (pos === -1) {
    throw new Error(`Invalid unison note: ${unison}`);
  }
  if (!Number.isInteger(fifths)) {
    throw new Error(`fifths must be an integer, got ${fifths}`);
  }

  // Accidentals on the unison shift its circle index by ±7 each
  let unisonAcc = 0;
  for (let i = 1; i < unison.length; i++) {
    const c = unison[i];
    if (c === '#' || c === '♯') unisonAcc += 1;
    else if (c === 'b' || c === '♭') unisonAcc -= 1;
    else throw new Error(`Invalid accidental '${c}' in unison note: ${unison}`);
  }

  const idx = pos + 7 * unisonAcc + fifths;
  const letter = FIFTHS_ORDER[((idx % 7) + 7) % 7];
  const accidentals = Math.floor(idx / 7);

  if (accidentals > 0) {
    return letter + (unicode ? '♯' : '#').repeat(accidentals);
  }
  if (accidentals < 0) {
    return letter + (unicode ? '♭' : 'b').repeat(-accidentals);
  }
  return letter;
}
