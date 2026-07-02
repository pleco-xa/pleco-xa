# Wave 1: Bedrock DSP + Parity Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Numerically-correct DSP foundation (FFT/ifft, periodic windows, stft/istft, typed-array-safe util, conversions, one WAV codec) validated by a golden-fixture harness generated from real librosa.

**Architecture:** `tools/parity/generate.py` (pinned librosa in a venv) emits JSON fixtures → `packages/pleco-xa/tests/parity/*.test.js` asserts pleco within tolerance. Fixtures land FIRST; every DSP fix is proven against them. The 4 marathon parity-seed files graduate into the CI glob once green.

**Tech Stack:** Python 3 venv + librosa (pinned), vitest, existing `~/Developer/librosa` clone as reference source.

**Branch:** `v2-wave-1`

---

### Task 1: Parity harness — generator + venv + first fixture set

**Files:** Create `tools/parity/requirements.txt`, `tools/parity/generate.py`, `tools/parity/fixtures/*.json` (generated, committed)

- [ ] `requirements.txt`: `librosa==0.11.0`, `numpy`, `soundfile`
- [ ] venv: `python3 -m venv tools/parity/.venv && tools/parity/.venv/bin/pip install -r tools/parity/requirements.txt` (venv gitignored)
- [ ] `generate.py` produces deterministic signals in-code (no audio files needed for Wave 1): 1s 440Hz sine @22050, white noise seeded np.random.default_rng(42), click train. Emits JSON fixtures with inputs + expected outputs for: `hann/hamming/blackman windows (periodic, n=16/512/2048)`, `fft_frequencies`, `hz_to_mel/mel_to_hz (slaney + htk)`, `hz_to_midi/midi_to_hz`, `amplitude_to_db/power_to_db/db_to_amplitude/db_to_power`, `frames_to_time/time_to_frames/samples_to_frames`, `mel filterbank (128 mels, slaney norm + htk variant)`, `stft magnitude (n_fft=512, hop=128, center=True)`, `stft->istft round-trip target (the input itself)`, `A/B/C/D weighting curves`.
- [ ] Fixture format: `{"meta": {"librosa": "0.11.0", "fn": "...", "params": {...}}, "cases": [{"input": ..., "expected": ...}]}`; float arrays as plain lists (float32-rounded).
- [ ] Commit generator + fixtures.

### Task 2: Tolerance helper + parity specs for conversions & windows (RED first)

**Files:** Create `packages/pleco-xa/tests/parity/helpers.js`, `tests/parity/conversions.parity.test.js`, `tests/parity/windows.parity.test.js`

- [ ] `helpers.js`: `loadFixture(name)` (reads ../../../../tools/parity/fixtures/), `expectClose(actual, expected, {rtol=1e-5, atol=1e-8})` elementwise with max-error reporting.
- [ ] Write specs asserting pleco vs fixtures. Run: expect FAILURES (windows symmetric, Float32Array dispatch NaN). These failures are the work orders for Tasks 3–5.

### Task 3: Fix the FFT core (`xa-fft.js`)

- [ ] `ifft`: implement complex inverse properly (swap-real/imag trick or inverse butterfly). Delete the `fft(conjugated.map(b => b.real))` line. Add unit test: `ifft(fft(x)) ≈ x` for random complex and real inputs (1e-6).
- [ ] All window generators → periodic (`2πi/n`, not `n-1`); `get_window(type, n, periodic=true)` param.
- [ ] `stft`: verify win_length/pad_mode handling against fixture; `istft`: round-trip test `max|istft(stft(y)) - y| < 1e-6` on the sine fixture (center-trimmed).
- [ ] Propagate to `apps/demo/public/scripts/xa-fft.js` via sync script (add to whitelist if absent).
- [ ] Parity specs for windows + stft green. Commit.

### Task 4: Typed-array-safe `xa-util.js`

- [ ] `getShape`/`flatten`/finiteness: handle TypedArrays (ArrayBuffer.isView). `frame(Float32Array)` returns real frames; `validAudio`/`normalize` accept Float32Array. Delete `cache()` JSON.stringify wrappers (call directly). `tiny()` → smallest-normal constant.
- [ ] Unit tests for each on Float32Array inputs. Commit.

### Task 5: Float32Array dispatch sweep (marathon modules)

- [ ] In `xa-convert.js`, `xa-normalize.js` (and any module using `Array.isArray(x)` to detect array input): replace with `Array.isArray(x) || ArrayBuffer.isView(x)` helper `isArrayLike` exported from xa-util. Conversions parity spec green including Float32Array input cases. Commit.

### Task 6: One WAV codec (`src/io/wav.js`)

- [ ] New module: `encodeWav(channels: Float32Array[], sampleRate) -> ArrayBuffer` (interleaved 16-bit PCM, correct multi-channel) + `decodeWav(ArrayBuffer) -> {channels, sampleRate}` (PCM16/24/32f). Unit test: encode→decode round-trip mono + stereo; stereo interleaving asserted sample-by-sample.
- [ ] `audio-utils.exportBufferAsWav` and `xa-file._encodeWAV` delegate to it (fixes the channel-block corruption); `xa-wav-encoder.js` re-exports. Commit.

### Task 7: Graduate parity seeds

- [ ] Run `parity-seeds/xa-convert.test.js` + `xa-fft.test.js`: fix remaining real failures they expose (missing exports, validation). Move both into `tests/` glob when green. (`xa-beat`/`xa-onset` seeds wait for Wave 2.)
- [ ] Full suite + build + import smoke + demo build green. Merge `v2-wave-1` → main, push, CI green.

### Exit gate
- All Wave-1 fixtures pass in CI; `ifft` round-trip proven; barrel exports conversions + io; `PARITY.md` started with the exceptions ledger skeleton.
