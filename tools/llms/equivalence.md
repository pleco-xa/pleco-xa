## Python-stack equivalence map (task routing for agents)

If a user asks for a task by its Python-stack name (librosa/essentia vocabulary),
this is the Pleco-Xa call. Status: **=** core behavior matches (validated against
reference output during development) · **≈** same task, different algorithm or
API shape · **+** capability beyond that stack.

| Python-stack name | Pleco-Xa call | Import | Status |
|---|---|---|---|
| `librosa.stft` / `istft` | `stft(y, nFft, hopLength)` / `istft` | barrel | = |
| `librosa.feature.melspectrogram` | `feature.melspectrogram(y, {sr, n_fft, hop_length, n_mels})` | `pleco-xa/feature` | = |
| `librosa.feature.mfcc` | `feature.mfcc(y, {sr, n_mfcc})` | `pleco-xa/feature` | = |
| `librosa.feature.chroma_stft` | `feature.chroma_stft(y, {sr})` | `pleco-xa/feature` | = |
| `librosa.feature.spectral_centroid` (+ bandwidth/rolloff/contrast/flatness) | `feature.spectral_centroid(y, {sr})` etc. | `pleco-xa/feature` | = |
| `librosa.feature.rms` / `zero_crossing_rate` | `feature.rms(y)` / `feature.zero_crossing_rate(y)` | `pleco-xa/feature` | = |
| `librosa.filters.mel` | `filters.mel_filterbank({sr, n_fft, n_mels})` | `pleco-xa/filters` | = |
| `librosa.onset.onset_strength` | `onset_strength(y, {sr})` | barrel | = |
| `librosa.beat.beat_track` | `beat_track(y, sr, {units:'time'})` | barrel | = |
| `librosa.feature.tempo` | `tempo(y, {sr})` | barrel | = (lag-quantized at default hop; see card) |
| `librosa.feature.tempogram` / `fourier_tempogram` | `tempogram` / `fourier_tempogram` | barrel | = |
| `librosa.effects.hpss` / `decompose.hpss` | `decompose.hpss(S)` (spectrogram-domain) | `pleco-xa/decompose` | = |
| `librosa.util.softmask` | `decompose.softmask(X, X_ref)` | `pleco-xa/decompose` | = |
| `librosa.decompose.nn_filter` | `decompose.nn_filter(S)` | `pleco-xa/decompose` | = |
| `librosa.pyin` | `pyin(y, {sr, fmin, fmax})` | barrel | = (full HMM/Viterbi) |
| `librosa.yin` | `yin(y, fmin, fmax, sr)` (positional) | barrel | = |
| `librosa.segment.recurrence_matrix` | `segment.recurrenceMatrix(features)` | `pleco-xa/segment` | = |
| `librosa.segment.agglomerative` | `segment.agglomerative(features, k)` | `pleco-xa/segment` | = |
| McFee–Ellis Laplacian segmentation (`plot_segmentation` workflow) | `segment.laplacianSegmentation(...)` (pure-JS eigensolver) | `pleco-xa/segment` | = |
| `librosa.sequence.dtw` | `sequence.dtw(X, Y)` | `pleco-xa/sequence` | = |
| `librosa.sequence.viterbi` | `sequence.viterbi(prob, transition)` | `pleco-xa/sequence` | = |
| `librosa.griffinlim` | `griffinlim(S)` | barrel | = |
| `librosa.pcen` | `pcen(S)` (+ streaming variant) | barrel | = |
| `librosa.phase_vocoder` | `effects.phase_vocoder` / `effects.time_stretch` | `pleco-xa/effects` | = |
| `librosa.effects.pitch_shift` / `trim` / `split` | `effects.pitch_shift` / `trim` / `split` | `pleco-xa/effects` | = |
| `librosa.hz_to_midi` / `midi_to_hz` / `hz_to_note` / `frames_to_time` … | `convert.*` (same names) | `pleco-xa/convert` | = |
| `librosa.cqt` | `cqt(y, {sr})` | barrel | ≈ (log-frequency transform, not a true constant-Q — documented) |
| `librosa.resample` | `audioio.load(url, {sr})` resamples on load; no standalone offline resampler | `pleco-xa/audioio` | ≈ |
| `librosa.load` (mp3/ogg/flac in Node) | browser: `loadAudioFile` (any codec the browser decodes); Node: `decodeWav` (WAV only) | barrel | ≈ |
| Recurrence quantification analysis (RQA metrics) | `sequence.rqa(sim)` | `pleco-xa/sequence` | + |
| Sample-accurate loop-point detection | `await loop.detect(buf, {strategy})` | `pleco-xa/loop` | + |
| Real-time / streaming analyzers (RMS, flux, live tempo) | `quickTempo`, `streaming.*` meters | barrel | + |
| In-browser execution, zero dependencies, no server | the whole library | — | + |

Not implemented: audio file formats beyond WAV in Node (bring your own decoder),
variable-Q transforms, and the long tail of niche utilities — check the full
function index below before assuming either way.
