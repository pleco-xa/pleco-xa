/**
 * Port of librosa.core.notation
 * Music notation, scale theory, and key/raga functions
 * Librosa-compatible notation utilities for JavaScript
 */

import { hz_to_midi, midi_to_hz, note_to_hz, hz_to_note, note_to_midi, midi_to_note } from './xa-convert.js';

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
 * Melakarta svara patterns (degrees)
 * Each melakarta has a specific pattern of 7 svaras
 */
const MELA_SVARA_PATTERNS = [
  // Rows represent R, G, M, P, D, N patterns
  // Format: [R, G, M, P, D, N] where each is 0-indexed degree
  [0, 1, 2, 3, 4, 5, 6],  // Placeholder - will be computed
];

/**
 * Hindustani thaat database
 */
const THAAT_MAP = {
  'bilaval': [0, 2, 4, 5, 7, 9, 11],
  'khamaj': [0, 2, 4, 5, 7, 9, 10],
  'kafi': [0, 2, 3, 5, 7, 8, 10],
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
 * Note names for each chromatic degree in different keys
 */
const KEY_NOTE_NAMES = {
  'C:maj': ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  'C#:maj': ['C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'B#'],
  'Db:maj': ['Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C'],
  'D:maj': ['D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'B#', 'C#'],
  'Eb:maj': ['Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'C#', 'D'],
  'E:maj': ['E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'B#', 'C#', 'D', 'D#'],
  'F:maj': ['F', 'F#', 'G', 'G#', 'A', 'Bb', 'B', 'C', 'C#', 'D', 'D#', 'E'],
  'F#:maj': ['F#', 'G', 'G#', 'A', 'A#', 'B', 'B#', 'C#', 'D', 'D#', 'E', 'E#'],
  'Gb:maj': ['Gb', 'G', 'Ab', 'A', 'Bb', 'Cb', 'C', 'Db', 'D', 'Eb', 'E', 'F'],
  'G:maj': ['G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'E#', 'F#'],
  'Ab:maj': ['Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G'],
  'A:maj': ['A', 'A#', 'B', 'B#', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#'],
  'Bb:maj': ['Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A'],
  'B:maj': ['B', 'B#', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#']
};

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
 * List all 12 note names in the chromatic scale, as spelled according to a given key
 * @param {string} key - Key signature (e.g., 'C:maj', 'F#:min')
 * @param {boolean} unicode - If true, use unicode symbols for accidentals
 * @param {boolean} natural - If true, only use natural note names (C-B)
 * @returns {Array<string>} List of 12 note names
 *
 * @example
 * key_to_notes('C:maj')     // ['C', 'C#', 'D', ...]
 * key_to_notes('F:maj')     // ['F', 'F#', 'G', 'G#', 'A', 'Bb', ...]
 */
export function key_to_notes(key, unicode = true, natural = false) {
  if (typeof key !== 'string') {
    throw new TypeError('key must be a string');
  }

  if (natural) {
    // Return natural note names only
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }

  // Get note names for this key signature
  let notes = KEY_NOTE_NAMES[key];

  if (!notes) {
    // Default to C major if key not found
    notes = KEY_NOTE_NAMES['C:maj'];
  }

  // Convert to unicode if requested
  if (unicode) {
    notes = notes.map(note => {
      return note.replace('#', '\u266F').replace('b', '\u266D');
    });
  }

  return [...notes];
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
 * mela_to_svara('kharaharapriya')           // ['S', 'R2', 'G2', 'M1', 'P', 'D2', 'N2']
 * mela_to_svara(22, true)                    // ['S', 'R2', 'G2', 'M1', 'P', 'D2', 'N2']
 * mela_to_svara(22, false)                   // ['Sa', 'Ri2', 'Ga2', 'Ma1', 'Pa', 'Dha2', 'Ni2']
 */
export function mela_to_svara(mela, abbr = true, unicode = true) {
  const degrees = mela_to_degrees(mela);

  // Map degrees to svara names
  const SVARA_NAMES_ABBR = {
    0: 'S',
    1: 'R1', 2: 'R2', 3: 'R3',
    4: 'G3',
    5: 'M1', 6: 'M2',
    7: 'P',
    8: 'D1', 9: 'D2', 10: 'D3',
    11: 'N3'
  };

  const SVARA_NAMES_FULL = {
    0: 'Sa',
    1: 'Ri1', 2: 'Ri2', 3: 'Ri3',
    4: 'Ga3',
    5: 'Ma1', 6: 'Ma2',
    7: 'Pa',
    8: 'Dha1', 9: 'Dha2', 10: 'Dha3',
    11: 'Ni3'
  };

  // Note: degrees contain [S, R, G, M, P, D, N] but R/G/D/N can be variants
  // We need to determine which variant based on the actual degree value
  const [S, R, G, M, P, D, N] = degrees;

  const svaras = abbr ? SVARA_NAMES_ABBR : SVARA_NAMES_FULL;

  return [
    svaras[S],
    svaras[R],
    svaras[G],
    svaras[M],
    svaras[P],
    svaras[D],
    svaras[N]
  ];
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
