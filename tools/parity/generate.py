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
