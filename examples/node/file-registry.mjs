/**
 * xa-file registry + xa-fileio utilities, headless.
 *
 * The browser demo (examples/web/file-io.html) proves the fetch/decode/mic
 * paths against a live AudioContext; THIS proof pins everything that must
 * also hold in Node — including two coverage close-out repairs:
 *   (1) isWebAudioSupported() now ANSWERS false in Node instead of crashing
 *       on a bare `window` read (env detection must not throw), and
 *   (2) find_files() honors an injected DirectoryHandle-shaped object FIRST
 *       (previously the handle path sat behind a `window` check: ReferenceError
 *       in Node, and the handle was silently ignored in non-FSA browsers).
 *
 *   - listExamples: all 6 registry entries with key/description/duration,
 *   - exampleInfo('trumpet'): exact registry row; unknown key throws,
 *   - exampleAudio with an injected context rejects an unknown key BEFORE any
 *     network fetch (registry validation contract),
 *   - loadFile round-trip with an injected decoder: encodeWav → loadFile →
 *     samples within the 16-bit quantization bound,
 *   - createAudioContext in Node throws the documented FileError,
 *   - find_files over a mock directory tree: extension filter (case folded),
 *     recursion on/off, name-sorted output, limit/offset window; calling it
 *     with no handle in Node throws the documented TypeError,
 *   - cite(): the pleco BibTeX entry (version echoed) plus the academic-use note.
 */
import {
  file, fileio, loadFile, encodeWav, decodeWav,
} from '../../packages/pleco-xa/dist/pleco-xa.js'
import { check, checkTrue, summary } from './_harness.mjs'

// ── registry ────────────────────────────────────────────────────────────────
const examples = file.listExamples()
check('listExamples returns the 6 registry entries', examples.length, 6)
checkTrue('listExamples rows carry key/description/duration/sampleRate/genre',
  examples.every((e) => e.key && e.description && e.duration > 0 && e.sampleRate === 22050 && e.genre))
check("exampleInfo('trumpet') == exact registry row",
  file.exampleInfo('trumpet'),
  { path: 'trumpet', desc: 'Trumpet sample - B♭4 note', duration: 2.1, sr: 22050, genre: 'instrumental' })
{
  let threw = false
  try { file.exampleInfo('nope') } catch { threw = true }
  checkTrue('exampleInfo(unknown key) throws', threw)
}

// ── injected-context decode paths ───────────────────────────────────────────
const fakeCtx = {
  decodeAudioData: async (ab) => {
    const { channels, sampleRate } = decodeWav(ab)
    return {
      numberOfChannels: channels.length, length: channels[0].length, sampleRate,
      duration: channels[0].length / sampleRate, getChannelData: (i) => channels[i],
    }
  },
}
{
  const msg = await file.exampleAudio('nope', false, 0, fakeCtx).then(() => '', (e) => e.message)
  checkTrue('exampleAudio(unknown key) rejects with the registry error BEFORE any fetch',
    msg.includes('Unknown example key') && msg.includes('brahms'), msg.slice(0, 60))
}
{
  const sr = 22050
  const y = new Float32Array(2205)
  for (let i = 0; i < y.length; i++) y[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr)
  const wav = encodeWav([y], sr) // ArrayBuffer (io/wav tier)
  const fileLike = { name: 'tone.wav', arrayBuffer: async () => wav.slice(0) }
  const loaded = await loadFile(fileLike, fakeCtx)
  check('loadFile round-trip: length and sampleRate preserved',
    [loaded.length, loaded.sampleRate], [y.length, sr])
  let maxErr = 0
  const d = loaded.getChannelData(0)
  for (let i = 0; i < y.length; i++) maxErr = Math.max(maxErr, Math.abs(d[i] - y[i]))
  checkTrue('loadFile round-trip within the 16-bit bound (≤ 2/32768)',
    maxErr <= 2 / 32768, `maxErr ${maxErr.toExponential(2)}`)
}

// ── env detection (repair 1) ────────────────────────────────────────────────
check('isWebAudioSupported() answers false in Node (post-repair: no window crash)',
  file.isWebAudioSupported(), false)
{
  let err = null
  try { file.createAudioContext() } catch (e) { err = e }
  checkTrue('createAudioContext in Node throws the documented FileError',
    err !== null && err.name === 'FileError', err ? err.message : 'no throw')
}

// ── find_files over an injected DirectoryHandle (repair 2) ──────────────────
const mkFile = (name) => ({ name })
const tree = {
  kind: 'directory',
  values: async function* () {
    yield { kind: 'file', getFile: async () => mkFile('b.wav') }
    yield { kind: 'file', getFile: async () => mkFile('a.WAV') }
    yield { kind: 'file', getFile: async () => mkFile('notes.txt') }
    yield {
      kind: 'directory',
      values: async function* () {
        yield { kind: 'file', getFile: async () => mkFile('c.wav') }
      },
    }
  },
}
check('find_files(handle, .wav): case-folded filter, recursion, name-sorted',
  (await fileio.find_files(tree, { ext: '.wav' })).map((f) => f.name),
  ['a.WAV', 'b.wav', 'c.wav'])
check('find_files(recurse: false) skips the subdirectory',
  (await fileio.find_files(tree, { ext: '.wav', recurse: false })).map((f) => f.name),
  ['a.WAV', 'b.wav'])
check('find_files(limit 1, offset 1) windows the sorted list',
  (await fileio.find_files(tree, { ext: '.wav', limit: 1, offset: 1 })).map((f) => f.name),
  ['b.wav'])
{
  const msg = await fileio.find_files(null).then(() => '', (e) => e.message)
  checkTrue('find_files without a handle in Node throws the documented TypeError',
    msg.includes('non-browser environments'), msg.slice(0, 50))
}

// ── citation ────────────────────────────────────────────────────────────────
{
  const c = fileio.cite('9.9.9')
  checkTrue('cite(version) echoes the version in the pleco BibTeX entry',
    c.includes('version      = {9.9.9}') && c.includes('@software{pleco_xa'))
  checkTrue('cite() includes the academic-use citation note',
    c.includes('please cite it'))
}

summary('xa-file registry + xa-fileio utilities (post-repair, headless)')
