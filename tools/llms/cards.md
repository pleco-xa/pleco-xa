# pleco-xa — canonical analysis surface (agent one-sheet)

All entries verified against `packages/pleco-xa/dist/types/*.d.ts` + src JSDoc and spot-run
against the built dist (`dist/pleco-xa.js` and subpath dists) with synthesized click tracks
(120 BPM) and sines at sr 22050 and 44100. Every THROWS/GOTCHA below was demonstrated, not inferred.
Import: `import { tempo, feature, loop, segment, sequence, decompose, convert } from 'pleco-xa'`
(subpaths `pleco-xa/feature`, `/loop`, `/segment`, `/sequence`, `/decompose`, `/convert`, `/io` also verified).

## Task routing

| Task | Use | Avoid (legacy, all verified present) |
|---|---|---|
| BPM | `tempo` (global scalar) \| `beat_track` (tempo + beat positions) \| `quickTempo` (live, windowed) | `detectBPM`, `fastBPMDetect`, `beatTrack`, `extractTempo`, `estimate_tempo` |
| Loops | `loop.detect` (one entry, 4 strategies) | `detectLoop`, `fastLoopAnalysis`, `loop.loopAnalysis`, `loop.fastOnsetLoopAnalysis`, `loop.analyzeLoopPoints`, `loop.xaLoopAnalysis` |
| Onsets | `onset_strength` (envelope) \| `onsetDetect` (event times) | `bpm.computeOnsetStrength` |
| Spectral features | `feature.*` (melspectrogram, mfcc, chroma_stft, spectral_*) | top-level `spectrogram` (bare magnitude helper) |
| Separation | `decompose.hpss` / `decompose.nn_filter` / `decompose.softmask` | `decompose.processAudioToFingerprints` / `reconstructVocal` / `optimizeEqCurves` (specialized vocal-EQ pipeline, not general separation) |
| Structure | `segment.recurrenceMatrix` / `segment.agglomerative` / `segment.laplacianSegmentation` | `recurrence.*` namespace (`recurrence.recurrenceMatrix`, `recurrence.recurrenceLoopDetection`, `recurrence.computeChroma`) |
| Alignment | `sequence.dtw` / `sequence.rqa` / `sequence.viterbi` | — (no legacy alignment exports in the barrel) |
| Pitch | `pyin` (f0 + voicing) \| `yin` (fast f0) | — (piptrack/autocorrelation_pitch not in the barrel) |
| I/O | `decodeWav` / `encodeWav` | `createAudioBlob`, `exportBufferAsWav` (superseded by io/wav, the one WAV codec) |
| Conversions | `convert.*` | `recurrence.framesToTime` (duplicate) |

## Function cards

### tempo — global BPM (sync, node+browser)
`tempo(y: Float32Array|null, opts?: {sr?=22050, onsetEnvelope?=null, hopLength?=512, startBpm?=120, stdBpm?=1.0, acSize?=8.0, maxTempo?=320, aggregate?='mean'|null} | number(sr)) → number(BPM) | Float64Array(BPM per onset frame when aggregate:null)`
Options are camelCase; `y` may be null when `onsetEnvelope` is given; second arg may be a bare sr number (positional).
THROWS: silent/constant input ("onset envelope is all zeros"); NaN in signal (non-finite index named); empty input.
GOTCHA: sr is NEVER inferred — a 44.1k/120 BPM click without `{sr:44100}` returned 60.09 (plausible, wrong). `{hop_length}` (snake) is silently ignored.
COST/PRECISION: lag-quantized — the same 120.00 BPM click gave 117.45 at default hop 512, 120.19 at `hopLength:256`.

### beat_track — tempo + beat positions, DP tracker (sync, node+browser)
`beat_track(y: Float32Array|null, sr?=22050, opts?: {onsetEnvelope?=null, hopLength?=512, startBpm?=120, tightness?=100, trim?=true, bpm?=null(number|per-frame array), units?='frames'|'samples'|'time', sparse?=true}) → {tempo: number(BPM), beats: number[]}`
Default `units:'frames'` → beats are onset-envelope FRAME indices (verified: 22,44,65…); `units:'time'` → seconds (0.511, 1.022…); `units:'samples'` → samples. camelCase options (snake `hop_length` silently ignored — verified via beat index shift).
THROWS: missing/empty input, invalid params. Silence does NOT throw: returns `{tempo: 0, beats: []}` (unlike `tempo()`, which throws on the same input).
GOTCHA: pass `bpm: tempo(y,{aggregate:null})` output for time-varying tracking; scalar `bpm` skips estimation entirely.

### quickTempo — windowed live BPM, quick tier (sync, node+browser)
`quickTempo(y: Float32Array, sr?=22050, opts?: {windowSec?=8, hopLength?=512, minBpm?=70, maxBpm?=180}) → {bpm: number, confidence: number(0..1), tier:'quick', windowSec: number}`
Analyzes ONLY the last `windowSec` seconds; lag-quantized, no prior; never used as a silent fallback by `tempo`/`beat_track`.
THROWS: no onsets in the window ("no onsets detected in the last 8s window") — never a default BPM.
GOTCHA: confidence is measured peak prominence, not a grade — a clean 120 BPM click scored only 0.15.

### onset_strength — log-power-mel onset envelope (sync, node+browser)
`onset_strength(y: Float32Array, opts?: {sr?=22050, S?=null, n_fft?=2048, hop_length?=512, lag?=1, max_size?=1, detrend?=false, center?=true, n_mels?=128, fmin?=0, fmax?=sr/2, htk?=false, aggregate?='mean'|'median'} | number(sr), hop?) → Float32Array(dimensionless flux, one value per hop frame)`
snake_case options (verified: `hop_length:1024` honored → 173 frames; camel `hopLength` silently ignored → 345). Positional `(y, sr, hop)` also accepted.
THROWS: empty input; NaN in signal.
GOTCHA: casing is the OPPOSITE of `tempo`/`beat_track`/`onsetDetect` — this function is snake_case.

### onsetDetect — spectral-flux onset events (sync, node+browser)
`onsetDetect(y: Float32Array, sampleRate: number, opts?: {hopLength?=512, frameLength?=2048, delta?=0.07, wait?=20}) → {onsetTimes: number[](seconds), onsetStrength: Float32Array, onsetFrames: number[](frames)}`
camelCase options (verified: `hopLength:1024` honored, snake `hop_length` silently ignored). `sampleRate` is a required positional — no default.
THROWS: nothing on silence — returns 0 onsets (verified).
GOTCHA: different envelope than `onset_strength` (raw spectral flux, not log-mel); lengths differ (341 vs 345 on the same input).

### stft — short-time Fourier transform (sync, node+browser)
`stft(y: Float32Array, n_fft?=2048, hop_length?=n_fft/4, win_length?=n_fft, window?='hann', center?=true, pad_mode?='constant') → Array[n_fft/2+1][n_frames] of {real, imag}`
Positional args, no options object. Verified shape 1025×87 for 2 s @ 22050.
THROWS: NaN/Infinity in input (offending index named); unsupported window (supported: hann, hamming, blackman, rectangular, boxcar — no silent hann fallback).
COST: boxes one {real,imag} object per bin — for features use `stft_power` (flat Float32Array rows, same numerics).

### istft — inverse STFT (sync, node+browser)
`istft(D: Array[freq][time] of {real,imag}, hop_length?=n_fft/4, win_length?=n_fft, window?='hann', center?=true, length?) → Float32Array`
Verified round-trip error 6e-8 mid-signal with `length` passed.
THROWS: malformed/missing bins.
GOTCHA: omit `length` and the tail is truncated to full frames (44032 returned for 44100 input) — pass `length: y.length` for exact round-trips.

### fft — radix-2 FFT (sync, node+browser)
`fft(signal: Float32Array) → Array<{real, imag}>; length = next power of 2 >= N`
Verified: length-1000 input → 1024 bins (zero-padded UP, by contract — not a truncation).
THROWS: NaN/Infinity in input with offending index (verified) — corrupted audio is never laundered into a spectrum.
GOTCHA: for non-power-of-2 input the output is LONGER than the input; pass power-of-2 lengths for exact-size spectra. `ifft` is the exact inverse and also throws on bad bins.

### feature.melspectrogram — mel-scaled power spectrogram (sync, node+browser)
`feature.melspectrogram(y: Float32Array|null, opts?: {sr?=22050, S?=null, n_fft?=2048, hop_length?=512, win_length?=null, window?='hann', center?=true, pad_mode?='constant', power?=2.0, n_mels?=128, fmin?=0, fmax?=null(→sr/2), norm?='slaney', htk?=false}) → Array<Float32Array>[n_mels][n_frames] (power units)`
snake_case options (verified: `hop_length` honored, camel `hopLength` silently ignored).
THROWS: missing y and S; NaN in signal.

### feature.mfcc — mel-frequency cepstral coefficients (sync, node+browser)
`feature.mfcc(y: Float32Array|null, opts?: {sr?=22050, S?=null(LOG-power mel), n_mfcc?=20, dct_type?=2(only 2), norm?='ortho'|null, lifter?=0, mel_norm?='slaney', ...melspectrogram opts}) → Array<Float64Array>[n_mfcc][n_frames]`
snake_case options! Verified: `n_mfcc:13` → 13 rows; camel `nMfcc:13` silently ignored → 20 rows.
THROWS: neither y nor S provided; dct_type other than 2.
GOTCHA: `S` must be a LOG-power mel spectrogram (`convert.power_to_db(feature.melspectrogram(...))`), not raw power.

### feature.chroma_stft — 12-bin chromagram (sync, node+browser)
`feature.chroma_stft(y: Float32Array|null, opts?: {sr?=22050, S?=null(POWER spectrogram), norm?=Infinity, tuning?=null(estimated from input), n_chroma?=12, ctroct?, octwidth?, filter_norm?, base_c?, + snake_case spectrogram opts}) → Array<Float64Array>[n_chroma][n_frames] (per-frame max-normalized energy)`
snake_case (verified: `n_chroma:24` → 24 rows; camel `nChroma` silently ignored → 12).
THROWS: missing y and S.
GOTCHA: `tuning:null` runs tuning estimation on every call — pass `tuning:0` to skip it when speed matters.

### feature.spectral_centroid — brightness in Hz per frame (sync, node+browser) [+ siblings]
`feature.spectral_centroid(y: Float32Array|null, opts?: {sr?=22050, S?=null, n_fft?=2048, hop_length?=512, win_length?, window?='hann', center?=true, pad_mode?='constant', freq?}) → Float64Array(Hz per frame)`
Verified: 440 Hz sine → 440.2 Hz. snake_case (camel `hopLength` silently ignored — verified).
Siblings, same call shape & casing: `spectral_bandwidth`→Float64Array(Hz), `spectral_rolloff`→Float64Array(Hz), `spectral_flatness`→Float64Array(0..1), `spectral_contrast`→[n_bands+1][frames](dB), `rms`→Float64Array(linear amplitude; 0.5-amp sine → 0.353), `zero_crossing_rate`→Float64Array(fraction 0..1; 440 Hz @ 22050 → 0.040).
THROWS: ParameterError on missing y and S.

### loop.detect — loop-point detection (ASYNC, node+browser)
`await loop.detect(buffer: AudioBuffer|shim, opts?: {strategy?='fast', bpm?, minLoopDuration?, maxLoopDuration?, searchStart?, searchEnd?, hopLength?=512, maxFrames?=1500, minConfidence?=0.1, rqa?=false, snapToZero?=true}) → Promise<{strategy, loopStart(s), loopEnd(s), loopStartSample, loopEndSample, confidence(0..1), bpm?(BPM), details}>`
Returns a Promise (verified). Input is an AudioBuffer OR any shim exposing `{getChannelData(i), sampleRate, length, duration}` (verified with a plain object). Strategies: `fast`=energy-based; `precise`=sample-accurate refinement; `musical`=bar-aligned via beat tracking; `recurrence`=chroma self-similarity — its result has NO `bpm` field (verified). `hopLength`/`maxFrames`/`minConfidence`/`rqa`/`snapToZero` apply to 'recurrence' only; `bpm`/duration/search opts to 'precise'/'musical'.
THROWS (rejects): silence (signal-evidence gate names the RMS threshold); unknown strategy (lists the four); failed confidence gate (suggests alternatives). camelCase options (verified: `minConfidence:1.01` trips the gate; snake `min_confidence` silently ignored).
COST: recurrence is O(frames²) — hop auto-scales to stay under `maxFrames` (recorded in diagnostics, never a strategy switch).

### decompose.hpss — harmonic/percussive separation (sync, node+browser)
`decompose.hpss(S: Array[freq][time] of magnitudes or {real,imag}, opts?: {kernel_size?=31, power?=2.0, mask?=false, margin?=1.0}) → {harmonic, percussive} (same shape/units as S; masks in 0..1 when mask:true)`
snake_case (`kernel_size` verified). Complex input gets phase reapplied to both outputs. Default returns MASKED components: harmonic + percussive ≈ S at margin=1.
THROWS: empty input; margin < 1 (verified: "margins must be >= 1.0").
GOTCHA: operates on a SPECTROGRAM, not a waveform — feed it |stft(y)| (or complex stft), then `istft` each component back.

### decompose.nn_filter — nearest-neighbor frame filtering / REPET-SIM (sync, node+browser)
`decompose.nn_filter(S: Array[features][frames], opts?: {rec?=null, aggregate?='mean'|'median'|'average'|fn, + recurrenceMatrix opts (metric, width, k, sym, mode, bandwidth, self, full)}) → Float64Array[](same shape as S)`
Vocal-separation configuration = `{aggregate:'median', metric:'cosine', width:N}` (REPET-SIM). Frames with no neighbors pass through unchanged.
THROWS: empty input; bad `rec` shape; unknown aggregate (verified: names the supported set).
GOTCHA: with few frames the auto recurrence graph throws a width-bound error from recurrenceMatrix — needs ≥ 2·width+1 frames.

### decompose.softmask — robust soft masking (sync, node+browser)
`decompose.softmask(X: Array[rows][cols], X_ref: same shape, opts?: {power?=1, split_zeros?=false}) → Float64Array[](mask in 0..1, same shape)`
`M = X^p / (X^p + X_ref^p)`, rescale-stabilized; `power: Infinity` gives a hard mask. Verified [[1,2],[3,4]] vs ones → [[0.5,0.667],[0.75,0.8]].
THROWS: shape mismatch (verified "1x2 != 2x2"); negative input; power <= 0.

### segment.recurrenceMatrix — self-similarity matrix (sync, node+browser)
`segment.recurrenceMatrix(data: (d,n) matrix | flat + {nFeatures,nFrames}, opts?: {k?=null(auto 2*ceil(sqrt(t-2*width+1))), width?=1, metric?='euclidean', sym?=false, mode?='connectivity'|'distance'|'affinity', bandwidth?=null, self?=false, full?=false}) → Float64Array[][t][t]`
NOTE the camelCase NAME: `segment.recurrence_matrix` does not exist (verified undefined).
THROWS: width out of bounds vs frame count; unsupported bandwidth estimator.
GOTCHA: orientation is the transposed graph — `rec[i][j] != 0` means column i is a k-NN OF column j. Cost O(t²·d).

### segment.agglomerative — temporally-constrained bottom-up segmentation (sync, node+browser)
`segment.agglomerative(data: (d,n) matrix | flat + {nFeatures,nFrames}, k: number, opts?) → Uint32Array(left-boundary FRAME indices, always starts with 0)`
Ward-linkage merging of ADJACENT segments only, until k remain. Verified: Uint32Array [0,304,322,325] for k=4.
THROWS: k > n_frames (verified: "k=5 cannot exceed the number of frames (3)").
GOTCHA: returns boundaries, not labels; convert with `convert.frames_to_time(boundaries, sr, hop_length)`.

### segment.laplacianSegmentation — structural segmentation, spectral clustering (sync, node+browser)
`segment.laplacianSegmentation(features: (d,n) matrix | {recurrenceFeatures, pathFeatures}, opts?: {k?=5, width?=3, mu?=0.5}) → {segmentIds: Int32Array(label per frame), boundaries: number[](internal segment-onset frames)}`
Two-feature form verified: chroma for repetition + MFCC for continuity, same frame count required; ABAB test audio segmented at ~2 s multiples with alternating ids.
THROWS: frame-count mismatch between the two feature matrices (verified, message states both counts); degenerate constant feature stream ("path bandwidth σ=0" — verified) instead of returning junk segments.
COST: eigendecomposition of an n×n graph — keep n (frames) modest or beat-sync features first.

### sequence.dtw — dynamic time warping (sync, node+browser)
`sequence.dtw(X: (d,N)|null, Y: (d,M)|null, opts?: {C?=null(precomputed cost (N,M)), metric?='euclidean', stepSizesSigma?=null(APPENDED to defaults), weightsAdd?, weightsMul?, subseq?=false, backtrack?=true, globalConstraints?=false, bandRad?=0.25, returnSteps?=false}) → {D: Float64Array[](N,M accumulated cost; D[N-1][M-1] = total), wp?: [n,m][], steps?}`
camelCase options (`bandRad` verified to change banded cost). Rows are features, columns are frames.
THROWS: neither C nor X/Y supplied (verified).
GOTCHA: `wp` runs END → START (verified [4,5] … [0,0]) — reverse it for chronological order. Custom `stepSizesSigma` are appended to the defaults, not replacing them.

### sequence.viterbi — HMM path decoding (sync, node+browser)
`sequence.viterbi(prob: [state][frame] likelihoods, transition: [n,n] row-stochastic, p_init?=null(uniform), return_logp?=false) → number[](state per frame) | {states, logp}`
Verified: [0,0,1] decode; `{states,logp}` form. Sibling `viterbi_discriminative(prob, transition, p_state?, p_init?, return_logp?)` for per-frame posteriors.
THROWS: shape errors.
GOTCHA (demonstrated): transition rows are NOT validated for row-stochasticity — rows summing to 1.4 decode without error; garbage in, garbage out.

### sequence.rqa — recurrence quantification / path alignment (sync, node+browser)
`sequence.rqa(sim: (N,M) non-negative SIMILARITY matrix, N,M >= 2, opts?: {gapOnset?=1, gapExtend?=1, knightMoves?=true, backtrack?=true}) → {score: Float64Array[](N,M), path?: [n,m][] (may be empty)}`
Alignment is MAXIMIZED (Serrà 2009) — the opposite convention from dtw.
THROWS: gap penalties < 0; matrices smaller than 2×2.
GOTCHA (demonstrated): negative sim values are NOT rejected — feeding a distance matrix returns meaningless paths without error. Convert distance → similarity first.

### pyin — probabilistic f0 + voicing (sync, node+browser)
`pyin(y: Float32Array, fmin: number(Hz, REQUIRED), fmax: number(Hz, REQUIRED), sr?=22050, opts?: {frame_length?=2048, hop_length?=null(→frame_length/4), n_thresholds?=100, beta_parameters?=[2,18], boltzmann_parameter?=2, resolution?=0.1, max_transition_rate?=35.92, switch_prob?=0.01, no_trough_prob?=0.01, fill_na?=NaN, center?=true}) → {f0: Float64Array(Hz; fill_na when unvoiced), voiced_flag: boolean[], voiced_prob: Float64Array(0..1)}`
snake_case options (verified: `frame_length` honored, camel `frameLength` silently ignored). Verified 439.7 Hz / voiced=true on a 440 sine.
THROWS: fmin >= fmax (verified); fmax > sr/2.
COST: threshold ensemble + Viterbi over a semitone-resolution pitch grid — by far the heaviest pitch call; use `yin` when voicing detail isn't needed.

### yin — fast f0 estimation (sync, node+browser)
`yin(y: Float32Array, fmin?=80, fmax?=400, sr?=22050, frame_length?=2048, win_length?=frame_length/2, hop_length?=frame_length/4, trough_threshold?=0.1) → Float32Array(Hz per frame; 0 = unvoiced)`
POSITIONAL-ONLY — there is no options object. Verified 440.1 Hz on a 440 sine.
THROWS: fmin >= fmax.
GOTCHA (demonstrated): passing an options object as the 2nd arg is NOT an error — `yin(y, {fmin:80, fmax:800})` silently returns all-zero (unvoiced) frames. Also note default fmax=400 misses anything above G4; set fmax explicitly for melodic material.

### decodeWav — WAV → planar Float32 channels (sync, node+browser+worker)
`decodeWav(buffer: ArrayBuffer) → {channels: Float32Array[], sampleRate: number}`
PCM 16/24/32-bit int and 32-bit float; standard RIFF chunk walking. Verified stereo round-trip.
THROWS: non-RIFF/WAVE input.
GOTCHA (demonstrated): in Node, `buf.buffer` of a pooled Buffer is the WHOLE 8 KB pool at a nonzero offset — passing it threw "not a RIFF/WAVE file". Always slice: `buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`. `readFileSync` buffers often start at offset 0, so the naive form "works" until a pooled buffer arrives.

### encodeWav — planar Float32 channels → WAV (sync, node+browser+worker)
`encodeWav(channels: Float32Array[], sampleRate: number) → ArrayBuffer(complete RIFF/WAVE file)`
Interleaved 16-bit PCM output — float input is quantized. The single canonical codec (replaces three divergent legacy encoders, two of which garbled stereo).
THROWS: channels of unequal length (verified).

### convert — unit conversions namespace (sync, node+browser)
`convert.hz_to_midi(440)→69 · midi_to_hz(69)→440 · hz_to_note(440)→'A4' · note_to_hz('A4')→440 · frames_to_time(frames, sr?=22050, hop_length?=512, n_fft?)→seconds (100→2.322) · time_to_frames(times, sr?=22050, hop_length?=512, n_fft?)→frames (floors: 2.32→99)`
All snake_case names; positional args; scalars OR arrays in, matching shape out (verified [440,880]→[69,81]).
Also in the namespace: samples_to_time/time_to_samples, frames_to_samples/samples_to_frames, power_to_db/db_to_power, amplitude_to_db, hz_to_mel/mel_to_hz, fft_frequencies, tempo_frequencies, A/B/C/D/Z weightings.
GOTCHA: `time_to_frames` floors (librosa-style), so `frames_to_time(time_to_frames(t))` <= t — don't round-trip boundaries through it.

## Discrepancy appendix (verification vs .d.ts / task assumptions)

1. **`beat_track` on silence does not throw.** The .d.ts THROWS line ("missing/empty input or invalid parameters") is technically satisfied, but a silent (all-zero-envelope) input returns `{tempo: 0, beats: []}` (deliberate in src: "No onsets at all → 0 BPM and no beats") while `tempo()` throws on the exact same input. Asymmetric contract; `tempo: 0` is a sentinel a naive consumer could treat as a measurement.
2. **`segment.recurrence_matrix` does not exist** (the task's assumed snake_case name). The canonical export is camelCase `segment.recurrenceMatrix` — an exception to the snake_case convention used elsewhere in the analysis surface (and distinct from the legacy `recurrence.recurrenceMatrix`, which has a different positional signature).
3. **`tempo` default-hop accuracy:** a mathematically exact 120.00 BPM click returns 117.45 at the default `hopLength:512` (lag quantization), 120.19 at 256. Within documented behavior (lag-binned tempogram) but a ~2% error agents should expect at defaults.
4. **`sequence.viterbi` does not validate row-stochasticity** of `transition` despite the .d.ts describing it as "Row-stochastic": rows summing to 1.4 decode silently. Requirement, not enforced contract.
5. **`sequence.rqa` does not validate non-negativity** of `sim` despite the .d.ts stating "non-negative": a matrix containing −1 returns a result without error.
6. **`stft` .d.ts JSDoc lists pad modes "('reflect', 'constant', 'edge')" without stating the default;** src default is `'constant'` (librosa-style 'reflect' is NOT the default here).
7. **`loop.detect` strategy 'fast' has no confidence gate:** on a clean click track it returned confidence 0.01 without throwing, while 'recurrence' enforces `minConfidence`. Documented per-strategy but easy to misread as a uniform quality guarantee.
