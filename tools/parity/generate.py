#!/usr/bin/env python3
"""Golden-fixture generator for pleco-xa parity tests.

Runs pinned librosa (see requirements.txt) over deterministic in-code signals
and writes JSON fixtures consumed by packages/pleco-xa/tests/parity/*.test.js.
Re-run only when adding fixtures or bumping the librosa pin.
"""

import json
from pathlib import Path

import librosa
import numpy as np
import scipy.signal

OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(exist_ok=True)

SR = 22050


def f32(x):
    """Round through float32 (pleco computes in f32) and listify."""
    return np.asarray(x, dtype=np.float64).astype(np.float32).astype(np.float64).tolist()


def write(name, fn, params, cases):
    payload = {
        "meta": {"librosa": librosa.__version__, "fn": fn, "params": params},
        "cases": cases,
    }
    path = OUT / f"{name}.json"
    path.write_text(json.dumps(payload))
    print(f"wrote {path.name} ({len(cases)} cases)")


def signals():
    rng = np.random.default_rng(42)
    t = np.arange(SR) / SR
    sine = np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
    noise = (rng.standard_normal(SR) * 0.25).astype(np.float32)
    clicks = np.zeros(SR, dtype=np.float32)
    clicks[:: SR // 8] = 1.0  # 8 clicks/sec
    return {"sine440": sine, "noise": noise, "clicks": clicks}


def gen_windows():
    cases = []
    for n in (16, 512, 2048):
        for w in ("hann", "hamming", "blackman"):
            win = librosa.filters.get_window(w, n, fftbins=True)
            cases.append({"input": {"window": w, "n": n, "periodic": True}, "expected": f32(win)})
    write("windows", "librosa.filters.get_window(fftbins=True)", {}, cases)


def gen_fft_frequencies():
    cases = []
    for sr, n_fft in ((22050, 512), (22050, 2048), (44100, 1024)):
        cases.append({"input": {"sr": sr, "n_fft": n_fft},
                      "expected": f32(librosa.fft_frequencies(sr=sr, n_fft=n_fft))})
    write("fft_frequencies", "librosa.fft_frequencies", {}, cases)


def gen_conversions():
    hz = [20.0, 60.0, 110.0, 440.0, 1000.0, 4000.0, 11025.0]
    mel_slaney = librosa.hz_to_mel(hz, htk=False)
    mel_htk = librosa.hz_to_mel(hz, htk=True)
    midi = librosa.hz_to_midi([27.5, 440.0, 880.0, 4186.0])
    amp = [1e-6, 0.001, 0.5, 1.0, 2.0]
    cases = [
        {"input": {"fn": "hz_to_mel", "hz": hz, "htk": False}, "expected": f32(mel_slaney)},
        {"input": {"fn": "hz_to_mel", "hz": hz, "htk": True}, "expected": f32(mel_htk)},
        {"input": {"fn": "mel_to_hz", "mel": f32(mel_slaney), "htk": False}, "expected": f32(librosa.mel_to_hz(mel_slaney, htk=False))},
        {"input": {"fn": "hz_to_midi", "hz": [27.5, 440.0, 880.0, 4186.0]}, "expected": f32(midi)},
        {"input": {"fn": "midi_to_hz", "midi": f32(midi)}, "expected": f32(librosa.midi_to_hz(midi))},
        {"input": {"fn": "amplitude_to_db", "S": amp, "ref": 1.0}, "expected": f32(librosa.amplitude_to_db(np.array(amp), ref=1.0, top_db=None))},
        {"input": {"fn": "power_to_db", "S": amp, "ref": 1.0}, "expected": f32(librosa.power_to_db(np.array(amp), ref=1.0, top_db=None))},
        {"input": {"fn": "db_to_amplitude", "db": [-120.0, -60.0, -6.0, 0.0, 6.0]}, "expected": f32(librosa.db_to_amplitude(np.array([-120.0, -60.0, -6.0, 0.0, 6.0])))},
        {"input": {"fn": "db_to_power", "db": [-120.0, -60.0, -6.0, 0.0, 6.0]}, "expected": f32(librosa.db_to_power(np.array([-120.0, -60.0, -6.0, 0.0, 6.0])))},
        {"input": {"fn": "frames_to_time", "frames": [0, 10, 43, 100], "sr": SR, "hop_length": 512},
         "expected": f32(librosa.frames_to_time(np.array([0, 10, 43, 100]), sr=SR, hop_length=512))},
        {"input": {"fn": "time_to_frames", "times": [0.0, 0.25, 1.0, 2.5], "sr": SR, "hop_length": 512},
         "expected": librosa.time_to_frames(np.array([0.0, 0.25, 1.0, 2.5]), sr=SR, hop_length=512).tolist()},
        {"input": {"fn": "samples_to_frames", "samples": [0, 512, 5120, 22050], "hop_length": 512},
         "expected": librosa.samples_to_frames(np.array([0, 512, 5120, 22050]), hop_length=512).tolist()},
    ]
    write("conversions", "librosa.core.convert", {}, cases)


def gen_weighting():
    freqs = [31.5, 63.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0]
    cases = []
    for kind in "ABCD":
        w = librosa.frequency_weighting(np.array(freqs), kind=kind)
        cases.append({"input": {"kind": kind, "frequencies": freqs}, "expected": f32(w)})
    write("weighting", "librosa.frequency_weighting", {}, cases)


def gen_mel_filterbank():
    cases = []
    for htk, norm in ((False, "slaney"), (True, None)):
        fb = librosa.filters.mel(sr=SR, n_fft=512, n_mels=40, htk=htk, norm=norm)
        cases.append({
            "input": {"sr": SR, "n_fft": 512, "n_mels": 40, "htk": htk, "norm": norm or "none"},
            "expected_shape": list(fb.shape),
            "expected": f32(fb.ravel()),
        })
    write("mel_filterbank", "librosa.filters.mel", {}, cases)


def gen_stft():
    sigs = signals()
    cases = []
    for name in ("sine440", "clicks"):
        y = sigs[name][: SR // 4]  # 0.25 s keeps fixtures small
        D = librosa.stft(y, n_fft=512, hop_length=128, window="hann", center=True, pad_mode="constant")
        mag = np.abs(D)
        cases.append({
            "input": {"signal": name, "y": f32(y), "n_fft": 512, "hop_length": 128,
                      "window": "hann", "center": True, "pad_mode": "constant"},
            "expected_shape": list(mag.shape),
            "expected_mag": f32(mag.ravel()),
        })
    write("stft", "librosa.stft |magnitude|", {}, cases)


def gen_istft_roundtrip():
    sigs = signals()
    y = sigs["sine440"][: SR // 4]
    D = librosa.stft(y, n_fft=512, hop_length=128, center=True)
    y_hat = librosa.istft(D, hop_length=128, window="hann", center=True, length=len(y))
    err = float(np.max(np.abs(y_hat - y)))
    write("istft_roundtrip", "librosa.istft(librosa.stft(y))", {"librosa_max_err": err}, [{
        "input": {"y": f32(y), "n_fft": 512, "hop_length": 128, "center": True},
        "expected": f32(y),  # round-trip target is the input itself
        "tolerance_note": f"librosa itself achieves max_err={err:.2e}",
    }])


if __name__ == "__main__":
    gen_windows()
    gen_fft_frequencies()
    gen_conversions()
    gen_weighting()
    gen_mel_filterbank()
    gen_stft()
    gen_istft_roundtrip()
    print("done")


# ---------------- Wave 2: rhythm ----------------

def _click_signal(bpm, dur=3.0):
    times = np.arange(0, dur, 60.0 / bpm)
    return librosa.clicks(times=times, sr=SR, click_duration=0.05, length=int(dur * SR)).astype(np.float32)


def gen_melspectrogram():
    cases = []
    for name, y in (("click120", _click_signal(120.0)), ("sine440", signals()["sine440"][: SR // 2])):
        S = librosa.feature.melspectrogram(y=y, sr=SR, n_fft=2048, hop_length=512, n_mels=128)
        cases.append({
            "input": {"signal": name, "y": f32(y), "sr": SR, "n_fft": 2048, "hop_length": 512, "n_mels": 128},
            "expected_shape": list(S.shape),
            "expected": f32(S.ravel()),
        })
    write("melspectrogram", "librosa.feature.melspectrogram", {}, cases)


def gen_onset_strength():
    cases = []
    for name, y in (("click120", _click_signal(120.0)), ("click99", _click_signal(99.0))):
        env = librosa.onset.onset_strength(y=y, sr=SR)
        cases.append({
            "input": {"signal": name, "y": f32(y), "sr": SR},
            "expected": f32(env),
        })
    write("onset_strength", "librosa.onset.onset_strength", {}, cases)


def gen_tempo_beats():
    cases = []
    for name, bpm in (("click120", 120.0), ("click99", 99.0)):
        y = _click_signal(bpm)
        env = librosa.onset.onset_strength(y=y, sr=SR)
        t = librosa.feature.tempo(onset_envelope=env, sr=SR)
        tempo_est, beats = librosa.beat.beat_track(onset_envelope=env, sr=SR, units="frames")
        cases.append({
            "input": {"signal": name, "true_bpm": bpm, "y": f32(y), "sr": SR},
            "expected_tempo": float(np.atleast_1d(t)[0]),
            "expected_beat_tempo": float(np.atleast_1d(tempo_est)[0]),
            "expected_beats": np.asarray(beats).tolist(),
        })
    write("tempo_beats", "librosa.feature.tempo + librosa.beat.beat_track", {}, cases)


gen_melspectrogram()
gen_onset_strength()
gen_tempo_beats()
print("rhythm fixtures done")


# ---------------- Wave 3: structure (RQA for loop detection) ----------------

def gen_rqa():
    rng = np.random.default_rng(7)
    cases = []
    # Small deterministic recurrence matrices: random + one with a planted diagonal
    R1 = (rng.random((24, 24)) < 0.2).astype(np.float64)
    R2 = np.zeros((32, 32))
    for i in range(20):
        R2[i + 6, i] = 1.0  # planted off-diagonal path (a "loop" signature)
    R2 += (rng.random((32, 32)) < 0.05)
    R2 = np.clip(R2, 0, 1)
    for name, R in (("random24", R1), ("planted32", R2)):
        score, path = librosa.sequence.rqa(R, gap_onset=1, gap_extend=1, knight_moves=True, backtrack=True)
        cases.append({
            "input": {"name": name, "R": R.ravel().tolist(), "shape": list(R.shape),
                      "gap_onset": 1, "gap_extend": 1, "knight_moves": True},
            "expected_path": np.asarray(path).tolist(),
            "expected_score_max": float(np.max(score)),
        })
    write("rqa", "librosa.sequence.rqa", {}, cases)


gen_rqa()
print("rqa fixtures done")


# ---------------- Wave 4: spectral features ----------------

def gen_spectral_features():
    sigs = signals()
    cases = []
    for name in ("sine440", "noise"):
        y = sigs[name][: SR // 2]
        entry = {"input": {"signal": name, "y": f32(y), "sr": SR, "n_fft": 2048, "hop_length": 512}}
        S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
        entry["centroid"] = f32(librosa.feature.spectral_centroid(S=S, sr=SR).ravel())
        entry["bandwidth"] = f32(librosa.feature.spectral_bandwidth(S=S, sr=SR).ravel())
        entry["rolloff"] = f32(librosa.feature.spectral_rolloff(S=S, sr=SR).ravel())
        entry["flatness"] = f32(librosa.feature.spectral_flatness(S=S).ravel())
        entry["contrast_shape"] = list(librosa.feature.spectral_contrast(S=S, sr=SR).shape)
        entry["contrast"] = f32(librosa.feature.spectral_contrast(S=S, sr=SR).ravel())
        entry["rms"] = f32(librosa.feature.rms(S=S).ravel())
        entry["zcr"] = f32(librosa.feature.zero_crossing_rate(y).ravel())
        cases.append(entry)
    write("spectral_features", "librosa.feature.spectral_*", {"n_fft": 2048, "hop": 512}, cases)


def gen_mfcc():
    sigs = signals()
    cases = []
    for name in ("sine440", "noise"):
        y = sigs[name][: SR // 2]
        M = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=20)
        cases.append({
            "input": {"signal": name, "y": f32(y), "sr": SR, "n_mfcc": 20},
            "expected_shape": list(M.shape),
            "expected": f32(M.ravel()),
        })
    write("mfcc", "librosa.feature.mfcc", {}, cases)


def gen_chroma():
    sigs = signals()
    cases = []
    y = sigs["sine440"][: SR // 2]
    C = librosa.feature.chroma_stft(y=y, sr=SR, n_fft=2048, hop_length=512)
    cases.append({
        "input": {"signal": "sine440", "y": f32(y), "sr": SR, "n_fft": 2048, "hop_length": 512},
        "expected_shape": list(C.shape),
        "expected": f32(C.ravel()),
    })
    fb = librosa.filters.chroma(sr=SR, n_fft=2048)
    cases.append({
        "input": {"signal": "__filterbank__", "sr": SR, "n_fft": 2048},
        "expected_shape": list(fb.shape),
        "expected": f32(fb.ravel()),
    })
    write("chroma", "librosa.feature.chroma_stft + librosa.filters.chroma", {}, cases)


gen_spectral_features()
gen_mfcc()
gen_chroma()
print("spectral fixtures done")


# ---------------- Wave 5: effects, decompose, sequence, segment ----------------

def gen_effects():
    sigs = signals()
    y = sigs["sine440"][: SR // 2].copy()
    # bury silence around a burst for trim/split
    q = np.zeros(SR, dtype=np.float32)
    seg1 = sigs["noise"][: SR // 4] * 0.8
    q[SR // 4 : SR // 4 + len(seg1)] = seg1
    seg2 = sigs["noise"][: SR // 8] * 0.6
    q[3 * SR // 4 : 3 * SR // 4 + len(seg2)] = seg2
    yt, idx = librosa.effects.trim(q, top_db=30)
    intervals = librosa.effects.split(q, top_db=30)
    pre = librosa.effects.preemphasis(y)
    cases = [
        {"input": {"fn": "trim", "y": f32(q), "top_db": 30}, "expected_index": np.asarray(idx).tolist()},
        {"input": {"fn": "split", "y": f32(q), "top_db": 30}, "expected_intervals": np.asarray(intervals).tolist()},
        {"input": {"fn": "preemphasis", "y": f32(y), "coef": 0.97}, "expected": f32(pre)},
    ]
    write("effects", "librosa.effects trim/split/preemphasis", {}, cases)


def gen_phase_vocoder():
    sigs = signals()
    y = sigs["sine440"][: SR // 4]
    D = librosa.stft(y, n_fft=512, hop_length=128)
    cases = []
    for rate in (0.5, 2.0):
        Dh = librosa.phase_vocoder(D, rate=rate, hop_length=128)
        cases.append({
            "input": {"y": f32(y), "n_fft": 512, "hop_length": 128, "rate": rate},
            "expected_shape": list(Dh.shape),
            "expected_real": f32(Dh.real.ravel()),
            "expected_imag": f32(Dh.imag.ravel()),
        })
    write("phase_vocoder", "librosa.phase_vocoder", {}, cases)


def gen_hpss():
    sigs = signals()
    y = (sigs["sine440"][: SR // 2] * 0.7 + _click_signal(120.0, dur=0.5) * 0.8).astype(np.float32)
    S = librosa.stft(y, n_fft=512, hop_length=128)
    H, P = librosa.decompose.hpss(np.abs(S))
    Hm, Pm = librosa.decompose.hpss(np.abs(S), margin=2.0)
    cases = [{
        "input": {"y": f32(y), "n_fft": 512, "hop_length": 128},
        "expected_shape": list(H.shape),
        "H": f32(H.ravel()), "P": f32(P.ravel()),
        "H_margin2": f32(Hm.ravel()), "P_margin2": f32(Pm.ravel()),
    }]
    write("hpss", "librosa.decompose.hpss (magnitude S)", {}, cases)


def gen_dtw_segment():
    rng = np.random.default_rng(11)
    X = rng.random((6, 20))
    Y = rng.random((6, 26))
    D, wp = librosa.sequence.dtw(X=X, Y=Y)
    feats = rng.random((12, 40))
    R = librosa.segment.recurrence_matrix(feats, k=5, mode="connectivity", sym=True)
    Raff = librosa.segment.recurrence_matrix(feats, k=5, mode="affinity", sym=True)
    lag = librosa.segment.recurrence_to_lag(R.astype(float), pad=False)
    bounds = librosa.segment.agglomerative(feats, 5)
    cases = [{
        "input": {"X": X.ravel().tolist(), "X_shape": list(X.shape),
                  "Y": Y.ravel().tolist(), "Y_shape": list(Y.shape)},
        "dtw_D_last": float(D[-1, -1]),
        "dtw_path": np.asarray(wp).tolist(),
    }, {
        "input": {"feats": feats.ravel().tolist(), "feats_shape": list(feats.shape), "k": 5},
        "recurrence_connectivity": R.astype(float).ravel().tolist(),
        "recurrence_affinity": f32(Raff.ravel()),
        "lag_nopad": lag.ravel().tolist(),
        "agglomerative_k5": np.asarray(bounds).tolist(),
    }]
    write("dtw_segment", "librosa.sequence.dtw + librosa.segment.*", {}, cases)


gen_effects()
gen_phase_vocoder()
gen_hpss()
gen_dtw_segment()
print("wave5 fixtures done")


# ---------------- Missing-pieces goal: linalg, cluster, sequence, pcen ----------------

def gen_linalg():
    import scipy.linalg, scipy.sparse.csgraph
    rng = np.random.default_rng(3)
    # symmetric eigendecomposition ground truth (scipy.linalg.eigh)
    M = rng.standard_normal((6, 6)); A = (M + M.T) / 2
    evals, evecs = scipy.linalg.eigh(A)
    # normalized graph Laplacian ground truth (scipy.sparse.csgraph.laplacian normed=True)
    W = np.abs(rng.standard_normal((5, 5))); W = (W + W.T) / 2; np.fill_diagonal(W, 0)
    L = scipy.sparse.csgraph.laplacian(W, normed=True)
    Levals, Levecs = scipy.linalg.eigh(L)
    write("linalg", "scipy.linalg.eigh + scipy.sparse.csgraph.laplacian(normed)", {}, [
        {"input": {"fn": "eigh", "A": A.ravel().tolist(), "n": 6},
         "eigenvalues": f32(evals), "reconstruct": A.ravel().tolist()},
        {"input": {"fn": "laplacian_normed", "W": W.ravel().tolist(), "n": 5},
         "expected": L.ravel().tolist(),
         "L_eigenvalues": f32(Levals)},
    ])


def gen_cluster():
    from sklearn.cluster import KMeans
    rng = np.random.default_rng(0)
    # three well-separated blobs so the partition is unique regardless of init
    blobs = np.vstack([rng.standard_normal((20, 2)) * 0.3 + c
                       for c in ([0, 0], [8, 8], [0, 8])])
    km = KMeans(n_clusters=3, n_init=10, random_state=0).fit(blobs)
    # canonical: sort clusters by centroid (x,y) so labels are comparable up to our own sort
    order = np.lexsort((km.cluster_centers_[:, 1], km.cluster_centers_[:, 0]))
    remap = {old: new for new, old in enumerate(order)}
    labels = np.array([remap[l] for l in km.labels_])
    centers = km.cluster_centers_[order]
    write("cluster", "sklearn.cluster.KMeans (separable blobs)", {}, [{
        "input": {"X": blobs.ravel().tolist(), "shape": list(blobs.shape), "k": 3},
        "expected_labels": labels.tolist(),
        "expected_centers": f32(centers.ravel()),
        "expected_inertia": float(km.inertia_),
    }])


def gen_sequence_extra():
    rng = np.random.default_rng(5)
    n = 4
    cases = [
        {"input": {"fn": "transition_uniform", "n_states": n},
         "expected": f32(librosa.sequence.transition_uniform(n).ravel())},
        {"input": {"fn": "transition_loop", "n_states": n, "prob": 0.8},
         "expected": f32(librosa.sequence.transition_loop(n, 0.8).ravel())},
        {"input": {"fn": "transition_cycle", "n_states": n, "prob": 0.9},
         "expected": f32(librosa.sequence.transition_cycle(n, 0.9).ravel())},
        {"input": {"fn": "transition_local", "n_states": 6, "width": 3, "window": "triangle", "wrap": False},
         "expected": f32(librosa.sequence.transition_local(6, 3, window="triangle", wrap=False).ravel())},
    ]
    # viterbi_discriminative: 3-state posterior over 12 frames + loopy transition
    T, S = 12, 3
    prob = rng.random((S, T)); prob /= prob.sum(axis=0, keepdims=True)
    trans = librosa.sequence.transition_loop(S, 0.7)
    path = librosa.sequence.viterbi_discriminative(prob, trans)
    cases.append({"input": {"fn": "viterbi_discriminative", "prob": prob.ravel().tolist(),
                            "shape": [S, T], "transition": trans.ravel().tolist()},
                  "expected_path": np.asarray(path).tolist()})
    write("sequence_extra", "librosa.sequence transition_* + viterbi_discriminative", {}, cases)


def gen_pcen():
    sigs = signals()
    y = (sigs["sine440"][: SR // 2] * 0.6 + _click_signal(120.0, dur=0.5) * 0.7).astype(np.float32)
    S = librosa.feature.melspectrogram(y=y, sr=SR, n_fft=2048, hop_length=512, n_mels=64)
    P = librosa.pcen(S, sr=SR, hop_length=512)
    write("pcen", "librosa.pcen (defaults on melspectrogram)", {}, [{
        "input": {"y": f32(y), "sr": SR, "n_fft": 2048, "hop_length": 512, "n_mels": 64},
        "S_shape": list(S.shape),
        "expected": f32(P.ravel()),
    }])


gen_linalg()
gen_cluster()
gen_sequence_extra()
gen_pcen()
print("missing-pieces fixtures done")
