# Proof-of-Work Demo Plan (interim goal: verify all our work paid off)

**Scope:** 101 decision units across 6 domains. Demos are for-us proofs, not customer pages.
**Statuses:** {'canonical': 57, 'internal': 3, 'needs-repair': 30, 'demo-only': 3, 'shim': 8}  ·  **Surfaces:** {'both': 17, 'node': 36, 'web': 34, 'none': 3}  ·  **Tiers:** {2: 45, 1: 27, 3: 15}

Placement: `examples/web/*.html` (standalone, load `packages/pleco-xa/dist/pleco-xa.js` directly) and `examples/node/*.mjs` (plain `node` runnable, nonzero exit on failed proof). Coverage manifest gates the goal.


## Tier 1

### scripts/xa-convert.js — Unit-conversion golden table
- **surface:** node · **viz:** none · **domain:** Core DSP & Conversions
- **scenario:** Print a pass/fail table of definitional golden values: hz_to_midi(440)==69, midi_to_note(69)=='A4', note_to_hz('C4')~=261.63, amplitude_to_db(0.5)~=-6.0206, db_to_amplitude(amplitude_to_db(x))==x, mel_to_hz(hz_to_mel(1000))==1000 (Slaney), a_weighting(1000)==0.000 dB (A-weighting is zero at 1kHz by definition), time_to_frames(frames_to_time(100))==100. Each row shows got/expected/PASS-FAIL; exit code 1 on any FAIL.
- **proof:** All eight golden values verified by spot-run: midi 69, A4, 261.63, -6.021 dB, mel roundtrip 1000.00, A-weight(1000)=0.000, frame roundtrip 100.

### io/wav.js — Stereo WAV roundtrip + interleave regression proof
- **surface:** node · **viz:** none · **domain:** Core DSP & Conversions
- **scenario:** Encode planar stereo (440Hz sine on L, 880Hz on R, sr=44100) with encodeWav, write to a temp .wav, read back, decodeWav, then assert: sampleRate==44100, channels.length==2, per-sample maxErr <= 1/32767 (16-bit quantization floor), and — the regression that motivated this module — zero-crossing count of decoded L corresponds to 440Hz and R to 880Hz (channels NOT swapped/garbled, proving interleaved layout matches the header). Printed table + exit code.
- **proof:** Verified by spot-run: roundtrip sr 44100, 2 channels, maxErr 0.000030 (~1/32768). The L=440/R=880 channel-identity assert directly proves the fix for the three legacy encoders that wrote channel-block PCM under an interleaved header.

### scripts/xa-cache.js — Call-count LRU proof
- **surface:** node · **viz:** none · **domain:** Core DSP & Conversions
- **scenario:** Instrument a counter fn (x)=>{calls++; return x*2}. Asserts: (1) new LRUCache(2).eval(fn,5) twice -> calls==1 (hit); (2) eval(6) then eval(7) evicts key 5, so eval(5) again -> calls==4 (LRU eviction order proven); (3) wrapper(fn,10) called twice with same arg -> wrapper.cache.size()==1; (4) memoize on object arg uses WeakMap (same object twice -> one call). Print cache.format() line and the calls-vs-expected table, exit nonzero on mismatch.
- **proof:** Verified by spot-run: calls 1 after repeat, calls 4 after eviction cycle, wrapper cache size 1, format() prints LRUCache(size=2/2, keys=['slow:[7]', 'slow:[5]']).

### scripts/xa-normalize.js — Normalization exactness proof
- **surface:** node · **viz:** none · **domain:** Core DSP & Conversions
- **scenario:** Feed known vector [0.1,-0.5,0.25]: assert normalize(v) (inf-norm) == [0.2,-1.0,0.5] exactly and max|out|==1; assert rms_normalize(v, 0.1) produces measured RMS 0.1000 within 1e-6 (recompute RMS on output); assert softmask([1,2],[1,2]) == [0.5,0.5] (equal energy -> half mask, librosa-correct form); assert crossfade(len4, len4, overlap 2).length == 4+4-2 == 6 and the overlap midpoint equals the linear blend. Printed got/expected table, exit code on failure.
- **proof:** Verified by spot-run: inf-norm gives 0.20,-1.00,0.50; post-normalize RMS measures 0.1000; softmask equal-input = 0.5; crossfade length 6.

### scripts/xa-onset.js — Onset envelope + detected onsets vs known click positions
- **surface:** both · **viz:** line-plot · **domain:** Rhythm
- **bundle with:** scripts/xa-beat-tracker.js
- **scenario:** Same 120 BPM click-train page/script as xa-beat-tracker (shared demo page). Run onset_strength(y,{sr}) and onsetDetect(y, sr). Node: print onset count, first 5 onset times vs true click times, median inter-onset interval; exit code asserts. Web: plot the onset-strength envelope as a line under the waveform with detected-onset ticks; pass/fail badge.
- **proof:** onset_strength length == ceil(len/hop) == 431 frames for 10s; 19-20 onsets detected for 20 clicks; median inter-onset interval within 1 hop (23.2ms) of 0.500s (spot-run: intervals 0.488-0.511s); every detected onset within 100ms (one n_fft window, STFT is uncentered) of a true click time.
- **repair first:** Minor: onsetsToBeats returns a fabricated default {bpm:120} when <2 onsets (house-rule violation); onsetDetect leaves console.time noise on; computeSTFT is uncentered so onsets read up to ~93ms early vs librosa.

### scripts/kick-snare-detector.js — Transient snap: kick+snare at a known sample, plus a negative control
- **surface:** node · **viz:** none · **domain:** Rhythm
- **scenario:** Synthesize 3s of low-level noise floor with one composite hit (60Hz sine burst + white-noise burst, 30ms) at exactly t=1.000s. Call findKickSnareHit(y, sr, {start: 0.95, end: 2.95, duration: 2.0}) and assert the returned start is within 25ms of 1.020s (detector applies an intentional +20ms beat-center offset) with kickSnareDetected===true. Negative control: same call on a pure steady 220Hz sine must return null (no transient). Print a two-row pass/fail table, nonzero exit on failure.
- **proof:** |result.start - 1.020s| <= 0.025s and result.kickSnareDetected === true for the hit signal (spot-run on clicks: loop.start 0.5 snapped to 0.504); result === null for the steady-sine control.

### scripts/musical-timing.js — Beat-alignment golden table at 120 BPM
- **surface:** node · **viz:** none · **domain:** Rhythm
- **scenario:** Print a golden table of calculateBeatAlignment(loopLength, 120) for loop lengths [0.5, 1.0, 2.0, 4.0, 8.0, 1.87, 2.3, 3.1]s and assert: every whole-beat power-of-two length (1,2,4,8,16 beats) scores exactly 1.0; 1.87s scores 0.779 +/- 0.001 (golden from spot-run); all off-grid lengths score strictly less than every on-grid length. Exit code reflects asserts.
- **proof:** f(2.0,120)=1.0, f(4.0,120)=1.0, f(1.87,120)=0.7790 (golden, measured), and max(off-grid scores) < 1.0.

### scripts/beat-presets.js — Preset data contract check
- **surface:** node · **viz:** none · **domain:** Rhythm
- **scenario:** Pure data module (op patterns for the quantum sequencer). Node script asserts the data contract: all 6 presets have exactly 8 steps; every op is in the vocabulary {silence, half, move, reverse, stutter, double}; allPresets.length === 6; 100 calls to randomPreset() each return a member of allPresets. Printed pass/fail table, exit code.
- **proof:** 6 presets x 8 steps, zero out-of-vocabulary ops, randomPreset always returns an element of allPresets (spot-run: n=6, rand length 8).

### filters/index.js — Chroma filterbank Gaussian bumps
- **surface:** web · **viz:** matrix-heatmap · **domain:** Spectral & Features
- **bundle with:** feature/chroma.js
- **scenario:** Section of the chroma demo page: render chroma({sr:22050, n_fft:2048}) as a 12 x 1025 heatmap over a Hz x-axis (librosa gallery 'chroma filterbank' plot - shows Gaussian pitch-class bumps and the octave-dominance envelope). Badge asserts argmax pitch class at the FFT bin nearest 440 Hz = 9 (A) and every column's L2 norm <= 1 + 1e-6.
- **proof:** Spot-run: shape 12x1025, argmax class at the 440 Hz bin = 9.

### scripts/xa-mel.js — Slaney mel filterbank triangles
- **surface:** web · **viz:** line-plot · **domain:** Spectral & Features
- **bundle with:** feature/mfcc.js, scripts/xa-display.js
- **scenario:** Section of the mel/mfcc demo page: line-plot the first 12 slaney-normalized mel triangles of mel_filterbank(22050, 2048, 40) over a Hz axis (librosa gallery classic). Badge asserts the slaney boundary identities hz_to_mel(1000)=15.0 and mel_to_hz(15)=1000.0 exactly, filterbank shape 40 x 1025, and each triangle peak equals 2/(mel_f[i+2]-mel_f[i]) within 1e-6.
- **proof:** Spot-run: mel_filterbank shape 128x1025; legacy positional mfcc shim returns 13x44 and matches feature/mfcc output path.

### scripts/xa-pitch.js — YIN known-frequency table ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Spectral & Features
- **scenario:** Node script: synthesize 110/220/330/440 Hz sines (1 s, sr=22050) plus 0.5 s of silence; run yin(fmin=80, fmax=500) on each; print table [expected | median detected | delta] asserting |delta| < 1 Hz per tone and f0=0 for silence; exit 1 on any miss. pyin intentionally excluded until it is a real pYIN.
- **proof:** Spot-run: yin median 220.01 Hz on 220 Hz sine (40 frames).
- **repair first:** yin is verified good (spot-run: median 220.01 Hz on a 220 Hz sine). pyin is NOT real pYIN - confirmed: no HMM/Viterbi decoding, boltzmann_parameter and beta shape accepted but unused (the real pYIN machinery sits in dead, never-called private helpers __pyin_helper/_cumulative_mean_normalized_difference), 'thresholds' are raw beta PDF values (not librosa's CDF-spaced threshold grid), final f0 is just the median across a 100-threshold YIN ensemble, and it recomputes the full CMND per threshold - 100x redundant work (1.25 s for 1 s of audio vs yin's ~10 ms). It happens to return 220.01 on a clean sine but will not degrade like pYIN on noisy input. Also: piptrack here uses an absolute magnitude threshold (librosa uses per-frame threshold*max - feature/chroma.js piptrackPeaks is the parity version), and pitch_tuning/estimate_tuning duplicate feature/chroma.js with divergent histogram semantics.

### scripts/SpectrumAnalyzer.js — Live oscillator spectrum with peak-bin badge ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** line-plot · **domain:** Spectral & Features
- **scenario:** Web page: OscillatorNode at 1000 Hz -> RealtimeSpectrumAnalyzer (fftSize 4096, bars, logScale) -> start(). After 500 ms, read analyser.frequencyData, compute argmax bin -> Hz (bin * sr/fftSize); badge asserts |peak - 1000| <= sr/4096 (~10.8 Hz at 44.1k). Buttons to sweep the oscillator and watch the peak track. Pass/fail badge.
- **proof:** argmax of getByteFrequencyData = 1000 Hz +/- 1 bin while the oscillator runs.
- **repair first:** renderStaticSpectrum always throws: after offline rendering it constructs new RealtimeSpectrumAnalyzer(canvas, {sampleRate}, opts) with a fake context that has no createAnalyser() -> TypeError in the constructor; the approach is also unsound (AnalyserNode.getByteFrequencyData after OfflineAudioContext.startRendering reflects only the final render quantum, and the analyser is not connected to destination). Should compute the spectrum with xa-fft instead. createSpectrogram uses a hand-rolled O(n_fft^2) DFT per frame (2048-size frame = ~2M mults/frame -> multi-second hangs for even short clips) - swap in xa-fft stft. RealtimeSpectrumAnalyzer itself (live AnalyserNode bars/line/filled + grid) reads clean and is the keeper, but is browser-only and never verified.

### scripts/WaveformRenderer.js — Peaks render + loop-region overlay with pixel assert ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** waveform · **domain:** Spectral & Features
- **bundle with:** scripts/analysis/WaveformData.ts
- **scenario:** Web page: generate a 3 s 440 Hz sine AudioBuffer with a silent middle third; getWaveformPeaks({width:800}) -> renderWaveform(canvas, peaks, {style:'peaks', mirror:true, pixelRatio:1}) -> addLoopRegions([{start:1.0, end:2.0}], 3). Badge asserts via ctx.getImageData: (a) a pixel at mid-height inside the first (loud) third is waveform-colored, (b) the same row inside the silent third is background, (c) a pixel inside 1.0-2.0 s carries the loop overlay tint. Pass/fail badge.
- **proof:** Three pixel probes match expected colors; silent-third probe proves amplitude mapping, overlay probe proves time->x mapping (x = t/duration * width).
- **repair first:** renderStereoWaveform crashes: calls nonexistent ctx.clipRect() (Canvas API needs rect()+clip()), and even fixed, it re-invokes renderWaveform which clearRects and re-scales the whole canvas, ignoring the translate - needs per-channel offscreen or region-aware rendering. renderWaveform's HiDPI block compounds: it reads width=canvas.width then sets canvas.width = width*pixelRatio on EVERY call, so under createInteractiveRenderer (which re-renders on every mousemove during selection) the canvas grows by pixelRatio each frame on retina displays - resize must be idempotent. Core single-shot renderWaveform (peaks/bars/line/filled), addLoopRegions, and the interactive event plumbing read correctly otherwise; never browser-verified. createInteractiveRenderer silently divides by duration=0 unless setDuration is called first.

### scripts/analysis/WaveformData.ts — Waveform stats vs analytic sine truth
- **surface:** both · **viz:** none · **domain:** Spectral & Features
- **bundle with:** scripts/WaveformRenderer.js
- **scenario:** One scenario, two runtimes (proves the environment-blind claim - only needs a {getChannelData,...} duck-typed buffer, no Web Audio): 0.5-amp 440 Hz sine, 2 s at 44.1k. analyzeWaveform asserts peak 0.500 +/- 0.002, rms 0.3536 +/- 0.002 (A/sqrt2), zeroCrossingRate 0.01995 +/- 0.0005 (2f/sr), crestFactor 1.414 +/- 0.01; getWaveformPeaks({width:800}) asserts length 800 and max=1 when normalized. Node: mock buffer object, printed table, exit code. Web: same asserts as a badge on the WaveformRenderer demo page, sourced from a real AudioBuffer.
- **proof:** Spot-run (node 25 native type-stripping): peak 0.5000, rms 0.3536, zcr 0.01994, crest 1.414, 800 normalized peaks - all pass.

### loop/primitives.js — Zero-Crossing Snap + LoopController State Machine
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **scenario:** Generate a 440Hz sine at 44.1kHz. (a) snapToZeroCrossings(data, 5000, 30000): assert |data[snappedStart]| and |data[snappedEnd]| < 5e-3 and each snapped index within ±441 of the request. (b) LoopController walk: setLoop(0.25,0.5) → halfLoop() → {0.25,0.375} → doubleLoop() → {0.25,0.5} → moveLoopForward() → {0.5,0.75} → resetLoop() → {0,1}, asserting each exact result object; (c) minimum gate: with minLoopDuration=0.05 on a 1s buffer, halving a 60ms loop returns {success:false, reason} — assert the honest refusal. Printed table + exit code.
- **proof:** All snapped samples <5e-3 amplitude (a 440Hz cycle is 100 samples, so a crossing always exists within the 441-sample window); the 6-step controller walk yields the exact normalized bounds listed; the sub-minimum half returns success:false.

### loop/score.js — Confidence Convention Ground Truth
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **scenario:** Golden-number table: NCC(x,x)=1.0 exactly; NCC(x,−x)=−1.0; NCC(constant, anything)=0 (zero-variance guard, no NaN); clamp01(NaN)=0. measureLoopConfidence: a 440Hz sine with loop bounds spanning an exact integer number of periods followed by identical trailing audio → ≥0.999; white noise with arbitrary bounds → <0.2; loop with <25% trailing audio available → exactly 0 (the honest 'cannot measure'). Print expected vs actual per row, exit non-zero on any mismatch.
- **proof:** Six-row table all PASS: 1.0 / −1.0 / 0 / 0 / ≥0.999 / <0.2 / exact 0.

### core/GibClock.js — Drift-Corrected Clock Proof
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** core/loopPlayground.js
- **scenario:** Run a 20ms GibClock for 2s (100 ticks) recording performance.now() per tick, alongside a naive chained setTimeout(20) control. Assert GibClock mean interval 20±1ms and cumulative drift at tick 100 < 20ms (one tick), while printing the naive chain's drift for contrast (typically 50ms+); print a sparkline of per-tick interval error. Also assert offTick removes a listener (its counter stops) and stop() halts ticks. Exit code on the drift bound.
- **proof:** Verified live: 6 ticks in 130ms at 20ms interval (expected ~6). Demo asserts cumulative drift < 20ms over 100 ticks vs visibly larger naive drift.

### core/demoSequences.js — Signature Choreography (deterministic)
- **surface:** web · **viz:** waveform · **domain:** Loop & Play Layer
- **bundle with:** core/loopPlayground.js
- **scenario:** Section of the glitch playground page: signatureDemo is fully deterministic (no rng) — run its 15 steps against the loaded WAV with a 'play signature' button; badge 1 asserts the op log equals the canonical sequence (verified live: half,half,half,reverse,move forward,reverse,move forward,reverse,double,reverse,double,reverse,double,move forward,reverse); badge 2 asserts the final loop bounds equal the precomputed expectation for the file's length (pure arithmetic on halve/double/move); waveform overlay animates each step as it auditions.
- **proof:** Op log exact match (15 ops), final {startSample,endSample} equals the closed-form expectation, choreography is audibly the same every run.

### core/loopHelpers.js — Loop Descriptor Algebra
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **scenario:** Pure invariant table on a 1s/44.1kHz buffer (all verified live): fullBufferLoop → {0,44100}; halfLoop → {0,22050}; doubleLoop clamps endSample at maxSamples; moveForward clamps start to maxSamples−len; resetLoop === fullBufferLoop; detectLoop(buffer) deep-equals fullBufferLoop(buffer) (deprecated-alias contract); reverseBufferSection applied twice restores the buffer bit-exactly (PASS live). Print table + exit code.
- **proof:** All 7 rows PASS; reverse-twice identity maxDiff 0.

### scripts/LoopPlayer.js — Native Seamless Loop Playback
- **surface:** web · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** loop/detect.js
- **scenario:** Load 'Bassline For Doppler Song longer.wav', setLoopPoints(11.9886, 14.6008) — the golden loop from the detect demo — and play. Badges: (1) loop cycle timing — using an AnalyserNode energy fingerprint at the loop-start transient, measure wall-clock time between successive loop restarts over 3 cycles and assert ≈2.612s (loopEnd−loopStart) ±20ms, proving native source.loop honors the points; (2) setVolume(0.1) changes gainNode.gain.value to 0.1 (assert); (3) play() while suspended resumes the context (state === 'running' after user gesture).
- **proof:** Cycle time 2.612±0.02s over 3 consecutive loops; gain assert exact; audible seamless loop of the golden region.

### sequence/matching.js — Event/interval matching goldens incl. the fractional-seconds regression proof
- **surface:** node · **viz:** none · **domain:** Effects, Decompose & Structure
- **bundle with:** sequence/dtw.js, scripts/xa-matching.js
- **scenario:** Bundled into the DTW demo page/script as a golden table: (1) matchEvents([0.5,1.5,2.5],[0,1,2,3]) — the documented librosa tie-handling golden; (2) matchIntervals of [[0,1],[1,2]] against overlapping+disjoint targets; (3) REGRESSION: matchEvents([0.4,0.6],[0.45,1.0]) must map BOTH to index 0 — under the legacy Uint32Array truncation bug all sub-integer times floored to 0 and this failed; (4) strict=true throw on a fully disjoint query.
- **proof:** Golden (1) returns Int32Array [1,2,3] exactly (verified); (2) returns Uint32Array [0,1] exactly (verified); (3) returns [0,0] proving full float precision; (4) throws with the documented message. Printed table, nonzero exit on mismatch.

### scripts/xa-notation.js — Post-repair: notation golden table vs librosa ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Effects, Decompose & Structure
- **scenario:** Pure golden-table script: mela_to_svara(22)/(1)/(65) vs librosa outputs; key_to_notes('Eb:maj') and ('A:min') full 12-name spelling vs librosa goldens; thaat_to_degrees for all 10 thaats vs librosa THAAT_MAP; fifths_to_note walk C +1..+12 fifths -> [G,D,A,E,B,F#,C#,G#,D#,A#,E#,B#] and B +1 -> F#. Print table, exit nonzero on any mismatch.
- **proof:** Every row equals the librosa golden exactly; the three currently-failing rows (mela_to_svara 22, key_to_notes A:min, thaat kafi, fifths_to_note B+1) flip from FAIL to PASS after repair.
- **repair first:** Runtime-confirmed table/logic bugs: (1) mela_to_svara cannot emit G1/G2/N1/N2 — degree->name map is single-valued, so mela 22 returns [S,R2,R3,M1,P,D2,D3] instead of its own docstring's [S,R2,G2,M1,P,D2,N2]; fix by slot-aware naming (R slot vs G slot, D vs N) like librosa. (2) key_to_notes SILENTLY falls back to C:maj for every minor key and any unknown key (A:min returns sharp C-major spelling); KEY_NOTE_NAMES mixes pitch-class-indexed (C:maj) and tonic-rotated (D:maj starts at 'D') conventions — replace the hand table with circle-of-fifths spelling like librosa. (3) THAAT_MAP kafi=[0,2,3,5,7,8,10] duplicates asavari; librosa kafi=[0,2,3,5,7,9,10]. (4) fifths_to_note only works from C-adjacent unisons: fifths_to_note('B',1)->'F' (should be F#); accidental count floor((fifths+1)/7) ignores the unison's circle position; __fifth_search result computed then discarded. (5) hz_to_fjs/interval_to_fjs are cents-threshold approximations, not real FJS. Verified correct and keepable: mela_to_degrees (22 -> [0,2,3,5,7,9,10]), key_to_degrees, hz_to_svara_h, MELA_MAP names.

### scripts/compression.js — Two compressors, one tone: pitch-changing vs pitch-preserving, measured
- **surface:** both · **viz:** none · **domain:** Effects, Decompose & Structure
- **scenario:** 440Hz 1s tone buffer -> pitchBasedCompress(buf, 0.8) and tempoBasedCompress(buf, 0.8). Web: play all three (original, record-speed, phase-vocoder) with the measured pitch of each shown as a badge; Node: same numbers printed (packChannels' Node fallback makes this env-blind, verified).
- **proof:** Both outputs length 17640 (== 0.8 * 22050, verified exactly); pitchBased zero-crossing pitch 550Hz +/-2% (measured 549.4 — pitch rises by 1/ratio); tempoBased pitch 440Hz +/-1% (measured 440.0 — pitch preserved). Exit code / badge on the three assertions.

### scripts/xa-filters.js — Post-repair acceptance: shim round-trip + mel duplicate retired ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Effects, Decompose & Structure
- **bundle with:** effects/index.js
- **scenario:** Node script: (1) preemphasis/deemphasis shim round-trip maxErr < 1e-6 including the {y, zf} block-chaining convention across a 2-block split; (2) prove the re-pointed mel/get_window exports now agree with tools/parity/fixtures/mel_filterbank.json and windows.json rows within 1e-6 (i.e., the wrong local copies are gone).
- **proof:** Round-trip error < 1e-6; chained-blocks output equals single-call output exactly; mel filterbank row 0/64/127 match fixture values within 1e-6 (currently the local mel FAILS this — the fixture check is the repair gate).
- **repair first:** Split personality: preemphasis/deemphasis are verified shims to effects/index.js (KEEP — return {y, zf} object convention). Everything else is a marathon filterbank family, zero importers except the pleco-audio barrel, and duplicates src/filters/index.js canon: mel() here is WRONG — its htk=false 'slaney' branch uses 1127*ln(1+f/700), which is mathematically identical to the HTK formula (real Slaney is linear <1kHz, log above), and it snaps triangle corners to integer bins via floor((n_fft+1)f/sr) instead of librosa's continuous weights; chroma()/get_window() duplicate the fixture-gated versions in src/filters. _multirate_fb returns coefficient-less placeholder objects ('Coefficients would be computed here') and semitone_filterbank returns bare triangles — both placeholder-quality. Repair = keep the two shim exports, delete/re-point mel/chroma/get_window at src/filters, delete _multirate_fb/semitone_filterbank, and either fixture-gate or drop constant_q/wavelet/window_sumsquare/cq_to_chroma.

### plot_patch_generation — Fixed-size mel patches for ML pipelines ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Decode a bundled speech-like WAV; feature.melspectrogram; carve into patches with frame(melspec, {frameLength: time_to_frames(5.0), hopLength: time_to_frames(0.1)}); print a table of melspec shape, patch tensor shape, and patch count.
- **proof:** Exit code asserts n_patches == 1 + floor((T − L)/H) exactly and patches[...,1] elementwise-equals melspec[:, H:H+L] (view semantics correctness), printed as a pass/fail table.
- **repair first:** util frame/sync/fix_frames live in scripts/xa-util.js — spot-run OK (frame() on n=100, L=10, H=5 -> 19 frames; fix_frames([3,7,9],0,12) -> [0,3,7,9,12]) but unexported/unverified; promote + fixture. Note pleco's frame() copies rather than returning a strided view — librosa's zero-copy claim does not transfer; document as divergence.

### plot_presets — Presets as plain closures
- **surface:** node · **viz:** none · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Define makePreset({sr:44100, hop_length:1024, n_fft:4096}) wrapping feature.melspectrogram; run it on a synthesized 5 s signal, then with a hop_length:512 override, then with an sr:11025 preset; print a 3-row table of resulting shapes.
- **proof:** Exit code asserts each output's frame count == 1 + floor(N/hop) for its hop exactly and n_mels row count is constant across all three — proving parameter plumbing end to end.

### recordings — The house corpus: ex() with ground truth
- **surface:** node · **viz:** none · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Corpus-generator replica of librosa.ex(): a Node script synthesizes the shared demo assets (tone-440, chirp-110-880, click-track-120bpm, am-noise vocal stand-in) via encodeWav and writes manifest.json with each file's key, sr, duration, and ground-truth property; a verification pass re-decodes every file. All other demos import from this corpus for deterministic inputs.
- **proof:** Exit code asserts every decoded file's sr/duration match the manifest and each measured property holds (tone peak bin == 440 Hz ±1, click count == expected, chirp start/end frequency within ±1 bin).


## Tier 2

### scripts/xa-fft.js — FFT/STFT known-tone proof + spectrogram
- **surface:** both · **viz:** spectrogram · **domain:** Core DSP & Conversions
- **scenario:** Generate a 440Hz sine in-code (sr=8192, N=8192 so bin index == Hz exactly), run fft() and assert peak magnitude bin == 440; then stft(y, n_fft=1024, hop=256), render the magnitude spectrogram (canvas on web, printed per-frame peak-bin row on node), and run istft() back asserting interior reconstruction maxErr < 1e-4. Web shows two badges: 'peak bin = 440Hz +/-0' and 'istft roundtrip OK'; node prints the same two lines and exits nonzero on failure.
- **proof:** Verified by spot-run: fft peak bin = 440 exactly; stft shape 513x17 for 4096 samples; istft(stft(y)) interior maxErr printed as 0.000000; ifft(fft([1,2,3,4])) returns 1,2,3,4 exactly.

### scripts/xa-util.js — Framing + peak-picking known-signal proof
- **surface:** node · **viz:** line-plot · **domain:** Core DSP & Conversions
- **scenario:** Three asserts with printed sparkline: (1) frame(0..99, frameLength=10, hop=5) yields exactly 1+floor((100-10)/5)=19 frames and frame[1][0]==5; (2) peakPick([0,1,0,3,0,1,0,5,0], preMax:1,postMax:1,preAvg:2,postAvg:2,delta:0.5,wait:1) returns exactly [3,7] — print the signal as a unicode sparkline with ^ markers under picked indices; (3) buf_to_float(Int16[16384,-32768]) == [0.5,-1.0] and valid_audio([1,NaN])==false. Table of got/expected, nonzero exit on mismatch.
- **proof:** Verified by spot-run: 19 frames, peakPick returns [3,7], buf_to_float gives [0.5,-1], valid_audio(NaN)=false, __match_intervals([[0,1],[1.5,2.5]] vs shifted targets) returns [0,1].
- **repair first:** softmask() here computes X/(X+Xref)^power — diverges from librosa's X^p/(X^p+Xref^p) whenever power!=1 (xa-normalize.js has the librosa-correct implementation; this duplicate should delegate or be removed). Also show_versions() hard-codes 'librosaParity: 100%, 512/512 functions' — fictional numbers, strip before docs.

### scripts/xa-audioio.js — Synthesize-analyze-play: chirp proof page
- **surface:** web · **viz:** waveform · **domain:** Core DSP & Conversions
- **scenario:** In-page: tone(440, {sr:8000, duration:0.5}) then assert zeroCrossings sums to exactly 2*440*0.5=440 (spot-verified: got 440); chirp({fmin:200, fmax:2000, sr:22050, duration:2}) drawn as canvas waveform, split into 4 quarters and assert zero-crossing count strictly increases quarter-over-quarter (frequency ramp proof, badge PASS/FAIL); muExpand(muCompress(x, quantize:false)) maxErr < 1e-6 badge. A Play button calls play() on the chirp via the module's own Web Audio path (currentAudioBuffer route), proving the playback half that node can't.
- **proof:** Node spot-run confirmed the numeric halves: tone length 4000, zero-crossing count exactly 440, resample 8000->4000 halves length, toMono averages to [0.5,0.5], mu-law roundtrip err 1.19e-7, lpc a[0]==1 with order+1 coefficients. Web adds audible playback + monotone ZC badge.

### scripts/xa-intervals.js — Tuning-system showdown: golden ratios table
- **surface:** node · **viz:** none · **domain:** Core DSP & Conversions
- **scenario:** Build 12-bin octave from A440 in three systems via compareTuningSystems(440, ['equal','pythagorean','ji5']) and print a cents-per-degree comparison table. Asserts: pythagorean_intervals(12)[7] == 1.5 exactly (the pure 3:2 fifth, ~702 cents), equal system degree 7 == 2^(7/12) (700 cents), plimit_intervals([3,5],12) contains exact 5/4 (just major third) and 3/2, and generateFrequencies(440,'equal',13) spans exactly 440 -> 880. Table shows equal-vs-just cent deviations (the famous +2c fifth / -14c third); exit nonzero on assert failure.
- **proof:** Verified by spot-run: pythagorean[7]=1.5000, ji5 contains 1.25 exactly, equal spans 440.0->880.0, analyzeInterval(1.5) names 'Perfect Fifth'.

### scripts/audio-utils.js — Loop buffer builder: synth, measure, loop, export
- **surface:** web · **viz:** waveform · **domain:** Core DSP & Conversions
- **scenario:** createLoopBuffer({loopLengthSeconds:0.5, repeats:4, sampleRate:44100}) with default 440Hz sine; draw waveform to canvas with loop-point markers from defineMultipleLoopPoints; three metric badges asserted against theory: computeRMS ~= 0.7071 (+/-0.01, sine RMS), computePeak == 1.0, computeZeroCrossingRate ~= 2*440/44100 ~= 0.01995 (+/-2%); a Loop button plays it seamlessly via AudioBufferSourceNode using the returned loopStart/loopEnd; a Download link serves exportBufferAsWav (which delegates to io/wav encodeWav) — re-decode the blob in-page with decodeWav and badge 'export roundtrip OK' if samples match.
- **proof:** Node spot-run with a duck-typed buffer confirmed the math: RMS 0.707, peak 1.000, ZCR formula holds (0.091 for 5Hz/100sps test = 2f/sr within edge effects), Hann endpoints ~0, findAudioStart snaps to a zero crossing. Web adds the AudioBuffer/playback/export halves node can't touch.
- **repair first:** createLoopBuffer news up a live AudioContext({sampleRate}) purely to call createBuffer and never closes it — leaks a context per call and can hit browser context limits; should construct AudioBuffer directly (new AudioBuffer({...})) or use OfflineAudioContext. Not demo-blocking but fix before docs bless it.

### scripts/xa-beat-tracker.js — Canonical beat engine: click train in, beat grid out
- **surface:** both · **viz:** waveform · **domain:** Rhythm
- **bundle with:** scripts/xa-onset.js
- **scenario:** Synthesize a 10s click train at 120 BPM (5ms decaying 1kHz bursts every 0.5s, sr=22050). Run beat_track(y, sr, {units:'time'}) and quickTempo(y, sr). Node: print a table of {tempo, nBeats, medianIBI, quickTempo.bpm, quickTempo.confidence} and exit 1 on any assert failure. Web: same asserts as a pass/fail badge, plus render the waveform with detected beat markers overlaid and a play button that beeps on each detected beat so you can hear the lock.
- **proof:** tempo is one of the two lag bins bracketing 120 BPM (117.45 or 123.05 at hop=512/sr=22050, i.e. |tempo-120|<=7); beat count 18-21 over 10s; median inter-beat interval within 1 hop (23.2ms) of 0.500s (spot-run measured 0.5109s); quickTempo.bpm lands in the same lag bin and reports measured confidence > 0.

### scripts/xa-bpm-algorithm.js — lb tempo-stability map: does windowed tempo track a 100 to 140 BPM jump? ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** line-plot · **domain:** Rhythm
- **scenario:** After repair: concatenate 8s of 100 BPM clicks + 8s of 140 BPM clicks, run analyzeWithProgress(y, sr, 4, 1) with its progress yields driving a progress bar. Plot windowed tempo vs time as a line and list top Fourier-tempogram peaks. Assert first-half windows ~100, second-half ~140, and tempogram peaks contain both ~101 and ~141. Pass/fail badge.
- **proof:** mean(windowed tempo, t<7s) within 8 BPM of 100 AND mean(windowed tempo, t>9s) within 8 BPM of 140 (currently FAILS: every window returns the global estimate 69.8); tempogram.peakTempos top-3 include ~100.9 and ~141.3 (this part already passes in spot-run).
- **repair first:** VERIFIED broken: estimateConstrainedTempo reduces a 4s window to ~15 energy points but its BPM search needs lags >= ~15, so the autocorrelation loop never executes and every window silently returns globalTempo — the window-by-window 'tempo stability' output is constant regardless of actual tempo changes (100to140 ramp test: global=69.84 subharmonic, all 12 windows=69.8, while its own Fourier tempogram peaks correctly read 141.3/100.9). Fix: autocorrelate the raw onset envelope per window (not the 8-bucket energy downsample) or shrink the sub-window hop. Also: estimateGlobalTempo hard-caps 70-180 BPM causing subharmonic picks on mixed-tempo material, and computeOnsetStrength/computeSimpleFFT are O(n^2) decimated DFTs (~1s for 6s of audio).

### scripts/xa-downbeat.js — Find beat 1: accent-shifted 4/4 pattern, known downbeat phase
- **surface:** web · **viz:** waveform · **domain:** Rhythm
- **scenario:** Synthesize a 4/4 pattern at 120 BPM where the accented hit (loud low kick + noise burst) lands on beat index 1 of every bar and quiet hats land elsewhere, 8 bars. Feed the true beat grid (times every 0.5s) plus audio into findDownbeatPhase(y, beats, 120, sr) and assert phase === 1 and downbeats.length === beats.length/4 (rounded). Web page renders waveform with downbeat markers and a play button that thumps on each reported downbeat so the 'boom on 1' is audible; pass/fail badge on the phase assert. Secondary check: findFirstDownbeat on a signal with one silent leading bar returns ~2.0s (bar boundary).
- **proof:** phase === 1 exactly (known accent placement); downbeats count == 8 (one per bar); findFirstDownbeat within half a beat (0.25s) of 2.000s for the silent-first-bar signal.
- **repair first:** Minor: phase = Math.round(beatsSinceStart % 4) can yield 4 (e.g. 3.6 rounds to 4) and those onsets are silently discarded by the phase<4 guard instead of wrapping to phase 0 — biases scoring against phase 0.

### streaming/analyzers.js — Environment-blind streaming meters: chunk-size invariance + known-signal values
- **surface:** both · **viz:** line-plot · **domain:** Rhythm
- **scenario:** One scenario proves the worker/Node-safe claim on both surfaces. (a) Push a 0.5-amplitude 440Hz sine into createRmsMeter twice: once as a single array, once split into random 37-to-1999-sample chunks; assert every emitted RMS == 0.5/sqrt(2) +/- 1% AND the two runs emit bitwise-identical sequences (framer determinism). (b) Push a signal that steps from amplitude 0.05 to 0.8 at exactly sample 16384 into createFluxAnalyzer; assert the argmax flux frame is the frame whose window first contains sample 16384, +/- 1 frame. Node: printed table + exit code. Web: identical asserts as a badge, with the flux curve drawn live as chunks stream in via an AudioWorklet.
- **proof:** RMS values 0.3536 +/- 1% (spot-run measured 0.3540); chunked-vs-monolithic outputs identical element-for-element; flux argmax at frame floor(16384/512)-ish (first frame overlapping the step) +/- 1; first frame always reports flux 0.

### scripts/xa-beat.js — Fast-tier vs parity-tier: same answer, measured speedup
- **surface:** node · **viz:** none · **domain:** Rhythm
- **scenario:** NOT a shim — real fast-heuristic tier (collision-resolved: beat_track/tempo removed, distinct names kept). Node script runs fastBPMDetect(y, sr) and the canonical beat_track(y, sr) from xa-beat-tracker on the same 10s 120 BPM click train, timing both. Print a comparison table {engine, bpm, nBeats, ms}. Assert both BPMs agree within one lag bin (|diff| <= 7 BPM, spot-run: both returned 117.45), fast tier's beat count within +/-2 of parity tier's, and fast tier wall-time strictly lower. Also assert extractTempo([0,0.5,1.0,1.5,2.0]) returns exactly {bpm: 120, confidence: 1}.
- **proof:** fastBPMDetect.bpm == 117.45 +/- one lag bin matching canonical tempo; extractTempo golden {bpm:120, confidence:1, medianInterval:0.5}; printed speedup factor >= 1x with exit-code asserts.
- **repair first:** Minor house-rule drift: estimateTempo returns {bpm: startBpm, confidence: 0} when no peaks found, and fastBPMDetect's simpleTempoEstimate fallback clamps BPM to [60,200] and fabricates confidence 0.5 — the canonical tier bans default BPMs and fabricated confidences; consider making these throw instead.

### scripts/xa-tempo.js — DJ tempo-candidate pipeline + swing detector on known grooves
- **surface:** node · **viz:** line-plot · **domain:** Rhythm
- **scenario:** Salvaged-helper suite, proven end-to-end: (a) 128 BPM click train -> onset_strength -> compute_tempogram(env, sr, 512, 4) -> find_tempo_candidates(tg, sr, 512, 200, 60); assert top candidate within one lag bin of 128 (spot-run at 120 gave exactly the 117.45 bin) and print the tempogram as a terminal sparkline with the peak marked. (b) detect_tempo_multiples(128, candidates) finds half_time ~64 when a 64 BPM candidate is injected. (c) analyze_groove on straight beats [0,0.5,1.0,...] returns swing===0 and timing_variance===0 (golden, measured); on a swung grid alternating 0.32s/0.18s intervals (16 beats) returns swing >= 0.8. Table + exit code.
- **proof:** top candidate BPM within +/-7 of 128; straight groove golden {swing:0, timing_variance:0, mean_interval:0.5, groove_consistency:1}; swung groove swing >= 0.8 and groove_consistency < 0.5.

### scripts/xa-rhythm.js — Pulse-strength curve discriminates rhythm from silence; beat_sync exact means
- **surface:** node · **viz:** line-plot · **domain:** Rhythm
- **scenario:** (a) Build one 16s signal: first 8s silence, last 8s of 120 BPM clicks. Run plp(y, sr); assert mean(plp) over the click half > 5x mean(plp) over the silent half, and global max === 1.0 (curve is max-normalized). Print the curve as a sparkline. (b) beat_sync exactness: beat_sync([1,2,3,4,5,6,7,8], [0,4,8], 'mean') === [2.5, 6.5] (verified) and aggregate 'max' === [4, 8]; also a 2D case with two feature rows. Table + exit code.
- **proof:** plp click-half mean / silent-half mean > 5, max(plp)===1 (spot-run: len 431, max 1); beat_sync goldens [2.5,6.5] and [4,8] exact.
- **repair first:** Minor: plp is a windowed-autocorrelation pulse-strength approximation, NOT librosa's Fourier-tempogram PLP — rename or note in docs; Math.max(...arr) spreads can overflow the stack on very long envelopes (>~100k frames); beat_sync drops data after the last beat boundary (emits beats.length-1 segments).

### feature/spectral.js — Spectral descriptors vs analytic ground truth
- **surface:** node · **viz:** none · **domain:** Spectral & Features
- **scenario:** Node script synthesizes two known signals at sr=22050: (a) 1 kHz sine, amp 0.5; (b) seeded white noise. Runs spectral_centroid, spectral_bandwidth, spectral_rolloff, spectral_flatness, rms, zero_crossing_rate on both and asserts against closed-form truth: sine centroid 1000 +/- 5 Hz, rolloff within 2 bins of 1000 Hz, flatness < 1e-6, rms 0.3536 +/- 0.001 (0.5/sqrt2), zcr 0.0907 +/- 0.002 (2f/sr); noise flatness > 0.9, centroid near sr/4. Prints expected-vs-got table, exits 1 on any miss.
- **proof:** Spot-run today: centroid 1000.2 Hz, flatness 5.4e-12, rms 0.3534, zcr 0.0908 on the 1 kHz sine - all within tolerance.

### feature/mfcc.js — Chirp mel spectrogram + MFCC heatmap
- **surface:** web · **viz:** spectrogram · **domain:** Spectral & Features
- **bundle with:** scripts/xa-mel.js, scripts/xa-display.js
- **scenario:** In-page: generate a 3 s linear chirp 200->4000 Hz plus a 0.5 s steady 1 kHz tail at sr=22050. melspectrogram (n_mels=128) -> power_to_db -> render mel spectrogram to canvas (magma), MFCC(13) heatmap below. Badge asserts: (1) per-frame argmax mel bin is monotonically nondecreasing over the chirp (Spearman rho > 0.95); (2) steady-tone frames have peak mel bin exactly 38; (3) mfcc shape 13 x n_frames. Pass/fail badge.
- **proof:** Spot-run: peak mel bin = 38 for 1 kHz at sr=22050/n_mels=128 (matches slaney grid: hz_to_mel(1000)=15.0), mfcc shape 13x44.

### feature/chroma.js — C-major arpeggio chromagram
- **surface:** web · **viz:** matrix-heatmap · **domain:** Spectral & Features
- **bundle with:** filters/index.js, scripts/xa-chroma.js
- **scenario:** In-page: synthesize a C-E-G-C arpeggio (261.63, 329.63, 392.00, 523.25 Hz; 0.5 s each) at sr=22050, run chroma_stft (tuning auto-estimated), render the 12 x n_frames chromagram heatmap with note-name row labels. Badge asserts per-segment argmax pitch class = [0, 4, 7, 0] (C, E, G, C) and estimate_tuning of the A440-derived tones is |tuning| < 0.05 bins.
- **proof:** Spot-run: chroma_stft argmax pitch class 9 (A) for a 440 Hz sine with base_c grid - class mapping verified.

### scripts/xa-harmonic.js — Harmonic energy ratios + HPS pitch ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Spectral & Features
- **scenario:** Node script: synthesize 220 Hz + 440 Hz (0.5x) + 660 Hz (0.25x) at sr=22050, stft(2048/512) -> magnitude; run f0_harmonics(S, f0=220, harmonics=[1,2,3]) and assert mid-frame energy ratios 1 : 0.5 : 0.25 within 15% (window leakage tolerance); run harmonic_product_spectrum(3) on a mid frame and assert peak bin within 1 bin of 220 Hz. Printed table + exit code.
- **proof:** Spot-run: ratios 436.2/239.9/112.2 and HPS peak 215.3 Hz (bin width 10.8 Hz) - both pass.
- **repair first:** Core is sound - spot-run: f0_harmonics on a 220 Hz tone with 1/0.5/0.25-amp harmonics returned 436.2 : 239.9 : 112.2 (ratios 1 : 0.55 : 0.26, correct), HPS peak within one FFT bin of 220 Hz. BUT salience's filter_peaks filters local maxima along the TIME axis (it maps over each frequency row and compares freq_row[t-1]/[t+1]) whereas librosa filters along the FREQUENCY axis (axis=-2) using peaks of the original S - salience output diverges from librosa whenever filter_peaks=true (the default). Also interp_harmonics is O(n_freqs^2 * n_frames * n_harmonics) with a linear bin search per lookup - fine for demos, slow for real spectrograms.

### scripts/xa-display.js — specshow + waveshow of a chirp (post-fix) ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** spectrogram · **domain:** Spectral & Features
- **bundle with:** feature/mfcc.js, scripts/xa-mel.js
- **scenario:** Post-fix web page (shared with the mel/mfcc demo): power_to_db(melspectrogram(chirp)) -> specshow(canvas, {yAxis:'mel', cmap:'magma'}) with waveshow(chirp) below. Badge asserts: specshow returns a live 2D context; ctx.getImageData at the known chirp cell (t=1.5s, its mel bin) is warmer (higher R in magma) than an off-band cell at the same t; NoteFormatter.call(69)='A4'. Pass/fail badge.
- **proof:** Currently FAILS at step 1: cmap throws on typed-array rows (node-confirmed today). Post-fix: badge green with the two-pixel warmth assert.
- **repair first:** Node-confirmed crash on the package's own data format: cmap([Float32Array,...]) throws 'cmap: data contains no valid finite values' because Array.prototype.flat() does not flatten typed-array rows and Number.isFinite then filters out every row object - and specshow calls S.flat() the same way. Since every xa feature module returns Array<Float32Array|Float64Array>, specshow(melspectrogram(y)) throws today; it only works on plain number[][] (verified: plain rows OK). Needs a typed-array-aware flatten. Secondary: per-cell ctx.fillRect rendering is O(F*T) canvas calls (128x1000 = 128k rects - should use ImageData); cmap's diverging/binary heuristics silently pick colormaps; marathon module never browser-verified; DisplayAdaptor/waveshow/formatters look sound by reading but unproven.

### scripts/xa-inverse.js — Mel round-trip reconstruction (post-repair) ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Spectral & Features
- **scenario:** Post-repair node script: y = 440 Hz sine -> M = melspectrogram(y) -> S_hat = mel_to_stft(M); assert per-frame cosine similarity between S_hat and |stft(y)| > 0.9. Then y_hat = mel_to_audio(M, n_iter=16); assert y_hat.length == expected sample count (not 1!) and yin(y_hat) median within 2 Hz of 440. Printed table + exit code.
- **proof:** Currently FAILS twice: mfcc_to_mel throws 'Unsupported DCT type: 128' and griffinlim returns 1 sample (both node-confirmed today). Post-repair: cosine sim > 0.9 and recovered pitch 440 +/- 2 Hz.
- **repair first:** Three of four exports broken, node-confirmed. (1) mfcc_to_mel throws immediately: calls idct(frame, n_mels, inverse_type, norm) but xa-mel idct signature is (coeffs, type, norm) so type receives n_mels -> 'Unsupported DCT type: 128' (spot-run). Even with args fixed, idct returns length-n_mfcc and cannot expand to n_mels - librosa zero-pads via scipy idct(n=n_mels); needs a proper padded DCT-III. Also applies the un-fixed off-by-one lifter formula sin(pi*i/L) (xa-mel's lifter_mfcc was corrected to i+1; this copy was not). (2) mel_to_audio and mfcc_to_audio depend on xa-advanced griffinlim, which has the known istft arg-order bug: istft(D, hop_length, win_length, window, center, length) is called as istft(S, hop, win, n_fft, window, center, dtype, length) so n_fft lands in window (benign - falls back to hann), 'hann' lands in center, and center=true lands in LENGTH -> output sliced to 1 sample. Spot-run: griffinlim returned a length-1 Float32Array. Same arg-shift on its stft call puts dtype=null into pad_mode. (3) mel_to_stft (transpose approximation) is the only likely-working export; librosa uses NNLS - document as rough approximation.

### loop/fast.js — Golden-Locked Fast Pipeline
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** loop/detect.js
- **scenario:** The golden-lock half of the detect harness proves this module specifically: fastLoopAnalysis on all 4 golden WAVs, assert loop points within ±441 samples of loop_goldens.json, bpm within 0.1, and that the result carries non-empty beats[] and onsets[] arrays plus a measured 0..1 confidence (never the legacy pegged 1.0).
- **proof:** Verified live: 'Bassline For Doppler Song longer.wav' → 11.9886/14.6008 (fixture exact), bpm 92.29, conf 0.957, ~7s runtime for a 45s file in Node.

### loop/precise.js — Known-Repetition Precise Loop Proof
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** loop/detect.js
- **scenario:** Known-signal proof: synthesize at 44.1kHz — 1s noise intro + an exactly 2.000s percussive pattern (decaying noise bursts on a 120 BPM grid) repeated 3x verbatim + 1s outro. Run findPreciseLoop(data, 44100, 120, {searchStart: 0.5}); assert detected duration within 2.000±0.05s (an onset pair spanning one pattern period) and score > 0.8 (verbatim repetition drives NCC toward 1). Also assert null is returned (not a fabricated loop) when given 1s of pure noise.
- **proof:** PASS row: duration 2.00±0.05s, score>0.8, musicalBonus 0.2 (within 2% of 1 bar @120). FAIL-honesty row: pure-noise input → null.

### loop/musical.js — Bar-Multiple Candidate Proof
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** loop/detect.js
- **scenario:** Synthesize a 16s, 120 BPM click+bass pattern with an exactly 1-bar (2.000s) period. Run detect({strategy:'musical', bpm:120}); assert musicalDivision ∈ {0.5,1,2,4,8}, loopLength ≈ division×2.0s, and — because a periodic 1-bar signal correlates equally at 0.5 and 1 bar — the tie-break picks the LONGER loop (division ≥ 1, never 0.5). Second case: a 3s buffer where only the 0.5-bar candidate fits → assert it still returns a result; third: 0.5s buffer → assert the 'candidate gate failed' diagnostic throws.
- **proof:** Table: division ≥ 1 on the periodic signal (tie-break proof), thrown Error message contains 'candidate gate failed' on the too-short buffer, exit code 0.

### sequence/rqa.js — RQA librosa Fixture Replay
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** loop/recurrence.js
- **scenario:** Fixture replay: load tools/parity/fixtures/rqa.json (2 cases, generated by librosa 0.11.0, keys input/expected_path/expected_score_max), run rqa(input) on each, assert exact path agreement (element-wise [n,m] pairs) and max(score) === expected_score_max. Plus one interpretable case: an 8×8 identity similarity matrix → path is the full main diagonal [[0,0]..[7,7]] and maxScore = 8. Print per-case PASS/FAIL, exit code.
- **proof:** Verified live: identity 3×3 → path [[0,0],[1,1],[2,2]], maxScore 3. Demo asserts both librosa fixture cases exact + the 8×8 diagonal.

### playback/ops.js — Pure Buffer Ops Invariant Table
- **surface:** both · **viz:** waveform · **domain:** Loop & Play Layer
- **scenario:** NODE: 1s 440Hz sine via createBufferLike, loop {0.25,0.5}: halfSpeedLoop → length exactly 55125 (= 44100 + loopLen); doubleSpeedQuantzLoop → length 38587 with newLoopEnd 0.4286; reverseSection twice → bit-identical to input (maxDiff 0, proves non-mutating copy-reverse); constructed buffer with silence in [0.5s,0.75s] → detectGap returns exactly {start:22050, end:33075, size:11025}; closeGapLeft output length = input − gap.size; assertLoop rejection: loop {start:0.5,end:0.4} throws. Exit code. WEB: identical asserts as badges, plus waveform render of original vs halfSpeedLoop'd buffer (stretched region visibly doubled) with audition buttons using ctx.createBuffer injected as the factory.
- **proof:** ALL verified live in Node this session: 55125/55125, 38587/38587 newLoopEnd 0.4286, reverse-twice maxDiff 0, detectGap {22050,33075,11025} exact.

### core/loopPlayground.js — Glitch Playground (seeded + audible)
- **surface:** both · **viz:** waveform · **domain:** Loop & Play Layer
- **bundle with:** core/demoSequences.js, core/beatGlitcher.js, core/GibClock.js
- **scenario:** NODE: determinism + safety fuzz — randomSequence with an injected LCG rng: two runs with seed 42 produce identical op logs (verified live: 'half,half,move,half,half,reverse,double,move'); then execute 500 steps and assert every resulting loop satisfies 0 ≤ startSample < endSample ≤ buffer.length and length ≥ minSamples. WEB: glitch playground page — load 'Drive Through Beat.wav', GibClock drives randomSequence step execution against live LoopPlayer playback, waveform canvas shows the moving loop overlay + a scrolling op ticker; a seed input field re-runs and a badge confirms the op log is identical for the same seed.
- **proof:** Seeded determinism PASS (verified live), 500-step bounds fuzz 0 violations, and on web the same seed reproduces the same ticker.

### core/beatGlitcher.js — Bar-Synced Glitch Clock
- **surface:** web · **viz:** none · **domain:** Loop & Play Layer
- **bundle with:** core/loopPlayground.js
- **scenario:** Section of the glitch playground page: synthesize (or load) a 120 BPM click WAV; startBeatGlitch(buffer, {maxOpsPerBar:1, onUpdate}); badges: (1) detected bpm 120±2 ⇒ GibClock bar interval 2000ms — measure actual mean interval between onUpdate calls over 8 bars, assert 2000±40ms; (2) onUpdate fired exactly once per elapsed bar (count === bars); stop handle actually stops the clock (no further calls within 3s, assert).
- **proof:** bpm badge 120±2, mean bar interval 2000±40ms over 8 bars, update count === 8, post-stop silence.
- **repair first:** Imports '../scripts/analysis/BPMDetector.ts' — works under rollup-esbuild builds and Node ≥22.6 type-stripping (verified importable on Node 25.9), but package.json engines says >=18 where a plain src import fails. Also two DIFFERENT fastBPMDetect implementations coexist: BPMDetector.ts returns a number (used here), scripts/xa-beat.js returns an object (exported at top level under the same name) — name collision worth resolving.

### scripts/algorithmic-sequences.js — Generator Determinism + Bounds Fuzz (acceptance harness) ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** none · **domain:** Loop & Play Layer
- **scenario:** Three-part node harness: (1) determinism — each generator called twice yields identical op arrays (verified live for fibonacci and chaotic); (2) vocabulary closure — every op any generator emits has an executeOperation case (no silent default fallthrough); (3) bounds fuzz — run 200 ops from each of the 4 generators through executeOperation on a 1s buffer and assert 0 ≤ startSample < endSample ≤ length after every op. Part 3 is the ACCEPTANCE TEST for the repair: it currently fails 90/800.
- **proof:** Parts 1–2 PASS today; part 3 must go from 90/800 violations (measured live this session) to 0/800 after repair — the harness prints the violation count and exits non-zero until then.
- **repair first:** Fuzz measured 90/800 degenerate loop states: 'move' uses modulo wrap so a full-width loop maps to {0,0} (endSample % length === 0 when end hits buffer length) and wrapped loops can get end < start; repeated half/fractal/stutter on tiny loops collapse to zero width (endSample === startSample); phaseShift's independent modulo on start and end can also wrap end below start. Needs clamping (no-wrap move, minimum-width floor) before any playback demo consumes its output. This is an absorbed marathon module — never wave-verified.

### scripts/quantum-sequencer.js — Quantum Op-Stream Sequencer ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** waveform · **domain:** Loop & Play Layer
- **bundle with:** core/vector-rhythm.js
- **scenario:** Quantum sequencer page: buildQuantumOpList(128, 4) and display the op stream; badges: (1) length exactly 128, (2) every op ∈ RHYTHM_VOCAB (closure through the vector-space warp — verified live: 32-op list all in vocab), (3) at least one injected preset detected — some 8-op bar from beat-presets.allPresets appears as a contiguous subsequence; then buildQuantumSequence over 'Drive Through Beat.wav' driven by GibClock with waveform loop overlay and live audition.
- **proof:** Badges: 128/128 ops, 100% vocab closure, ≥1 verbatim preset bar found; audible glitch stream follows the displayed ops.
- **repair first:** playQuantumOps reads/writes window.quantumSequenceCount — a global bus (crashes headless, violates the Wave-6 explicit-injection convention); executing any 'phase' op routes through audio-ops-extended.phase which reads window.phaserParams, so buildQuantumSequence STEP EXECUTION breaks in Node whenever the warped list contains 'phase' (list construction itself verified Node-OK on Node 25). Fix: inject a counter/params object.

### lib/effects/xa-fx.js — FX Audition with Sample-Exact Badges ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** waveform · **domain:** Loop & Play Layer
- **scenario:** FX page: load a golden WAV, loop = region from loop.detect; three before/after audition rows with sample-exact badges: STUTTER — assert output samples at loopStart+k·span (k=0..repeats−1) exactly equal the first-10ms slice (span = min(10ms·sr, loopLen)); FRACTAL — assert first half of the loop equals a manual reverse of the original first half, second half untouched; PHASE — assert output differs from input inside the loop AND is bit-identical outside the loop bounds (in-place containment proof). Waveform render highlights the modified region per effect.
- **proof:** Verified live in Node: stutter runs clean on a buffer-like; phase throws 'window is not defined' (the repair target). Web badges: stutter slice equality exact, fractal reverse equality exact, phase outside-loop identity exact.
- **repair first:** Two problems: (1) this file is a near-verbatim duplicate of scripts/audio-ops-extended.js (stutter/phase/fractal/applyQuantumOp identical) — the package index exports applyQuantumOp from HERE while quantum-sequencer imports the audio-ops-extended copy, so two live copies can silently diverge; dedupe to one canonical home. (2) phase() reads window.phaserParams — verified crash in Node ('window is not defined'); params should be an options argument per the Wave-6 injection convention.

### scripts/live-speed-control.js — Live Speed: playbackRate vs Resample Tiers
- **surface:** web · **viz:** none · **domain:** Loop & Play Layer
- **scenario:** Init with ctx + golden-WAV buffer + a minimal audioProcessor ({source, gainNode, isPlaying, getCurrentTime}). While playing: applyLiveDoubleSpeed() → badges: replacement source's playbackRate.value === 2.0 and the old source is stopped after the 50ms crossfade (audible pitch jump confirms). Then the pitch-preserving tier: applyLiveDoubleSpeed({preservePitch:true}) → badges: returned buffer.length === original length, newLoopLength === floor(len/2), and RMS of the second half of the returned buffer === 0 (resample at 2× writes compressed audio into the first half and leaves silence — the assertable signature of the resample path). resetLiveSpeed() restores playbackRate 1.0.
- **proof:** playbackRate badge exact 2.0; resample badges: length unchanged, newLoopLength = len/2, trailing-half RMS 0; error contract: calling helpers without ctx/buffer throws the documented message.

### scripts/xa-audio-core.js — Demo Audio Core: Load → Draw → Loop
- **surface:** web · **viz:** waveform · **domain:** Loop & Play Layer
- **scenario:** One page exercising all three exports together: loadAudioFile('/audio/Drive Through Beat.wav') → drawWaveform to a canvas with loop overlay {start:0.25, end:0.5} → processor.play(buffer) with setLoopPoints(0.25, 0.5). Badges: (1) getLoopDuration() === 0.25 × buffer.duration ±1ms (= 3.750s for the 15s file); (2) getCurrentPosition() sampled 20× over 3s always stays within [0.25, 0.5]; (3) cache proof — a second loadAudioFile(same URL) resolves the IDENTICAL AudioBuffer object (===); (4) drawWaveform paints loop markers at x = 0.25·width and 0.5·width (pixel probe).
- **proof:** Loop duration badge 3.750s exact for the 15s golden file; 20/20 position samples in bounds; cache identity ===; marker pixels at expected columns.

### scripts/analysis/AudioPlayer.ts — Event-Contract Player Proof
- **surface:** web · **viz:** none · **domain:** Loop & Play Layer
- **scenario:** Event-driven contract page: new AudioPlayer(); await load(golden WAV). Badges: (1) clamp proof — setLoop(10, 9999) fires 'loopchange' whose payload end is clamped to buffer.duration exactly (assert event payload, not internal state); (2) during looped playback collect 200 'timeupdate' values → 200/200 within [loop.start, loop.end]; (3) pause()/play() continuity — getCurrentTime() immediately after resume within 60ms of the paused position; (4) state getter mirrors the last events (isPlaying/isPaused/loop deep-equal). Audition confirms the audible loop region.
- **proof:** loopchange payload {start:10, end:duration} exact; 200/200 timeupdate values in bounds; resume delta <60ms; state/event coherence.

### effects/index.js — librosa.effects parity: trim/split/preemph/stretch/shift/remix on a known signal
- **surface:** both · **viz:** waveform · **domain:** Effects, Decompose & Structure
- **bundle with:** scripts/xa-trim.js, scripts/xa-split.js, scripts/xa-remix.js, scripts/xa-filters.js (preemphasis/deemphasis shim exports), scripts/xa-processing.js (time_stretch/pitch_shift/phase_vocoder shim exports)
- **scenario:** Generate a 2s buffer: silence + 1s 440Hz tone burst + silence, with 4 click transients inside the burst. Run: (1) trim/split; (2) preemphasis->deemphasis round-trip; (3) time_stretch(y, 2.0); (4) pitch_shift(tone, sr, +12); (5) hpss(y) waveform-level; (6) remix reversing the two halves of the burst. Node prints a pass/fail table and exits nonzero on failure; web draws before/after waveforms with trim markers and plays original vs stretched vs shifted, with one badge per assertion.
- **proof:** trim/split interval within 1 hop (512) of the known burst edges [11025, 33075]; deemphasis(preemphasis(x)) maxErr < 1e-6 (measured 7.5e-9); time_stretch len == round(N/2) exactly AND zero-crossing pitch stays 440Hz +/-2%; pitch_shift est pitch 880Hz +/-2% (measured 880.5) with length unchanged; hpss: harmonic-channel 440Hz-bin energy / percussive-channel > 100; remix output cross-correlates with hand-swapped segments > 0.99.

### decompose/index.js — HPSS spectrogram triptych: sine + click train separates cleanly
- **surface:** both · **viz:** spectrogram · **domain:** Effects, Decompose & Structure
- **scenario:** Synthesize 1s of 440Hz sine + 10 broadband clicks, stft(1024, 256), magnitude, hpss(). Web renders a 3-panel canvas (mixture / harmonic / percussive) where the horizontal 440Hz line lands in the harmonic panel and the vertical click stripes in the percussive panel. Node prints the same energy assertions as a table. Also assert softmask complementarity directly.
- **proof:** 440Hz-bin energy: harmonic/percussive ratio > 100 (measured 4.4e6 in spot-run); click-frame column energy: percussive/harmonic ratio > 10; at margin=1, |harmonic+percussive - S| max deviation < 1e-6 per bin (mask=true: maskH+maskP == 1 to 1e-12); mask=true with power=Infinity yields a strict 0/1 hard mask.

### segment/index.js — Recurrence heatmap of an A-B-A pattern + exact Ward boundaries
- **surface:** both · **viz:** matrix-heatmap · **domain:** Effects, Decompose & Structure
- **bundle with:** scripts/xa-temporal.js
- **scenario:** Build a 60-frame, 12-dim feature matrix as pattern A(20)-B(20)-A(20) with small deterministic jitter. recurrenceMatrix(mode='affinity', sym=true) -> web canvas heatmap where the A-repeats appear as bright off-diagonal blocks at (0-19, 40-59); node prints an ASCII shade map. Then agglomerative(data, 3) and the lag round-trip.
- **proof:** Mean affinity inside the known A<->A repeat block > 5x mean affinity in A<->B blocks; width band |i-j|<width is exactly zero; sym=true matrix equals its transpose exactly; agglomerative(data,3) returns Uint32Array [0,20,40] EXACTLY (verified [0,8] on the 2-cluster spot-run); lagToRecurrence(recurrenceToLag(R)) reproduces R bit-exactly (verified).

### sequence/dtw.js — DTW cost matrix + warping path overlay on a known time-warp
- **surface:** both · **viz:** matrix-heatmap · **domain:** Effects, Decompose & Structure
- **bundle with:** sequence/matching.js, scripts/xa-dtw.js
- **scenario:** X = 2-dim ramp features (40 frames); Y = X with frames 10-19 each duplicated (known warp map). Run dtw(X,Y) and draw the accumulated-cost matrix as a heatmap with the warping path overlaid (web canvas / node ASCII). Second case: subsequence — embed X at offset 25 inside a 100-frame noise sequence, dtw(subseq=true).
- **proof:** dtw(X,X): D[N-1][N-1] === 0 and path is the exact 40-step diagonal (verified). Warped pair: total cost 0 and every path pair (i,j) maps within the known duplication map (exact index assertions). Subseq case: min over D[last row] === 0 and matched window starts at column 25 exactly (verified pattern with offset 2 in spot-run). Exit code reflects pass/fail in node; badge on web.

### scripts/xa-fileio.js — Chunked reader math + live mic RMS meter ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** line-plot · **domain:** Effects, Decompose & Structure
- **bundle with:** scripts/xa-file.js
- **scenario:** Bundled onto the xa-file.js File IO page: generate a 3s tone in-page, encode to WAV blob, feed stream(blob, {blockLength:2048, hopLength:2048}) and count blocks; then (optional, behind a click) getUserMedia -> createMediaStreamProcessor drawing a live per-block RMS line-plot.
- **proof:** Block count === ceil(N/2048) exactly and re-concatenating the blocks (non-overlap config) reproduces the source sample-for-sample (badge); mic path: RMS plot visibly tracks speaking vs silence and processor.stop() halts callbacks (isRunning() flips false).
- **repair first:** Browser-only, marathon-authored, never wave-verified in a real browser. stream() is decode-whole-file-then-chunk, NOT streaming, and its block semantics (blockLength-sample windows advancing by hopLength => overlapping blocks) do not match librosa.stream's block_length-frames contract — either rename/document as chunked reader or align semantics. find_files ignores offset/limit ordering promises in the FS-Access branch until after full recursion (fine) but the input-element fallback filters by accept only loosely. createMediaStreamProcessor uses deprecated ScriptProcessorNode (works, but AudioWorklet migration note needed). cite() is pure and fine.

### scripts/xa-file.js — File IO corner: WAV save -> reload round-trip with 16-bit error bound ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** waveform · **domain:** Effects, Decompose & Structure
- **bundle with:** scripts/xa-fileio.js
- **scenario:** One page hosting the file-IO family: generate a 1s 440Hz tone, saveAudio() it as WAV (post-repair: via io/wav.encodeWav), immediately reload the same Blob through loadFile(), overlay original vs reloaded waveforms, and show cache() stats before/after a repeated exampleBuffer('trumpet') load (second hit must be served from cache).
- **proof:** Reloaded buffer length === original length exactly; max |sample diff| <= 2/32768 (16-bit quantization bound) — badge with the measured value; cache stats show entries+1 and byte size after first load, and a second load performs 0 network fetches (Resource Timing count unchanged) with getBuffer hit.
- **repair first:** Browser-only, never wave-verified. (1) saveAudio uses the private _encodeWAV — one of the three divergent encoders that src/io/wav.js explicitly replaced; delegate to io/wav.encodeWav. (2) AUDIO_REGISTRY fetches https://librosa.org/data/assets/audio/<name>.ogg — remote paths unverified and durations/sr in the registry are hand-typed; verify or vendor local fixtures. (3) createVisualization hardcodes sampleRate:22050 in its return regardless of input. (4) AudioCache LRU is sound (pure JS) but _bufferCache is unbounded (only _cache counts toward maxSize). loadFile/exampleBuffer logic is fine.

### plot_audio_playback — Hear your analysis: onset clicks + chirp playback ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** waveform · **domain:** Librosa Advanced-Example Replicas
- **scenario:** In-page: synthesize a C3->C5 chirp via xa-audioio.chirp and play it through AudioPlayer; then synthesize a 4-hit percussion pattern with clicks at known times [0.5, 1.0, 1.5, 2.0]s, run onset_strength({max_size:5}) + onsetDetect, sonify detections with clicks() and play the overlay mix; draw waveform with detected-onset markers vs ground-truth markers.
- **proof:** Badge asserts detected onset count == 4 and every detection within ±23 ms (one hop @ 512/22050) of ground truth; audible proof: overlay clicks land exactly on the hits.
- **repair first:** tone/chirp/clicks live in scripts/xa-audioio.js and pyin in scripts/xa-pitch.js — all spot-run fine in Node (chirp n=11025, pyin 220Hz sine -> 220.0096 Hz) but are unexported and have no fixture gates; promote to curated surface with fixtures (chirp instantaneous-frequency check, clicks sample-position check). Also missing a mir_eval.sonify.pitch_contour equivalent (small additive-synth helper) for the f0-sonification half.

### plot_display — specshow, canvas-native: axis modes that don't lie
- **surface:** web · **viz:** spectrogram · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize a three-partial tone (440 + 880 + 1760 Hz); stft -> amplitude_to_db rendered with renderStaticSpectrum in linear-frequency and log-frequency modes, plus melspectrogram (power_to_db) and chroma_stft as synced canvases — the four-panel specshow replica.
- **proof:** Badge asserts in log mode the pixel-row distance 440->880 equals 880->1760 within ±2 px (octaves equidistant), while in linear mode 880->1760 is 2x the 440->880 distance; axis tick labels cross-checked against fft_frequencies/frames_to_time values.

### plot_hprss — HPSS margins: pull the sine out of the clicks
- **surface:** web · **viz:** spectrogram · **domain:** Librosa Advanced-Example Replicas
- **scenario:** In-page mix of a sustained 440 Hz sine (harmonic) + 8 Hz click train (percussive); stft -> decompose.hpss at margins 1/2/4/8; render full/harmonic/percussive spectrogram rows per margin; istft both components and A/B play each against the mix.
- **proof:** Badge asserts max|S − (H+P)| < 1e-5 at margin=1 (parity identity), harmonic component retains >90% of 440 Hz-bin energy with <10% of click energy (and vice versa), and cross-leak drops below −30 dB by margin=4.

### plot_superflux — Superflux vs vanilla flux: vibrato immunity
- **surface:** both · **viz:** line-plot · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize a melody of 4 notes at known onset times where each note carries heavy vibrato (440 Hz ±30 cents at 6 Hz); compute default onset_strength(y) and superflux onset_strength({S: power_to_db(melspectrogram(...138 mels, fmin 27.5...)), lag:2, max_size:3}); pick onsets from both. Node prints both detection lists + counts; web adds the two ODF line plots with onset markers over the mel spectrogram.
- **proof:** Assert superflux detection count == 4 with each within ±2 hops of ground truth, while the default ODF fires > 4 (vibrato false positives) — identical numbers printed in Node and rendered in the browser (environment-blind claim).

### plot_viterbi — Viterbi smoothing: don't flinch at the dip ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** line-plot · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize 1 s tone + 0.3 s silence containing one 2-frame noise blip + 1 s tone; feature.rms -> logistic map to non-silence probability p; transition_loop(2, [0.5, 0.6]) -> viterbi_discriminative([1−p; p]); print a frame table (p, frame-wise threshold decision, viterbi state) plus terminal sparklines of both state sequences.
- **proof:** Exit code asserts frame-wise thresholding produces ≥4 state changes (blip flips it) while viterbi produces exactly 2 (tone->silence->tone) and the decoded state array equals the hand-computed expected sequence.
- **repair first:** The full viterbi family (viterbi, viterbi_discriminative, viterbi_binary, transition_{uniform,loop,cycle,local}) exists in scripts/xa-sequence.js and spot-runs correctly (toy 2-state decode -> [0,1,1], transition_loop(2,[0.5,0.6]) OK) but is unexported and has no librosa fixture — promote into the sequence/ namespace with a fixture from librosa.sequence.viterbi_discriminative.

### tutorial — The quickstart: same beats, both runtimes
- **surface:** both · **viz:** waveform · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Replicate the tutorial quickstart on a bundled fixture WAV: decodeWav -> beat_track -> print tempo and first 4 beat times via frames_to_time (Node), and render waveform with beat markers + play with click overlay (web); extend with the advanced pipeline up to effects.hpss -> beat_track(percussive) -> feature.mfcc using verified pieces.
- **proof:** Assert tempo and beat frames exactly equal the pinned librosa fixture values (bit-exact parity claim) in BOTH environments — pass/fail badge on web, printed table + exit code in Node.
- **repair first:** Advanced-half gaps only: feature delta (delta_features in scripts/xa-mel.js) and util.sync are unexported/unverified — promote both to finish the beat-synchronous feature-stacking example; chroma_cqt gap covered by chroma_stft.

### ioformats — Blockwise IO: streaming equals one-shot
- **surface:** node · **viz:** none · **domain:** Librosa Advanced-Example Replicas
- **scenario:** THE canonical Node demo. (a) Blockwise: decode a WAV, feed it through createRmsMeter/createFluxAnalyzer in 128-frame push chunks (frame 2048 / hop 512, overlap bookkeeping via blocks_to_frames), and compare the streamed RMS frame sequence against one-shot feature.rms on the full signal. (b) Write-out: encodeWav a generated stereo buffer, decodeWav it back.
- **proof:** Printed table + exit code assert streamed RMS == full-signal RMS within 1e-6 per frame, and encode/decode round-trip max sample error ≤ 1/32768 (16-bit LSB).

### multichannel — Stereo without broadcasting: channel independence
- **surface:** node · **viz:** none · **domain:** Librosa Advanced-Example Replicas
- **scenario:** encodeWav a 2-channel file (440 Hz sine left, 880 Hz sine right); decodeWav -> channel array; run stft + magnitude peak-pick per channel against fft_frequencies.
- **proof:** Printed table + exit code assert ch0 peak bin == bin(440 Hz) ±1 and ch1 == bin(880 Hz) ±1, with cross-bleed (ch0 energy at the 880 Hz bin) below −40 dB relative to its peak — channels provably independent.


## Tier 3

### scripts/xa-tempogram.js — Tempogram heatmap of a tempo jump (librosa-gallery class) ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** matrix-heatmap · **domain:** Rhythm
- **scenario:** After repair: 8s of 100 BPM clicks + 8s of 140 BPM clicks -> onset_strength (from xa-onset, not the private duplicate) -> tempogram() rendered as a lag-vs-time heatmap on canvas with a BPM axis. Overlay the per-frame argmax ridge converted to BPM. Assert ridge BPM within one lag bin of 100 for t in [1,6]s and within one bin of 140 for t in [10,15]s; estimate_tempo on each half returns the same values. Pass/fail badge next to the heatmap.
- **proof:** argmax-ridge BPM in [99.4, 103.4] over the first half and [136.0, 143.6] over the second (the bracketing lag bins at hop=512/sr=22050); currently FAILS: estimate_tempo returns 60.09 BPM (subharmonic, raw max with no prior) on plain 120 BPM clicks, and fourier_tempogram returns shape [193, 1] — a single time column for a 431-frame envelope.
- **repair first:** VERIFIED broken vs its own 'port of librosa' claim: (1) fourier_tempogram passes hop_length=512 to the STFT of the onset envelope where librosa uses hop=1, collapsing output to 1 column; (2) estimate_tempo picks the raw autocorrelation max with no tempo prior -> subharmonic 60 BPM on a 120 BPM click train (measured); (3) tempogram() zero-pads instead of librosa's linear_ramp and returns win_length/2+1 lags vs librosa's win_length; (4) tempogram_ratio is not librosa's tempogram_ratio algorithm at all; (5) contains a private duplicate simplified onset_strength instead of importing the parity one from xa-onset. The canonical mean-tempogram math already exists privately in xa-beat-tracker.js meanTempogram — repair should share it.

### scripts/xa-constantq.js — CQT peak-bin proof (post-repair) ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** matrix-heatmap · **domain:** Spectral & Features
- **scenario:** Post-repair: node script runs cqt on a 440 Hz sine (sr=22050, fmin=C2=65.41, n_bins=48, 12 bpo) and asserts argmax bin = round(12*log2(440/65.41)) = 33 with >12 dB dominance over bins +/-3 away; repeats for A3=220 -> bin 21 to prove log spacing. Prints per-bin magnitude sparkline table, exit code. Web tier-3 companion: log-frequency CQT heatmap of the arpeggio once xa-display is fixed.
- **proof:** Currently FAILS: spot-run peak bin 23/24 with monotonic ramp instead of an isolated peak at bin 12. Post-repair expected: peak bin exactly 33 for A4 over C2.
- **repair first:** Spot-run CONFIRMS broken: 440 Hz sine with fmin=220/24 bins peaks at bin 23 (expected 12) with a smooth monotonic magnitude ramp - output is garbage. Root causes: (1) __cqt_response multiplies TIME-domain wavelet filters (wavelet() returns windowed complex exponentials indexed by time) element-wise against STFT FREQUENCY bins - librosa FFTs the filterbank first (fft_basis); the math is category-error wrong. (2) resample is called positionally as resample(y, sr, sr_target, res_type) but xa-audioio.resample signature is (y, {origSr, targetSr}) - destructuring a number yields undefined===undefined so it silently returns y unchanged, leaving the filterbank built for sr/2 while the signal stays at sr whenever early-downsampling triggers (it does at the fmin=C1/84-bin defaults). (3) stft called with 8 args in __cqt_response/pseudo_cqt (extra dtype slot) so pad_mode receives null. (4) icqt uses a naive O(N^2) ifft_real and the same wrong basis; griffinlim_cqt inherits everything. (5) sparsity/norm/window params largely ignored (hann hardcoded in wavelet()). ~400 lines of dead private helpers (__early_downsample, __vqt_filter_fft, __num_two_factors) are never called. Effectively a rewrite against librosa constantq.py.

### loop/detect.js — Loop Detection Strategy Shootout + Golden Lock
- **surface:** both · **viz:** waveform · **domain:** Loop & Play Layer
- **bundle with:** loop/fast.js, loop/precise.js, loop/musical.js, loop/recurrence.js, loop/score.js
- **scenario:** NODE: golden-lock harness — decode all 4 golden WAVs from apps/demo/public/audio with io/wav decodeWav into an AudioBuffer shim, run detect({strategy:'fast'}) on each, print a table (file | loopStart | loopEnd | bpm | confidence) against tools/parity/fixtures/loop_goldens.json with the fixture's ±441-sample tolerance; exit 0 only if all 4 match. WEB: shootout page — load 'Drive Through Beat.wav', run all four strategies, draw one waveform with four colored loop-region overlays + a result table (strategy, bounds, confidence, bpm-or-'tempo-free'), click a row to audition that loop via LoopPlayer; the 'fast' row gets a GOLDEN pass/fail badge vs the fixture.
- **proof:** Verified live in Node this session: fast on 'Bassline For Doppler Song longer.wav' → 11.9886→14.6008s, bpm 92.29, conf 0.957 (golden 11.98857→14.60082, bpm 92.285 — exact); on 'Drive Through Beat.wav' precise 4.089→8.788 conf 0.221 bpm 127.8, musical 0→1.877 conf 0.094, recurrence 0.001→1.879 conf 0.248 (tempo-free), none throw. Demo asserts all 4 goldens within ±441 samples.

### loop/recurrence.js — Recurrence Matrix Heatmap + Tempo-Free Lag Proof
- **surface:** both · **viz:** matrix-heatmap · **domain:** Loop & Play Layer
- **bundle with:** loop/detect.js, sequence/rqa.js
- **scenario:** NODE: synthesize a 4-chord arpeggio pattern with a 2.0s harmonic period repeated 4x (chroma-distinct chords, no percussion — the tempo-free strategy's home turf); detect({strategy:'recurrence'}) → assert loopEnd−loopStart within 2.0±0.1s and result has NO bpm field; rerun with {rqa:true} → assert candidates[] contains a {source:'rqa'} entry with lagFrames ≈ 2.0s·sr/hopLength. WEB: render the frames×frames chroma recurrence matrix of 'Bassline For Doppler Song longer.wav' as a canvas heatmap with the winning lag drawn as an off-diagonal stripe; badge asserts detected loop duration equals lag×hop/sr and matches the audible loop on audition.
- **proof:** Node: period recovered 2.0±0.1s, no bpm key present (tempo-free contract), rqa candidate present with matching lag; verified live that recurrence completes on real audio (0.001→1.879s, conf 0.248 on Drive Through Beat). Web: heatmap stripe visually coincides with the reported lag.

### scripts/xa-vocal-separation.js — FLAGSHIP: multi-scale fingerprint vocal separation on a synthetic mix, A/B audition + suppression numbers
- **surface:** web · **viz:** spectrogram · **domain:** Effects, Decompose & Structure
- **scenario:** Synthesize a known 'vocal' (440Hz carrier with 5Hz/30-cent vibrato + 2 formant partials) and a 'backing' (110Hz bass + click train); mixture = sum. Run processAudioToFingerprints on vocal and mixture, optimizeEqCurves (100 iters, lr 0.01), reconstructVocal on the mixture STFT. Page shows mixture vs reconstruction spectrograms side by side, play buttons for vocal/backing/mixture/reconstruction, the optimizer loss curve, and a suppression scoreboard.
- **proof:** Badge 1: final optimizer loss < initial loss (monotone-ish descent, printed). Badge 2 (selectivity): 110Hz-band energy ratio out/in is at least 6 dB LOWER than the 400-900Hz band ratio (backing suppressed more than vocal). Badge 3: corr(reconstruction, vocal) > corr(reconstruction, backing) — measured 0.443 vs 0.371 in a tiny 40-iter Node spot-run, gap widens with full iterations/length. Whole pipeline verified end-to-end in Node with a mock AudioBuffer, so a node CI variant of badges 1-3 is trivial to add.

### scripts/xa-advanced.js — Post-repair: Griffin-Lim reconstruction A/B (librosa-gallery-class) ⚠️ NEEDS-REPAIR
- **surface:** both · **viz:** spectrogram · **domain:** Effects, Decompose & Structure
- **scenario:** 440Hz+660Hz 1s chord -> |STFT(1024,256)| -> griffinlim(32 iters) -> web plays original vs reconstruction with side-by-side spectrograms and a per-iteration spectral-convergence line; node prints length, per-iteration error, and pitch estimates. (Currently FAILS at step 1: output length 1 — the demo doubles as the repair gate.)
- **proof:** Reconstruction length == expected istft length (not 1); zero-crossing/FFT-peak pitch of reconstruction within 1% of 440Hz fundamental; spectral convergence error strictly decreases over the first 8 iterations; |STFT(recon)| vs target magnitude relative L2 error < 0.1 after 32 iters.
- **repair first:** RUNTIME-CONFIRMED BROKEN: griffinlim returns a length-1 array — it calls istft(S, hop, win_length, n_fft, window, ...) but xa-fft istft's signature is (D, hop_length, win_length, window, center, length), so n_fft lands in the window slot and center lands in length; its stft calls likewise pass dtype into pad_mode. Fix is pure argument reordering. THIS PROPAGATES: xa-inverse.js imports griffinlim, so mel_to_audio/mfcc_to_audio are broken too. Also placeholder-quality: reassigned_spectrogram's __reassign_frequencies/__reassign_times compute the 'derivative-window' STFT as the SAME plain STFT, so reassignment offsets are meaningless; fmt uses linear interp + O(n^2) DFT, unverified; pcen works but its smoothing coefficient b=exp(-1/(tc*fr)) differs from librosa's sqrt-based formula. Fine as-is: hpss/pitch_shift/phase_vocoder shims, magphase, rms/zcr/linspace/find_peaks/normalize_features.

### scripts/dj-loop-analyzer.js — DJ crate demo: 6 synthetic loops, similarity ranking + Camelot compatibility ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** matrix-heatmap · **domain:** Effects, Decompose & Structure
- **bundle with:** scripts/xa-dtw.js
- **scenario:** Synthesize 6 loops with known recipes: A1/A2/A3 (120 BPM, A-minor chord tones + kick pattern, small variations) and B1/B2/B3 (150 BPM, Eb-major, different pattern). analyzeLoop all six, render the DTW similarity matrix heatmap, run findSimilarLoops(A1), play any pair back-to-back. Ground truth is built into the recipes.
- **proof:** Badges: (1) top-2 matches for A1 are exactly {A2, A3}; (2) all A-A similarities > all A-B similarities (matrix block structure visible in heatmap); (3) detected tempo within +/-2 BPM of 120/150 per loop; (4) compareLoops(A1,A1clone).similarity > 0.9 (measured 0.967); (5) calculateKeyCompatibility(A-minor, C-major) returns 0.9 (relative-key Camelot rule).
- **repair first:** Core path VERIFIED WORKING in Node (compareLoops: 514ms, similarity 0.967 on same-recipe loops, tempoMatch true, Camelot key compatibility true). Broken/placeholder: (1) clusterLoops calls clustering.map(...) on the OBJECT dtwKMeans returns ({assignments,centers,clusters}) — TypeError every time, silently caught, ALWAYS falls back to tempo-range clustering; fix to use clustering.clusters. (2) analyzeClusterCharacteristics returns hardcoded placeholders (avgTempo 120, 'C major', ['house','melodic']). (3) extractTimbralFeatures returns hardcoded {brightness:0.5,...}. (4) estimateKey confidence is an unnormalized Krumhansl dot product. Member-matching in clusterLoops relies on array identity (fragile).

### plot_chroma — Enhanced chroma: harmonic + non-local + median ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** matrix-heatmap · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize a C-E-G arpeggio over noise-burst percussion; compute raw feature.chroma_stft, then the enhanced pipeline: effects.harmonic(margin=8) -> chroma_stft -> element-min with nn_filter(median, cosine) -> horizontal median filter (size 9); render raw vs enhanced chromagrams as canvas heatmaps.
- **proof:** Badge asserts enhanced chromagram's top-3 pitch-class rows == {C, E, G} and the energy-concentration ratio (C+E+G rows / total) improves by >20% over raw chroma.
- **repair first:** nn_filter (scripts/xa-decompose.js) spot-runs but is unexported/unverified — promote with a cosine-metric/median-aggregate fixture. chroma_cqt depends on marathon cqt (scripts/xa-constantq.js, spot-run gives 84x44 on 1s sine) — both need parity fixtures before the page's CQT-chroma variant is honest. chroma_cens is an explicit removed() stub in scripts/xa-spectral.js — genuinely unimplemented; needed for the chroma-variants section.

### plot_dynamic_beat — Beat tracking through an accelerando ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** line-plot · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize a click track accelerating 60->180 BPM over 20 s; run static tempo() and (post-repair) per-frame tempo(aggregate:null, stdBpm:4); plot both tempo curves over the waveform; feed the dynamic curve to beat_track(bpm=array), sonify both beat sets with clicks() for A/B playback.
- **proof:** Badge asserts the dynamic tempo curve is monotonically increasing (rank correlation vs time > 0.9) with endpoints within ±10% of 60/180 BPM, and dynamic-beat inter-beat intervals shrink monotonically while static beats mis-align (early-section surplus, late-section deficit).
- **repair first:** Two hard API gaps, confirmed in source: tempo() (scripts/xa-beat-tracker.js) computes a mean tempogram and returns a single scalar — no aggregate=null per-frame mode (needs windowed tempogram -> per-frame argmax with std_bpm param); beat_track explicitly throws 'time-varying bpm arrays are not supported yet; pass a scalar bpm' — the DP needs per-frame tempo support. clicks() sonification also needs xa-audioio promotion.

### plot_music_sync — Music synchronization with DTW
- **surface:** web · **viz:** matrix-heatmap · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Take one synthesized melody, create a second rendition with effects.time_stretch(rate=1.25) (verified, known ground-truth warp); chroma_stft(hop=1024) on both; sequence.dtw(metric='cosine'); render the cumulative-cost matrix as a canvas heatmap with the warping path overlaid, plus connection lines between the two waveforms at 20 sampled path points.
- **proof:** Badge asserts warping-path median local slope == 1.25 ±5% (recovers the known stretch factor) and path endpoints are exactly (0,0) and (N−1,M−1).

### plot_pcen_stream — Streaming PCEN: blocks == whole file ⚠️ NEEDS-REPAIR
- **surface:** node · **viz:** line-plot · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Stream a long WAV in 16-frame blocks (n_fft 2048, hop 512, no centering), computing stft per block and pcen(..., zi, return_zf=true) carrying filter state across blocks; collect max-over-frequency PCEN per frame; separately compute PCEN over the whole decoded signal in one shot; print first/last 5 values of both curves plus a terminal sparkline.
- **proof:** Printed table asserts max-abs difference between block-wise and full-signal PCEN curves < 1e-6 (post-warmup frames); process exit code reflects pass/fail.
- **repair first:** pcen exists in scripts/xa-advanced.js with zi/return_zf already in the signature (spot-run gives finite plausible output with positional args — beware: positional signature, not options object) but is unexported and has no librosa fixture (incl. max_size>1 max-pooling path). Also missing a librosa.stream equivalent file-block iterator — add an io/ block reader over decoded PCM; and verify stft supports center=false framing for block equivalence.

### plot_rainbowgram — Rainbowgram: phase you can see
- **surface:** web · **viz:** spectrogram · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize a linear chirp 32->1024 Hz plus a steady 440 Hz partial (inline, ~5 lines); stft -> magnitude + phase; compute demodulated phase differential (unwrap(angle − 2πft), diff along time in plain JS); hand-render to canvas with hue = phase-diff (HSV) and alpha = amplitude_to_db(mag)/80 + 1 on a black background — the NSynth rainbowgram.
- **proof:** Badge asserts mean |demodulated phase diff| at the exact 440 Hz bin < 0.05 rad (color-stable band) while a deliberately detuned 452 Hz partial shows constant drift equal to 2π·Δf·hop/sr ±10% — the rainbow's hue gradient is quantitatively verified.

### plot_segmentation — Laplacian segmentation of an AABA form ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** matrix-heatmap · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize an AABA-structured clip (two alternating 4 s chord textures); beat_track -> beat-sync chroma_stft via util.sync; recurrenceMatrix(mode:'affinity', width:3, sym:true) + timelag median filtering; combine with MFCC path similarity; Laplacian -> eigenvectors -> k-means(k=3); paint labeled section rectangles over the spectrogram and show the recurrence heatmap.
- **proof:** Badge asserts detected boundaries fall within ±1 beat of the known 4 s section grid and both A sections receive the same cluster label.
- **repair first:** Missing entirely: normalized graph Laplacian helper, a symmetric eigensolver (Jacobi — small dependency-free port), and k-means — the three scipy/sklearn pieces of the McFee-Ellis method. util.sync/fix_frames spot-run but are unexported/unverified. cqt is marathon-unverified (chroma_stft substitutes but diverges from the page's CQT features). timelag_filter can be composed today from verified recurrenceToLag/lagToRecurrence + a JS median filter.

### plot_spectral_harmonics — Harmonic spectrum: track f0, peel the overtones ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** spectrogram · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Synthesize a quasi-vowel with f0 gliding 110->165 Hz carrying harmonics 1..10 at amplitudes 1/h; pyin(50, 300) -> overlay the f0 contour on a log-frequency spectrogram canvas; f0_harmonics(S, f0, 1..10, fft_frequencies) -> render the f0-normalized harmonic-energy heatmap; resynthesize with a Web Audio additive oscillator bank (original glide, then monotone 110 Hz) and play.
- **proof:** Badge asserts median pyin f0 error < 1% against the known glide and recovered harmonic amplitude ratios follow 1/h within 15% for h ≤ 5; harmonic-energy rows are flat (f0-normalized) where the raw spectrogram slopes.
- **repair first:** pyin/yin spot-run with librosa-grade accuracy (220 Hz sine -> 220.0096 Hz, voiced_flag true) but are unexported/unverified — promote with a fixture covering f0 + voiced_flag; note positional signature pyin(y, fmin, fmax, sr, ...). f0_harmonics/interp_harmonics (scripts/xa-harmonic.js) import cleanly but have no fixtures. Also need a small additive pitch_contour synth helper (mir_eval.sonify equivalent) for the resynthesis/monotone half.

### plot_vocal_separation — REPET-SIM vocal separation, browser edition ⚠️ NEEDS-REPAIR
- **surface:** web · **viz:** spectrogram · **domain:** Librosa Advanced-Example Replicas
- **scenario:** Mix an 8x-repeated synth accompaniment loop with intermittent vocal-like wobbling sine bursts at known windows; stft -> nn_filter(median, cosine, width=time_to_frames(2)) -> element-min with S -> decompose.softmask foreground/background (margins 2/10, power 2) -> istft foreground with original phase; render full/background/foreground spectrogram rows; A/B play buttons for mix vs separated foreground.
- **proof:** Badge asserts separated foreground's burst-window/non-burst energy ratio improves by > 6 dB over the mix and background retains > 80% of loop energy; audible proof: bursts isolated, loop gone.
- **repair first:** Only nn_filter is missing from the verified surface — scripts/xa-decompose.js spot-runs (6x20 matrix in/out) but needs a cosine-metric + median-aggregate + width-in-frames parity fixture and promotion into decompose/. Everything else in REPET-SIM (stft/istft, softmask with margins/power, amplitude_to_db) is already fixture-gated.


## Shims / internal (covered by canonicals — no own demo)

- `scripts/debug.js` — No standalone demo — 25-line env-guarded logging toggle (PLECO_DEBUG env var in Node, window.PLECO_DEBUG in browser). Its behavior is exerci
- `scripts/xa-chroma.js` — No own demo - legacy shim. chroma_stft/constant_q_transform/cqt_to_chroma delegate to feature/chroma.js, which the C-major arpeggio chromagr
- `core/vector-rhythm.js` — Not exported from core/index.js or the package index — consumed only by scripts/quantum-sequencer.js. Its behavior is proven inside the quan
- `scripts/xa-temporal.js` — Shim over segment/index.js (verified in Node: flat Float32Array returns, sparse format, agglomerative [0,8] correct). Covered by the segment
- `scripts/xa-dtw.js` — Shim over sequence/dtw.js keeping the legacy positional signature and {distance, cost_matrix, path, normalized_distance} shape (verified: di
- `scripts/xa-matching.js` — Shim over sequence/matching.js (verified: quickMatchEvents [1,2], matchBeatsToOnsets matchRate 1.0 on 30ms-jittered onsets). Covered by the 
- `scripts/xa-split.js` — Shim over effects/index.js split (verified: [[4096,16384]] on a mid-buffer burst). Covered by the effects/index.js demo; getNonSilentSegment
- `scripts/xa-trim.js` — Shim over effects/index.js trim returning the legacy {y_trimmed, index} shape (verified: index [4096,16384]). Covered by the effects/index.j
- `scripts/xa-remix.js` — Shim over effects/index.js remix, caller order preserved (verified: reversed-halves remix runs, zero-crossing snapping shifts length as expe
- `scripts/xa-processing.js` — hpss/time_stretch/pitch_shift/phase_vocoder are verified shims to decompose/effects canon — covered by the effects/index.js and decompose/in
- `advanced` — No own demo — this page is the gallery wrapper; it is covered collectively by the 15 example-demo pages and becomes pleco's demo index.

## Needs-repair register (blocking their demos)

- `scripts/xa-bpm-algorithm.js`: VERIFIED broken: estimateConstrainedTempo reduces a 4s window to ~15 energy points but its BPM search needs lags >= ~15, so the autocorrelation loop never executes and every window silently returns globalTempo — the window-by-window 'tempo stability' output is constant regardless of actual tempo cha
- `scripts/xa-tempogram.js`: VERIFIED broken vs its own 'port of librosa' claim: (1) fourier_tempogram passes hop_length=512 to the STFT of the onset envelope where librosa uses hop=1, collapsing output to 1 column; (2) estimate_tempo picks the raw autocorrelation max with no tempo prior -> subharmonic 60 BPM on a 120 BPM click
- `scripts/xa-constantq.js`: Spot-run CONFIRMS broken: 440 Hz sine with fmin=220/24 bins peaks at bin 23 (expected 12) with a smooth monotonic magnitude ramp - output is garbage. Root causes: (1) __cqt_response multiplies TIME-domain wavelet filters (wavelet() returns windowed complex exponentials indexed by time) element-wise 
- `scripts/xa-pitch.js`: yin is verified good (spot-run: median 220.01 Hz on a 220 Hz sine). pyin is NOT real pYIN - confirmed: no HMM/Viterbi decoding, boltzmann_parameter and beta shape accepted but unused (the real pYIN machinery sits in dead, never-called private helpers __pyin_helper/_cumulative_mean_normalized_differe
- `scripts/xa-harmonic.js`: Core is sound - spot-run: f0_harmonics on a 220 Hz tone with 1/0.5/0.25-amp harmonics returned 436.2 : 239.9 : 112.2 (ratios 1 : 0.55 : 0.26, correct), HPS peak within one FFT bin of 220 Hz. BUT salience's filter_peaks filters local maxima along the TIME axis (it maps over each frequency row and com
- `scripts/xa-display.js`: Node-confirmed crash on the package's own data format: cmap([Float32Array,...]) throws 'cmap: data contains no valid finite values' because Array.prototype.flat() does not flatten typed-array rows and Number.isFinite then filters out every row object - and specshow calls S.flat() the same way. Since
- `scripts/xa-inverse.js`: Three of four exports broken, node-confirmed. (1) mfcc_to_mel throws immediately: calls idct(frame, n_mels, inverse_type, norm) but xa-mel idct signature is (coeffs, type, norm) so type receives n_mels -> 'Unsupported DCT type: 128' (spot-run). Even with args fixed, idct returns length-n_mfcc and ca
- `scripts/SpectrumAnalyzer.js`: renderStaticSpectrum always throws: after offline rendering it constructs new RealtimeSpectrumAnalyzer(canvas, {sampleRate}, opts) with a fake context that has no createAnalyser() -> TypeError in the constructor; the approach is also unsound (AnalyserNode.getByteFrequencyData after OfflineAudioConte
- `scripts/WaveformRenderer.js`: renderStereoWaveform crashes: calls nonexistent ctx.clipRect() (Canvas API needs rect()+clip()), and even fixed, it re-invokes renderWaveform which clearRects and re-scales the whole canvas, ignoring the translate - needs per-channel offscreen or region-aware rendering. renderWaveform's HiDPI block 
- `scripts/algorithmic-sequences.js`: Fuzz measured 90/800 degenerate loop states: 'move' uses modulo wrap so a full-width loop maps to {0,0} (endSample % length === 0 when end hits buffer length) and wrapped loops can get end < start; repeated half/fractal/stutter on tiny loops collapse to zero width (endSample === startSample); phaseS
- `scripts/quantum-sequencer.js`: playQuantumOps reads/writes window.quantumSequenceCount — a global bus (crashes headless, violates the Wave-6 explicit-injection convention); executing any 'phase' op routes through audio-ops-extended.phase which reads window.phaserParams, so buildQuantumSequence STEP EXECUTION breaks in Node whenev
- `lib/effects/xa-fx.js`: Two problems: (1) this file is a near-verbatim duplicate of scripts/audio-ops-extended.js (stutter/phase/fractal/applyQuantumOp identical) — the package index exports applyQuantumOp from HERE while quantum-sequencer imports the audio-ops-extended copy, so two live copies can silently diverge; dedupe
- `scripts/xa-notation.js`: Runtime-confirmed table/logic bugs: (1) mela_to_svara cannot emit G1/G2/N1/N2 — degree->name map is single-valued, so mela 22 returns [S,R2,R3,M1,P,D2,D3] instead of its own docstring's [S,R2,G2,M1,P,D2,N2]; fix by slot-aware naming (R slot vs G slot, D vs N) like librosa. (2) key_to_notes SILENTLY 
- `scripts/xa-fileio.js`: Browser-only, marathon-authored, never wave-verified in a real browser. stream() is decode-whole-file-then-chunk, NOT streaming, and its block semantics (blockLength-sample windows advancing by hopLength => overlapping blocks) do not match librosa.stream's block_length-frames contract — either renam
- `scripts/xa-file.js`: Browser-only, never wave-verified. (1) saveAudio uses the private _encodeWAV — one of the three divergent encoders that src/io/wav.js explicitly replaced; delegate to io/wav.encodeWav. (2) AUDIO_REGISTRY fetches https://librosa.org/data/assets/audio/<name>.ogg — remote paths unverified and durations
- `scripts/xa-effects.js`: RECOMMEND DELETE. Zero importers except the legacy pleco-audio.js barrel. Every librosa-named function duplicates effects/index.js with the exact bugs the canonical module fixed: phase_vocoder wraps the raw phase delta (not deviation-from-expected) with phase_acc starting at 0 and n_freq*2 (=n_fft+2
- `scripts/xa-decompose.js`: RECOMMEND DELETE with two salvage ports. Importers: only pleco-audio.js barrel and xa-effects.js (itself slated for deletion). hpss duplicates decompose/index.js with known deviations: default kernel 17 (librosa 31), power applied BEFORE median filtering with Wiener masks built from powered magnitud
- `scripts/xa-filters.js`: Split personality: preemphasis/deemphasis are verified shims to effects/index.js (KEEP — return {y, zf} object convention). Everything else is a marathon filterbank family, zero importers except the pleco-audio barrel, and duplicates src/filters/index.js canon: mel() here is WRONG — its htk=false 's
- `scripts/xa-advanced.js`: RUNTIME-CONFIRMED BROKEN: griffinlim returns a length-1 array — it calls istft(S, hop, win_length, n_fft, window, ...) but xa-fft istft's signature is (D, hop_length, win_length, window, center, length), so n_fft lands in the window slot and center lands in length; its stft calls likewise pass dtype
- `scripts/dj-loop-analyzer.js`: Core path VERIFIED WORKING in Node (compareLoops: 514ms, similarity 0.967 on same-recipe loops, tempoMatch true, Camelot key compatibility true). Broken/placeholder: (1) clusterLoops calls clustering.map(...) on the OBJECT dtwKMeans returns ({assignments,centers,clusters}) — TypeError every time, si
- `scripts/pleco-audio.js`: RECOMMEND DELETE (or quarantine to legacy/). Judgment basis: zero importers anywhere in src/ or the site (grep-verified); src/index.js is the real public surface with namespaced canon (effects/decompose/segment/sequence). This barrel keeps the condemned marathon copies alive (re-exports xa-effects.j
- `plot_audio_playback`: tone/chirp/clicks live in scripts/xa-audioio.js and pyin in scripts/xa-pitch.js — all spot-run fine in Node (chirp n=11025, pyin 220Hz sine -> 220.0096 Hz) but are unexported and have no fixture gates; promote to curated surface with fixtures (chirp instantaneous-frequency check, clicks sample-posit
- `plot_chroma`: nn_filter (scripts/xa-decompose.js) spot-runs but is unexported/unverified — promote with a cosine-metric/median-aggregate fixture. chroma_cqt depends on marathon cqt (scripts/xa-constantq.js, spot-run gives 84x44 on 1s sine) — both need parity fixtures before the page's CQT-chroma variant is honest
- `plot_dynamic_beat`: Two hard API gaps, confirmed in source: tempo() (scripts/xa-beat-tracker.js) computes a mean tempogram and returns a single scalar — no aggregate=null per-frame mode (needs windowed tempogram -> per-frame argmax with std_bpm param); beat_track explicitly throws 'time-varying bpm arrays are not suppo
- `plot_patch_generation`: util frame/sync/fix_frames live in scripts/xa-util.js — spot-run OK (frame() on n=100, L=10, H=5 -> 19 frames; fix_frames([3,7,9],0,12) -> [0,3,7,9,12]) but unexported/unverified; promote + fixture. Note pleco's frame() copies rather than returning a strided view — librosa's zero-copy claim does not
- `plot_pcen_stream`: pcen exists in scripts/xa-advanced.js with zi/return_zf already in the signature (spot-run gives finite plausible output with positional args — beware: positional signature, not options object) but is unexported and has no librosa fixture (incl. max_size>1 max-pooling path). Also missing a librosa.s
- `plot_segmentation`: Missing entirely: normalized graph Laplacian helper, a symmetric eigensolver (Jacobi — small dependency-free port), and k-means — the three scipy/sklearn pieces of the McFee-Ellis method. util.sync/fix_frames spot-run but are unexported/unverified. cqt is marathon-unverified (chroma_stft substitutes
- `plot_spectral_harmonics`: pyin/yin spot-run with librosa-grade accuracy (220 Hz sine -> 220.0096 Hz, voiced_flag true) but are unexported/unverified — promote with a fixture covering f0 + voiced_flag; note positional signature pyin(y, fmin, fmax, sr, ...). f0_harmonics/interp_harmonics (scripts/xa-harmonic.js) import cleanly
- `plot_viterbi`: The full viterbi family (viterbi, viterbi_discriminative, viterbi_binary, transition_{uniform,loop,cycle,local}) exists in scripts/xa-sequence.js and spot-runs correctly (toy 2-state decode -> [0,1,1], transition_loop(2,[0.5,0.6]) OK) but is unexported and has no librosa fixture — promote into the s
- `plot_vocal_separation`: Only nn_filter is missing from the verified surface — scripts/xa-decompose.js spot-runs (6x20 matrix in/out) but needs a cosine-metric + median-aggregate + width-in-frames parity fixture and promotion into decompose/. Everything else in REPET-SIM (stft/istft, softmask with margins/power, amplitude_t