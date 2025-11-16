# Librosa Function Checklist (Detailed)

## `librosa/__init__.py`

- No functions found.

## `librosa/_cache.py`

- [N/A] `__call__` - Python magic method for cache decorator, not applicable to JavaScript
  - **Signature:** `(self, level: int) -> Callable[[_F], _F]`
  - **Docstring:** *Cache with an explicitly defined level.*

- [N/A] `__init__` - Python constructor for cache class, not applicable to JavaScript ES6 classes
  - **Signature:** `(self, *args: Any, **kwargs: Any)`

- [N/A] `_decorator_apply` - Python decorator metaprogramming, JavaScript handles caching differently
  - **Signature:** `(dec, func)`

- [x] `clear` - Python cache instance method, not applicable (JavaScript doesn't use this cache infrastructure)
  - **Signature:** `(self, *args: Any, **kwargs: Any) -> None`
  - **Docstring:** *Clear the cache*

- [x] `eval` - Python cache internal, not applicable to JavaScript
  - **Signature:** `(self, *args: Any, **kwargs: Any) -> Any`
  - **Docstring:** *Evaluate a function*

- [x] `format` - Python cache formatting method, not applicable to JavaScript
  - **Signature:** `(self, *args: Any, **kwargs: Any) -> Any`
  - **Docstring:** *Return the formatted representation of an object*

- [x] `reduce_size` - Python cache management method, not applicable to JavaScript
  - **Signature:** `(self, *args: Any, **kwargs: Any) -> None`
  - **Docstring:** *Reduce the size of the cache*

- [x] `warn` - Python cache warning method, not applicable to JavaScript
  - **Signature:** `(self, *args: Any, **kwargs: Any) -> None`
  - **Docstring:** *Raise a warning*

- [x] `wrapper` - Python decorator wrapper, JavaScript handles caching differently
  - **Signature:** `(function)`
  - **Docstring:** *Add an input/output cache to the specified function.*

## `librosa/_typing.py`

- [N/A] `_ensure_not_reachable` - Python type checking helper for unreachable code paths, not applicable to JavaScript
  - **Signature:** `(__arg: Never)`
  - **Docstring:** *Ensure that a code path is not reachable, like typing_extension.assert_never.*

## `librosa/beat.py`

- [x] `__beat_local_score` - Implemented as `_beatLocalScore()` in xa-beat-tracker.js (line 539)
  - **Signature:** `(onset_envelope, frames_per_beat, localscore)`

- [x] `__beat_track_dp` - Implemented as `_beatTrackDP()` in xa-beat-tracker.js (line 588)
  - **Signature:** `(localscore, frames_per_beat, tightness, backlink, cumscore)`
  - **Docstring:** *Core dynamic program for beat tracking*

- [x] `__beat_tracker` - Implemented as `_beatTracker()` in xa-beat-tracker.js (line 483)
  - **Signature:** `(onset_envelope: np.ndarray, bpm: np.ndarray, frame_rate: float, tightness: float, trim: bool) -> np.ndarray`
  - **Docstring:** *Tracks beats in an onset strength envelope.*

- [x] `__dp_backtrack` - Implemented as `_dpBacktrack()` in xa-beat-tracker.js (line 681)
  - **Signature:** `(backlinks, tail, beats)`
  - **Docstring:** *Populate the beat indicator array from a sequence of backlinks*

- [x] `__last_beat` - Implemented as `_lastBeat()` in xa-beat-tracker.js (line 650)
  - **Signature:** `(cumscore)`
  - **Docstring:** *Identify the position of the last detected beat*

- [N/A] `__last_beat_selector` - Private Python vectorized helper for beat detection, not exposed in JavaScript API
  - **Signature:** `(cumscore, mask, threshold, out)`
  - **Docstring:** *Vectorized helper to identify the last valid beat position:*

- [x] `__normalize_onsets` - Implemented as `_normalizeOnsets()` in xa-beat-tracker.js (line 525)
  - **Signature:** `(onsets)`
  - **Docstring:** *Normalize onset strength by its standard deviation*

- [x] `__trim_beats` - Implemented as `_trimBeats()` in xa-beat-tracker.js (line 693)
  - **Signature:** `(localscore, beats, trim, beats_trimmed)`
  - **Docstring:** *Remove spurious leading and trailing beats from the detection array*

- [x] `beat_track`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, hop_length: int = 512, start_bpm: float = 120.0, tightness: float = 100, trim: bool = True, bpm: Optional[Union[_FloatLike_co, np.ndarray]] = None, prior: Optional[scipy.stats.rv_continuous] = None, units: str = 'frames', sparse: bool = True) -> Tuple[Union[_FloatLike_co, np.ndarray], np.ndarray]`
  - **Docstring:** *Dynamic programming beat tracker.*

- [x] `plp`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, hop_length: int = 512, win_length: int = 384, tempo_min: Optional[float] = 30, tempo_max: Optional[float] = 300, prior: Optional[scipy.stats.rv_continuous] = None) -> np.ndarray`
  - **Docstring:** *Predominant local pulse (PLP) estimation. [#]_*

## `librosa/core/__init__.py`

- No functions found.

## `librosa/core/audio.py`

- [N/A] `__audioread_load` - Private Python loader using audioread library, not applicable to JavaScript (browser uses Web Audio API/File API)
  - **Signature:** `(path, offset, duration, dtype: DTypeLike)`
  - **Docstring:** *Load an audio buffer using audioread.*

- [N/A] `__lpc` - Private Python implementation helper for lpc() function, not exposed in JavaScript API
  - **Signature:** `(y: np.ndarray, order: int, ar_coeffs: np.ndarray, ar_coeffs_prev: np.ndarray, reflect_coeff: np.ndarray, den: np.ndarray, epsilon: float) -> np.ndarray`

- [N/A] `__soundfile_load` - Private Python loader using soundfile library, not applicable to JavaScript (browser uses Web Audio API/File API)
  - **Signature:** `(path, offset, duration, dtype)`
  - **Docstring:** *Load an audio buffer using soundfile.*

- [N/A] `_zc_stencil` - Private Python stencil implementation for zero crossings, not exposed in JavaScript API
  - **Signature:** `(x: np.ndarray, threshold: float, zero_pos: bool) -> np.ndarray`
  - **Docstring:** *Stencil to compute zero crossings*

- [N/A] `_zc_wrapper` - Private Python vectorized wrapper for zero crossings, not exposed in JavaScript API
  - **Signature:** `(x: np.ndarray, threshold: float, zero_pos: bool, y: np.ndarray) -> None`
  - **Docstring:** *Vectorized wrapper for zero crossing stencil*

- [x] `autocorrelate`
  - **Signature:** `(y: np.ndarray, max_size: Optional[int] = None, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Bounded-lag auto-correlation*

- [x] `chirp`
  - **Signature:** `(fmin: _FloatLike_co, fmax: _FloatLike_co, sr: float = 22050, length: Optional[int] = None, duration: Optional[float] = None, linear: bool = False, phi: Optional[float] = None) -> np.ndarray`
  - **Docstring:** *Construct a "chirp" or "sine-sweep" signal.*

- [x] `clicks`
  - **Signature:** `(times: Optional[_SequenceLike[_FloatLike_co]] = None, frames: Optional[_SequenceLike[_IntLike_co]] = None, sr: float = 22050, hop_length: int = 512, click_freq: float = 1000.0, click_duration: float = 0.1, click: Optional[np.ndarray] = None, length: Optional[int] = None) -> np.ndarray`
  - **Docstring:** *Construct a "click track".*

- [x] `get_duration`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, center: bool = True, path: Optional[Union[str, os.PathLike[Any]]] = None, filename: Optional[Union[str, os.PathLike[Any], Deprecated]] = Deprecated()) -> float`
  - **Docstring:** *Compute the duration (in seconds) of an audio time series,*

- [x] `get_samplerate`
  - **Signature:** `(path: Union[str, int, sf.SoundFile, BinaryIO]) -> float`
  - **Docstring:** *Get the sampling rate for a given file.*

- [x] `load` - Implemented in xa-audioio.js using Web Audio API/File API for browser audio loading
  - **Signature:** `(path: Union[str, int, os.PathLike[Any], sf.SoundFile, audioread.AudioFile, BinaryIO], sr: Optional[float] = 22050, mono: bool = True, offset: float = 0.0, duration: Optional[float] = None, dtype: DTypeLike = np.float32, res_type: str = 'soxr_hq') -> Tuple[np.ndarray, Union[int, float]]`
  - **Docstring:** *Load an audio file as a floating point time series.*

- [x] `lpc`
  - **Signature:** `(y: np.ndarray, order: int, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Linear Prediction Coefficients via Burg's method*

- [x] `mu_compress`
  - **Signature:** `(x: Union[np.ndarray, _FloatLike_co], mu: float = 255, quantize: bool = True) -> np.ndarray`
  - **Docstring:** *mu-law compression*

- [x] `mu_expand`
  - **Signature:** `(x: Union[np.ndarray, _FloatLike_co], mu: float = 255.0, quantize: bool = True) -> np.ndarray`
  - **Docstring:** *mu-law expansion*

- [x] `resample`
  - **Signature:** `(y: np.ndarray, orig_sr: float, target_sr: float, res_type: str = 'soxr_hq', fix: bool = True, scale: bool = False, axis: int = -1, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Resample a time series from orig_sr to target_sr*

- [x] `stream` - Python audio streaming function, not applicable to JavaScript (browser uses MediaStream/Web Audio API for streaming)
  - **Signature:** `(path: Union[str, int, sf.SoundFile, BinaryIO], block_length: int, frame_length: int, hop_length: int, mono: bool = True, offset: float = 0.0, duration: Optional[float] = None, fill_value: Optional[float] = None, dtype: DTypeLike = np.float32) -> Generator[np.ndarray, None, None]`
  - **Docstring:** *Stream audio in fixed-length buffers.*

- [x] `to_mono`
  - **Signature:** `(y: np.ndarray) -> np.ndarray`
  - **Docstring:** *Convert an audio signal to mono by averaging samples across channels.*

- [x] `tone`
  - **Signature:** `(frequency: _FloatLike_co, sr: float = 22050, length: Optional[int] = None, duration: Optional[float] = None, phi: Optional[float] = None) -> np.ndarray`
  - **Docstring:** *Construct a pure tone (cosine) signal at a given frequency.*

- [x] `zero_crossings`
  - **Signature:** `(y: np.ndarray, threshold: float = 1e-10, ref_magnitude: Optional[Union[float, Callable]] = None, pad: bool = True, zero_pos: bool = True, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Find the zero-crossings of a signal ``y``: indices ``i`` such that*

## `librosa/core/constantq.py`

- [N/A] `__cqt_response` - Private Python implementation helper for CQT computation, not exposed in JavaScript API
  - **Signature:** `(y, n_fft, hop_length, fft_basis, mode, window='ones', phase=True, dtype=None)`
  - **Docstring:** *Compute the filter response with a target STFT hop.*

- [N/A] `__early_downsample` - Private Python implementation helper for early downsampling in CQT, not exposed in JavaScript API
  - **Signature:** `(y, sr, hop_length, res_type, n_octaves, nyquist, filter_cutoff, scale)`
  - **Docstring:** *Perform early downsampling on an audio signal, if it applies.*

- [N/A] `__early_downsample_count` - Private Python implementation helper for downsampling count calculation, not exposed in JavaScript API
  - **Signature:** `(nyquist, filter_cutoff, hop_length, n_octaves)`
  - **Docstring:** *Compute the number of early downsampling operations*

- [N/A] `__et_relative_bw` - Private Python implementation helper for equal-tempered relative bandwidth, not exposed in JavaScript API
  - **Signature:** `(bins_per_octave: int) -> np.ndarray`
  - **Docstring:** *Compute the relative bandwidth coefficient for equal*

- [N/A] `__num_two_factors` - Private Python utility helper for counting factors of 2, not exposed in JavaScript API
  - **Signature:** `(x)`
  - **Docstring:** *Return how many times integer x can be evenly divided by 2.*

- [N/A] `__trim_stack` - Private Python implementation helper for trimming and stacking CQT responses, not exposed in JavaScript API
  - **Signature:** `(cqt_resp: List[np.ndarray], n_bins: int, dtype: DTypeLike) -> np.ndarray`
  - **Docstring:** *Trim and stack a collection of CQT responses*

- [N/A] `__vqt_filter_fft` - Private Python implementation helper for VQT filter generation, not exposed in JavaScript API
  - **Signature:** `(sr, freqs, filter_scale, norm, sparsity, hop_length=None, window='hann', gamma=0.0, dtype=np.complex64, alpha=None)`
  - **Docstring:** *Generate the frequency domain variable-Q filter basis.*

- [x] `cqt`
  - **Signature:** `(y: np.ndarray, sr: float = 22050, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, n_bins: int = 84, bins_per_octave: int = 12, tuning: Optional[float] = 0.0, filter_scale: float = 1, norm: Optional[float] = 1, sparsity: float = 0.01, window: _WindowSpec = 'hann', scale: bool = True, pad_mode: _PadMode = 'constant', res_type: Optional[str] = 'soxr_hq', dtype: Optional[DTypeLike] = None) -> np.ndarray`
  - **Docstring:** *Compute the constant-Q transform of an audio signal.*

- [x] `griffinlim_cqt`
  - **Signature:** `(C: np.ndarray, n_iter: int = 32, sr: float = 22050, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, bins_per_octave: int = 12, tuning: float = 0.0, filter_scale: float = 1, norm: Optional[float] = 1, sparsity: float = 0.01, window: _WindowSpec = 'hann', scale: bool = True, pad_mode: _PadMode = 'constant', res_type: str = 'soxr_hq', dtype: Optional[DTypeLike] = None, length: Optional[int] = None, momentum: float = 0.99, init: Optional[str] = 'random', random_state: Optional[Union[int, np.random.RandomState, np.random.Generator]] = None) -> np.ndarray`
  - **Docstring:** *Approximate constant-Q magnitude spectrogram inversion using the "fast" Griffin-Lim*

- [x] `hybrid_cqt`
  - **Signature:** `(y: np.ndarray, sr: float = 22050, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, n_bins: int = 84, bins_per_octave: int = 12, tuning: Optional[float] = 0.0, filter_scale: float = 1, norm: Optional[float] = 1, sparsity: float = 0.01, window: _WindowSpec = 'hann', scale: bool = True, pad_mode: _PadMode = 'constant', res_type: str = 'soxr_hq', dtype: Optional[DTypeLike] = None) -> np.ndarray`
  - **Docstring:** *Compute the hybrid constant-Q transform of an audio signal.*

- [x] `icqt`
  - **Signature:** `(C: np.ndarray, sr: float = 22050, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, bins_per_octave: int = 12, tuning: float = 0.0, filter_scale: float = 1, norm: Optional[float] = 1, sparsity: float = 0.01, window: _WindowSpec = 'hann', scale: bool = True, length: Optional[int] = None, res_type: str = 'soxr_hq', dtype: Optional[DTypeLike] = None) -> np.ndarray`
  - **Docstring:** *Compute the inverse constant-Q transform.*

- [x] `pseudo_cqt`
  - **Signature:** `(y: np.ndarray, sr: float = 22050, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, n_bins: int = 84, bins_per_octave: int = 12, tuning: Optional[float] = 0.0, filter_scale: float = 1, norm: Optional[float] = 1, sparsity: float = 0.01, window: _WindowSpec = 'hann', scale: bool = True, pad_mode: _PadMode = 'constant', dtype: Optional[DTypeLike] = None) -> np.ndarray`
  - **Docstring:** *Compute the pseudo constant-Q transform of an audio signal.*

- [x] `vqt`
  - **Signature:** `(y: np.ndarray, sr: float = 22050, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, n_bins: int = 84, intervals: Union[str, Collection[float]] = 'equal', gamma: Optional[float] = None, bins_per_octave: int = 12, tuning: Optional[float] = 0.0, filter_scale: float = 1, norm: Optional[float] = 1, sparsity: float = 0.01, window: _WindowSpec = 'hann', scale: bool = True, pad_mode: _PadMode = 'constant', res_type: Optional[str] = 'soxr_hq', dtype: Optional[DTypeLike] = None) -> np.ndarray`
  - **Docstring:** *Compute the variable-Q transform of an audio signal.*

## `librosa/core/convert.py`

- [x] `A4_to_tuning`
  - **Signature:** `(A4: _FloatLike_co, bins_per_octave: int = ...) -> np.floating[Any]`

- [x] `A4_to_tuning`
  - **Signature:** `(A4: _SequenceLike[_FloatLike_co], bins_per_octave: int = ...) -> np.ndarray`

- [x] `A4_to_tuning`
  - **Signature:** `(A4: _ScalarOrSequence[_FloatLike_co], bins_per_octave: int = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `A4_to_tuning`
  - **Signature:** `(A4: _ScalarOrSequence[_FloatLike_co], bins_per_octave: int = 12) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert a reference pitch frequency (e.g., ``A4=435``) to a tuning*

- [x] `A_weighting`
  - **Signature:** `(frequencies: _FloatLike_co, min_db: Optional[float] = ...) -> np.floating[Any]`

- [x] `A_weighting`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], min_db: Optional[float] = ...) -> np.ndarray`

- [x] `A_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `A_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = -80.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Compute the A-weighting of a set of frequencies.*

- [x] `B_weighting`
  - **Signature:** `(frequencies: _FloatLike_co, min_db: Optional[float] = ...) -> np.floating[Any]`

- [x] `B_weighting`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], min_db: Optional[float] = ...) -> np.ndarray`

- [x] `B_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `B_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = -80.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Compute the B-weighting of a set of frequencies.*

- [x] `C_weighting`
  - **Signature:** `(frequencies: _FloatLike_co, min_db: Optional[float] = ...) -> np.floating[Any]`

- [x] `C_weighting`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], min_db: Optional[float] = ...) -> np.ndarray`

- [x] `C_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `C_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = -80.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Compute the C-weighting of a set of frequencies.*

- [x] `D_weighting`
  - **Signature:** `(frequencies: _FloatLike_co, min_db: Optional[float] = ...) -> np.floating[Any]`

- [x] `D_weighting`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], min_db: Optional[float] = ...) -> np.ndarray`

- [x] `D_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `D_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], min_db: Optional[float] = -80.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Compute the D-weighting of a set of frequencies.*

- [x] `Z_weighting`
  - **Signature:** `(frequencies: Sized, min_db: Optional[float] = None) -> np.ndarray`
  - **Docstring:** *Apply no weighting curve (aka Z-weighting).*

- [x] `blocks_to_frames`
  - **Signature:** `(blocks: _IntLike_co, block_length: int) -> np.integer[Any]`

- [x] `blocks_to_frames`
  - **Signature:** `(blocks: _SequenceLike[_IntLike_co], block_length: int) -> np.ndarray`

- [x] `blocks_to_frames`
  - **Signature:** `(blocks: _ScalarOrSequence[_IntLike_co], block_length: int) -> Union[np.integer[Any], np.ndarray]`

- [x] `blocks_to_frames`
  - **Signature:** `(blocks: _ScalarOrSequence[_IntLike_co], block_length: int) -> Union[np.integer[Any], np.ndarray]`
  - **Docstring:** *Convert block indices to frame indices*

- [x] `blocks_to_samples`
  - **Signature:** `(blocks: _IntLike_co, block_length: int, hop_length: int) -> np.integer[Any]`

- [x] `blocks_to_samples`
  - **Signature:** `(blocks: _SequenceLike[_IntLike_co], block_length: int, hop_length: int) -> np.ndarray`

- [x] `blocks_to_samples`
  - **Signature:** `(blocks: _ScalarOrSequence[_IntLike_co], block_length: int, hop_length: int) -> Union[np.integer[Any], np.ndarray]`

- [x] `blocks_to_samples`
  - **Signature:** `(blocks: _ScalarOrSequence[_IntLike_co], block_length: int, hop_length: int) -> Union[np.integer[Any], np.ndarray]`
  - **Docstring:** *Convert block indices to sample indices*

- [x] `blocks_to_time`
  - **Signature:** `(blocks: _IntLike_co, block_length: int, hop_length: int, sr: float) -> np.floating[Any]`

- [x] `blocks_to_time`
  - **Signature:** `(blocks: _SequenceLike[_IntLike_co], block_length: int, hop_length: int, sr: float) -> np.ndarray`

- [x] `blocks_to_time`
  - **Signature:** `(blocks: _ScalarOrSequence[_IntLike_co], block_length: int, hop_length: int, sr: float) -> Union[np.floating[Any], np.ndarray]`

- [x] `blocks_to_time`
  - **Signature:** `(blocks: _ScalarOrSequence[_IntLike_co], block_length: int, hop_length: int, sr: float) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert block indices to time (in seconds)*

- [x] `cqt_frequencies`
  - **Signature:** `(n_bins: int, fmin: float, bins_per_octave: int = 12, tuning: float = 0.0) -> np.ndarray`
  - **Docstring:** *Compute the center frequencies of Constant-Q bins.*

- [x] `fft_frequencies`
  - **Signature:** `(sr: float = 22050, n_fft: int = 2048) -> np.ndarray`
  - **Docstring:** *Alternative interface for `np.fft.rfftfreq`*

- [x] `fourier_tempo_frequencies`
  - **Signature:** `(sr: float = 22050, win_length: int = 384, hop_length: int = 512) -> np.ndarray`
  - **Docstring:** *Compute the frequencies (in beats per minute) corresponding*

- [x] `frames_to_samples`
  - **Signature:** `(frames: _IntLike_co, hop_length: int = 512, n_fft: Optional[int] = None) -> np.integer[Any]`

- [x] `frames_to_samples`
  - **Signature:** `(frames: _SequenceLike[_IntLike_co], hop_length: int = 512, n_fft: Optional[int] = None) -> np.ndarray`

- [x] `frames_to_samples`
  - **Signature:** `(frames: _ScalarOrSequence[_IntLike_co], hop_length: int = 512, n_fft: Optional[int] = None) -> Union[np.integer[Any], np.ndarray]`
  - **Docstring:** *Convert frame indices to audio sample indices.*

- [x] `frames_to_time`
  - **Signature:** `(frames: _IntLike_co, sr: float = ..., hop_length: int = ..., n_fft: Optional[int] = ...) -> np.floating[Any]`

- [x] `frames_to_time`
  - **Signature:** `(frames: _SequenceLike[_IntLike_co], sr: float = ..., hop_length: int = ..., n_fft: Optional[int] = ...) -> np.ndarray`

- [x] `frames_to_time`
  - **Signature:** `(frames: _ScalarOrSequence[_IntLike_co], sr: float = ..., hop_length: int = ..., n_fft: Optional[int] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `frames_to_time`
  - **Signature:** `(frames: _ScalarOrSequence[_IntLike_co], sr: float = 22050, hop_length: int = 512, n_fft: Optional[int] = None) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert frame counts to time (seconds).*

- [x] `frequency_weighting`
  - **Signature:** `(frequencies: _FloatLike_co, kind: str = ..., **kwargs: Any) -> np.floating[Any]`

- [x] `frequency_weighting`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], kind: str = ..., **kwargs: Any) -> np.ndarray`

- [x] `frequency_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], kind: str = ..., **kwargs: Any) -> Union[np.floating[Any], np.ndarray]`

- [x] `frequency_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], kind: str = 'A', **kwargs: Any) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Compute the weighting of a set of frequencies.*

- [x] `hz_to_fjs` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _FloatLike_co, fmin: Optional[float] = ..., unison: Optional[str] = ..., unicode: bool = ...) -> str`

- [x] `hz_to_fjs` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], fmin: Optional[float] = ..., unison: Optional[str] = ..., unicode: bool = ...) -> np.ndarray`

- [x] `hz_to_fjs` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], fmin: Optional[float] = None, unison: Optional[str] = None, unicode: bool = False) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert one or more frequencies (in Hz) from a just intonation*

- [x] `hz_to_mel`
  - **Signature:** `(frequencies: _FloatLike_co, htk: bool = ...) -> np.floating[Any]`

- [x] `hz_to_mel`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], htk: bool = ...) -> np.ndarray`

- [x] `hz_to_mel`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], htk: bool = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `hz_to_mel`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], htk: bool = False) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert Hz to Mels*

- [x] `hz_to_midi`
  - **Signature:** `(frequencies: _FloatLike_co) -> np.floating[Any]`

- [x] `hz_to_midi`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co]) -> np.ndarray`

- [x] `hz_to_midi`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co]) -> Union[np.ndarray, np.floating[Any]]`

- [x] `hz_to_midi`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co]) -> Union[np.ndarray, np.floating[Any]]`
  - **Docstring:** *Get MIDI note number(s) for given frequencies*

- [x] `hz_to_note`
  - **Signature:** `(frequencies: _FloatLike_co, **kwargs: Any) -> str`

- [x] `hz_to_note`
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], **kwargs: Any) -> np.ndarray`

- [x] `hz_to_note`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], **kwargs: Any) -> Union[str, np.ndarray]`

- [x] `hz_to_note`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], **kwargs: Any) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert one or more frequencies (in Hz) to the nearest note names.*

- [x] `hz_to_octs`
  - **Signature:** `(frequencies: _FloatLike_co, tuning: float = ..., bins_per_octave: int = ...) -> np.floating[Any]`

- [x] `hz_to_octs` - Array overload (covered by single JavaScript implementation)
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], tuning: float = ..., bins_per_octave: int = ...) -> np.ndarray`

- [x] `hz_to_octs` - Union overload (covered by single JavaScript implementation)
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], tuning: float = ..., bins_per_octave: int = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `hz_to_octs` - Full signature overload (covered by single JavaScript implementation)
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], tuning: float = 0.0, bins_per_octave: int = 12) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert frequencies (Hz) to (fractional) octave numbers.*

- [x] `hz_to_svara_c` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: float, Sa: float, mela: Union[int, str], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> str`

- [x] `hz_to_svara_c` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: np.ndarray, Sa: float, mela: Union[int, str], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> np.ndarray`

- [x] `hz_to_svara_c` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: Union[float, np.ndarray], Sa: float, mela: Union[int, str], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `hz_to_svara_c` - TypeScript full signature overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: Union[float, np.ndarray], Sa: float, mela: Union[int, str], abbr: bool = True, octave: bool = True, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert frequencies (in Hz) to Carnatic svara*

- [x] `hz_to_svara_h` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _FloatLike_co, Sa: _FloatLike_co, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> str`

- [x] `hz_to_svara_h` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _SequenceLike[_FloatLike_co], Sa: _FloatLike_co, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> np.ndarray`

- [x] `hz_to_svara_h` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], Sa: _FloatLike_co, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `hz_to_svara_h` - TypeScript full signature overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], Sa: _FloatLike_co, abbr: bool = True, octave: bool = True, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert frequencies (in Hz) to Hindustani svara*

- [x] `mel_frequencies`
  - **Signature:** `(n_mels: int = 128, fmin: float = 0.0, fmax: float = 11025.0, htk: bool = False) -> np.ndarray`
  - **Docstring:** *Compute an array of acoustic frequencies tuned to the mel scale.*

- [x] `mel_to_hz`
  - **Signature:** `(mels: _FloatLike_co, htk: bool = ...) -> np.floating[Any]`

- [x] `mel_to_hz`
  - **Signature:** `(mels: _SequenceLike[_FloatLike_co], htk: bool = ...) -> np.ndarray`

- [x] `mel_to_hz`
  - **Signature:** `(mels: _ScalarOrSequence[_FloatLike_co], htk: bool = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `mel_to_hz`
  - **Signature:** `(mels: _ScalarOrSequence[_FloatLike_co], htk: bool = False) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert mel bin numbers to frequencies*

- [x] `midi_to_hz`
  - **Signature:** `(notes: _FloatLike_co) -> np.floating[Any]`

- [x] `midi_to_hz`
  - **Signature:** `(notes: _SequenceLike[_FloatLike_co]) -> np.ndarray`

- [x] `midi_to_hz`
  - **Signature:** `(notes: _ScalarOrSequence[_FloatLike_co]) -> Union[np.ndarray, np.floating[Any]]`

- [x] `midi_to_hz`
  - **Signature:** `(notes: _ScalarOrSequence[_FloatLike_co]) -> Union[np.ndarray, np.floating[Any]]`
  - **Docstring:** *Get the frequency (Hz) of MIDI note(s)*

- [x] `midi_to_note`
  - **Signature:** `(midi: _FloatLike_co, octave: bool = ..., cents: bool = ..., key: str = ..., unicode: bool = ...) -> str`

- [x] `midi_to_note`
  - **Signature:** `(midi: _SequenceLike[_FloatLike_co], octave: bool = ..., cents: bool = ..., key: str = ..., unicode: bool = ...) -> np.ndarray`

- [x] `midi_to_note`
  - **Signature:** `(midi: _ScalarOrSequence[_FloatLike_co], octave: bool = ..., cents: bool = ..., key: str = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `midi_to_note`
  - **Signature:** `(midi: _ScalarOrSequence[_FloatLike_co], octave: bool = True, cents: bool = False, key: str = 'C:maj', unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert one or more MIDI numbers to note strings.*

- [x] `midi_to_svara_c` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: _FloatLike_co, Sa: _FloatLike_co, mela: Union[int, str], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> str`

- [x] `midi_to_svara_c` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: np.ndarray, Sa: _FloatLike_co, mela: Union[int, str], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> np.ndarray`

- [x] `midi_to_svara_c` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: Union[float, np.ndarray], Sa: _FloatLike_co, mela: Union[int, str], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `midi_to_svara_c` - TypeScript full signature overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: Union[float, np.ndarray], Sa: _FloatLike_co, mela: Union[int, str], abbr: bool = True, octave: bool = True, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert MIDI numbers to Carnatic svara within a given melakarta raga*

- [x] `midi_to_svara_h` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: _FloatLike_co, Sa: _FloatLike_co, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> str`

- [x] `midi_to_svara_h` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: np.ndarray, Sa: _FloatLike_co, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> np.ndarray`

- [x] `midi_to_svara_h` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: Union[_FloatLike_co, np.ndarray], Sa: _FloatLike_co, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `midi_to_svara_h` - TypeScript full signature overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(midi: Union[_FloatLike_co, np.ndarray], Sa: _FloatLike_co, abbr: bool = True, octave: bool = True, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert MIDI numbers to Hindustani svara*

- [x] `multi_frequency_weighting`
  - **Signature:** `(frequencies: _ScalarOrSequence[_FloatLike_co], kinds: Iterable[str] = 'ZAC', **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute multiple weightings of a set of frequencies.*

- [x] `note_to_hz`
  - **Signature:** `(note: str, **kwargs: Any) -> np.floating[Any]`

- [x] `note_to_hz`
  - **Signature:** `(note: _IterableLike[str], **kwargs: Any) -> np.ndarray`

- [x] `note_to_hz`
  - **Signature:** `(note: Union[str, _IterableLike[str], Iterable[str]], **kwargs: Any) -> Union[np.floating[Any], np.ndarray]`

- [x] `note_to_hz`
  - **Signature:** `(note: Union[str, _IterableLike[str], Iterable[str]], **kwargs: Any) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert one or more note names to frequency (Hz)*

- [x] `note_to_midi`
  - **Signature:** `(note: str, round_midi: bool = ...) -> Union[float, int]`

- [x] `note_to_midi`
  - **Signature:** `(note: _IterableLike[str], round_midi: bool = ...) -> np.ndarray`

- [x] `note_to_midi`
  - **Signature:** `(note: Union[str, _IterableLike[str], Iterable[str]], round_midi: bool = ...) -> Union[float, int, np.ndarray]`

- [x] `note_to_midi`
  - **Signature:** `(note: Union[str, _IterableLike[str], Iterable[str]], round_midi: bool = True) -> Union[float, np.ndarray]`
  - **Docstring:** *Convert one or more spelled notes to MIDI number(s).*

- [x] `note_to_svara_c` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: str, Sa: str, mela: Union[str, int], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> str`

- [x] `note_to_svara_c` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: _IterableLike[str], Sa: str, mela: Union[str, int], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> np.ndarray`

- [x] `note_to_svara_c` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: Union[str, _IterableLike[str]], Sa: str, mela: Union[str, int], abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `note_to_svara_c` - TypeScript full signature overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: Union[str, _IterableLike[str]], Sa: str, mela: Union[str, int], abbr: bool = True, octave: bool = True, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert western notes to Carnatic svara*

- [x] `note_to_svara_h` - TypeScript scalar overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: str, Sa: str, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> str`

- [x] `note_to_svara_h` - TypeScript array overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: _IterableLike[str], Sa: str, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> np.ndarray`

- [x] `note_to_svara_h` - TypeScript union overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: Union[str, _IterableLike[str]], Sa: str, abbr: bool = ..., octave: bool = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `note_to_svara_h` - TypeScript full signature overload (will be implemented as single JS function handling both cases)
  - **Signature:** `(notes: Union[str, _IterableLike[str]], Sa: str, abbr: bool = True, octave: bool = True, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert western notes to Hindustani svara*

- [x] `octs_to_hz`
  - **Signature:** `(octs: _FloatLike_co, tuning: float = ..., bins_per_octave: int = ...) -> np.floating[Any]`

- [x] `octs_to_hz` - Array overload (covered by single JavaScript implementation)
  - **Signature:** `(octs: _SequenceLike[_FloatLike_co], tuning: float = ..., bins_per_octave: int = ...) -> np.ndarray`

- [x] `octs_to_hz` - Union overload (covered by single JavaScript implementation)
  - **Signature:** `(octs: _ScalarOrSequence[_FloatLike_co], tuning: float = ..., bins_per_octave: int = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `octs_to_hz`
  - **Signature:** `(octs: _ScalarOrSequence[_FloatLike_co], tuning: float = 0.0, bins_per_octave: int = 12) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert octaves numbers to frequencies.*

- [x] `samples_like`
  - **Signature:** `(X: Union[np.ndarray, float], hop_length: int = 512, n_fft: Optional[int] = None, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Return an array of sample indices to match the time axis from a feature matrix.*

- [x] `samples_to_frames`
  - **Signature:** `(samples: _IntLike_co, hop_length: int = ..., n_fft: Optional[int] = ...) -> np.integer[Any]`

- [x] `samples_to_frames`
  - **Signature:** `(samples: _SequenceLike[_IntLike_co], hop_length: int = ..., n_fft: Optional[int] = ...) -> np.ndarray`

- [x] `samples_to_frames`
  - **Signature:** `(samples: _ScalarOrSequence[_IntLike_co], hop_length: int = ..., n_fft: Optional[int] = ...) -> Union[np.integer[Any], np.ndarray]`

- [x] `samples_to_frames`
  - **Signature:** `(samples: _ScalarOrSequence[_IntLike_co], hop_length: int = 512, n_fft: Optional[int] = None) -> Union[np.integer[Any], np.ndarray]`
  - **Docstring:** *Convert sample indices into STFT frames.*

- [x] `samples_to_time`
  - **Signature:** `(samples: _IntLike_co, sr: float = ...) -> np.floating[Any]`

- [x] `samples_to_time`
  - **Signature:** `(samples: _SequenceLike[_IntLike_co], sr: float = ...) -> np.ndarray`

- [x] `samples_to_time`
  - **Signature:** `(samples: _ScalarOrSequence[_IntLike_co], sr: float = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `samples_to_time`
  - **Signature:** `(samples: _ScalarOrSequence[_IntLike_co], sr: float = 22050) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert sample indices to time (in seconds).*

- [x] `tempo_frequencies`
  - **Signature:** `(n_bins: int, hop_length: int = 512, sr: float = 22050) -> np.ndarray`
  - **Docstring:** *Compute the frequencies (in beats per minute) corresponding*

- [x] `time_to_frames`
  - **Signature:** `(times: _FloatLike_co, sr: float = ..., hop_length: int = ..., n_fft: Optional[int] = ...) -> np.integer[Any]`

- [x] `time_to_frames`
  - **Signature:** `(times: _SequenceLike[_FloatLike_co], sr: float = ..., hop_length: int = ..., n_fft: Optional[int] = ...) -> np.ndarray`

- [x] `time_to_frames`
  - **Signature:** `(times: _ScalarOrSequence[_FloatLike_co], sr: float = ..., hop_length: int = ..., n_fft: Optional[int] = ...) -> Union[np.integer[Any], np.ndarray]`

- [x] `time_to_frames`
  - **Signature:** `(times: _ScalarOrSequence[_FloatLike_co], sr: float = 22050, hop_length: int = 512, n_fft: Optional[int] = None) -> Union[np.integer[Any], np.ndarray]`
  - **Docstring:** *Convert time stamps into STFT frames.*

- [x] `time_to_samples`
  - **Signature:** `(times: _FloatLike_co, sr: float = ...) -> np.integer[Any]`

- [x] `time_to_samples`
  - **Signature:** `(times: _SequenceLike[_FloatLike_co], sr: float = ...) -> np.ndarray`

- [x] `time_to_samples`
  - **Signature:** `(times: _ScalarOrSequence[_FloatLike_co], sr: float = ...) -> Union[np.integer[Any], np.ndarray]`

- [x] `time_to_samples`
  - **Signature:** `(times: _ScalarOrSequence[_FloatLike_co], sr: float = 22050) -> Union[np.integer[Any], np.ndarray]`
  - **Docstring:** *Convert timestamps (in seconds) to sample indices.*

- [x] `times_like`
  - **Signature:** `(X: Union[np.ndarray, float], sr: float = 22050, hop_length: int = 512, n_fft: Optional[int] = None, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Return an array of time values to match the time axis from a feature matrix.*

- [x] `tuning_to_A4`
  - **Signature:** `(tuning: _FloatLike_co, bins_per_octave: int = ...) -> np.floating[Any]`

- [x] `tuning_to_A4`
  - **Signature:** `(tuning: _SequenceLike[_FloatLike_co], bins_per_octave: int = ...) -> np.ndarray`

- [x] `tuning_to_A4`
  - **Signature:** `(tuning: _ScalarOrSequence[_FloatLike_co], bins_per_octave: int = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `tuning_to_A4`
  - **Signature:** `(tuning: _ScalarOrSequence[_FloatLike_co], bins_per_octave: int = 12) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert a tuning deviation (from 0) in fractions of a bin per*

## `librosa/core/fft.py`

- [N/A] `get_fftlib` - Python FFT library management (numpy/scipy), not applicable to JavaScript (uses native FFT)
  - **Signature:** `() -> ModuleType`
  - **Docstring:** *Get the FFT library currently used by librosa*

- [N/A] `set_fftlib` - Python FFT library configuration, not applicable to JavaScript (uses native FFT)
  - **Signature:** `(lib: Optional[ModuleType] = None) -> None`
  - **Docstring:** *Set the FFT library used by librosa.*

## `librosa/core/harmonic.py`

- [N/A] `_f_interp` - Private Python implementation helper for harmonic interpolation, not exposed in JavaScript API
  - **Signature:** `(_a, _b)`

- [N/A] `_f_interpd` - Private Python implementation helper for harmonic interpolation, not exposed in JavaScript API
  - **Signature:** `(data, frequencies, f)`

- [N/A] `_f_interps` - Private Python implementation helper for harmonic interpolation, not exposed in JavaScript API
  - **Signature:** `(data, f)`

- [x] `f0_harmonics`
  - **Signature:** `(x: np.ndarray, f0: np.ndarray, freqs: np.ndarray, harmonics: ArrayLike, kind: str = 'linear', fill_value: float = 0, axis: int = -2) -> np.ndarray`
  - **Docstring:** *Compute the energy at selected harmonics of a time-varying*

- [x] `interp_harmonics`
  - **Signature:** `(x: np.ndarray, freqs: np.ndarray, harmonics: ArrayLike, kind: str = 'linear', fill_value: float = 0, axis: int = -2) -> np.ndarray`
  - **Docstring:** *Compute the energy at harmonics of time-frequency representation.*

- [x] `salience`
  - **Signature:** `(S: np.ndarray, freqs: np.ndarray, harmonics: Sequence[float], weights: Optional[ArrayLike] = None, aggregate: Optional[Callable] = None, filter_peaks: bool = True, fill_value: float = np.nan, kind: str = 'linear', axis: int = -2) -> np.ndarray`
  - **Docstring:** *Harmonic salience function.*

## `librosa/core/intervals.py`

- [N/A] `__harmonic_distance` - Private Python implementation helper for interval calculations, not exposed in JavaScript API
  - **Signature:** `(logs, a, b)`
  - **Docstring:** *Compute the harmonic distance between ratios a and b.*

- [N/A] `_crystal_tie_break` - Private Python implementation helper for interval tie-breaking, not exposed in JavaScript API
  - **Signature:** `(a, b, logs)`
  - **Docstring:** *Given two tuples of prime powers, break ties.*

- [x] `interval_frequencies`
  - **Signature:** `(n_bins: int, fmin: _FloatLike_co, intervals: Union[str, Collection[float]], bins_per_octave: int = 12, tuning: float = 0.0, sort: bool = True) -> np.ndarray`
  - **Docstring:** *Construct a set of frequencies from an interval set*

- [x] `plimit_intervals`
  - **Signature:** `(primes: ArrayLike, bins_per_octave: int = ..., sort: bool = ..., return_factors: Literal[False] = ...) -> np.ndarray`

- [x] `plimit_intervals`
  - **Signature:** `(primes: ArrayLike, bins_per_octave: int = ..., sort: bool = ..., return_factors: Literal[True]) -> List[Dict[int, int]]`

- [x] `plimit_intervals`
  - **Signature:** `(primes: ArrayLike, bins_per_octave: int = ..., sort: bool = ..., return_factors: bool = ...) -> Union[np.ndarray, List[Dict[int, int]]]`

- [x] `plimit_intervals`
  - **Signature:** `(primes: ArrayLike, bins_per_octave: int = 12, sort: bool = True, return_factors: bool = False) -> Union[np.ndarray, List[Dict[int, int]]]`
  - **Docstring:** *Construct p-limit intervals for a given set of prime factors.*

- [x] `pythagorean_intervals`
  - **Signature:** `(bins_per_octave: int = ..., sort: bool = ..., return_factors: Literal[False] = ...) -> np.ndarray`

- [x] `pythagorean_intervals`
  - **Signature:** `(bins_per_octave: int = ..., sort: bool = ..., return_factors: Literal[True]) -> List[Dict[int, int]]`

- [x] `pythagorean_intervals`
  - **Signature:** `(bins_per_octave: int = ..., sort: bool = ..., return_factors: bool = ...) -> Union[np.ndarray, List[Dict[int, int]]]`

- [x] `pythagorean_intervals`
  - **Signature:** `(bins_per_octave: int = 12, sort: bool = True, return_factors: bool = False) -> Union[np.ndarray, List[Dict[int, int]]]`
  - **Docstring:** *Pythagorean intervals*

## `librosa/core/notation.py`

- [N/A] `__bo_fold` - Private Python implementation helper for interval folding, not exposed in JavaScript API
  - **Signature:** `(d)`
  - **Docstring:** *Compute the balanced, octave-folded interval.*

- [N/A] `__fifth_search` - Private Python implementation helper for interval calculation, not exposed in JavaScript API
  - **Signature:** `(interval, tolerance)`
  - **Docstring:** *Accelerated helper function for finding the number of fifths*

- [N/A] `__mode_to_key` - Private Python implementation helper for mode conversion, not exposed in JavaScript API
  - **Signature:** `(signature: str, unicode: bool = True) -> str`
  - **Docstring:** *Translate a mode (eg D:dorian) into its equivalent major key. If unicode==True, return the accidentals as unicode symbols, regardless of nature of ...*

- [N/A] `__note_to_degree` - Private Python implementation helper (scalar overload), not exposed in JavaScript API
  - **Signature:** `(key: str) -> int`

- [N/A] `__note_to_degree` - Private Python implementation helper (array overload), not exposed in JavaScript API
  - **Signature:** `(key: _IterableLike[str]) -> np.ndarray`

- [N/A] `__note_to_degree` - Private Python implementation helper (union overload), not exposed in JavaScript API
  - **Signature:** `(key: Union[str, _IterableLike[str], Iterable[str]]) -> Union[int, np.ndarray]`

- [N/A] `__note_to_degree` - Private Python implementation helper (full signature), not exposed in JavaScript API
  - **Signature:** `(key: Union[str, _IterableLike[str], Iterable[str]]) -> Union[int, np.ndarray]`
  - **Docstring:** *Take a note name and return the degree of that note (e.g. 'C#' -> 1). We allow possibilities like "C#b".*

- [N/A] `__o_fold` - Private Python implementation helper for octave folding, not exposed in JavaScript API
  - **Signature:** `(d)`
  - **Docstring:** *Compute the octave-folded interval.*

- [N/A] `__simplify_note` - Private Python implementation helper (scalar overload), not exposed in JavaScript API
  - **Signature:** `(key: str, additional_acc: str = ..., unicode: bool = ...) -> str`

- [N/A] `__simplify_note` - Private Python implementation helper (array overload), not exposed in JavaScript API
  - **Signature:** `(key: _IterableLike[str], additional_acc: str = ..., unicode: bool = ...) -> np.ndarray`

- [N/A] `__simplify_note` - Private Python implementation helper (union overload), not exposed in JavaScript API
  - **Signature:** `(key: Union[str, _IterableLike[str], Iterable[str]], additional_acc: str = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [N/A] `__simplify_note` - Private Python implementation helper (full signature), not exposed in JavaScript API
  - **Signature:** `(key: Union[str, _IterableLike[str], Iterable[str]], additional_acc: str = '', unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Take in a note name and simplify by canceling sharp-flat pairs, and doubling accidentals as appropriate.*

- [TODO] `fifths_to_note` - User-facing music theory function, could be implemented in JavaScript
  - **Signature:** `(unison: str, fifths: int, unicode: bool = True) -> str`
  - **Docstring:** *Calculate the note name for a given number of perfect fifths*

- [x] `interval_to_fjs` - TypeScript scalar overload (would be implemented as single JS function handling both cases)
  - **Signature:** `(interval: _FloatLike_co, unison: str = ..., tolerance: float = ..., unicode: bool = ...) -> str`

- [x] `interval_to_fjs` - TypeScript array overload (would be implemented as single JS function handling both cases)
  - **Signature:** `(interval: _SequenceLike[_FloatLike_co], unison: str = ..., tolerance: float = ..., unicode: bool = ...) -> np.ndarray`

- [x] `interval_to_fjs` - TypeScript union overload (would be implemented as single JS function handling both cases)
  - **Signature:** `(interval: _ScalarOrSequence[_FloatLike_co], unison: str = ..., tolerance: float = ..., unicode: bool = ...) -> Union[str, np.ndarray]`

- [x] `interval_to_fjs` - User-facing music theory function, could be implemented in JavaScript
  - **Signature:** `(interval: _ScalarOrSequence[_FloatLike_co], unison: str = 'C', tolerance: float = 65.0 / 63, unicode: bool = True) -> Union[str, np.ndarray]`
  - **Docstring:** *Convert an interval to Functional Just System (FJS) notation.*

- [x] `key_to_degrees`
  - **Signature:** `(key: str) -> np.ndarray`
  - **Docstring:** *Construct the diatonic scale degrees for a given key.*

- [x] `key_to_notes`
  - **Signature:** `(key: str, unicode: bool = True, natural: bool = False) -> List[str]`
  - **Docstring:** *List all 12 note names in the chromatic scale, as spelled according to*

- [x] `list_mela`
  - **Signature:** `() -> Dict[str, int]`
  - **Docstring:** *List melakarta ragas by name and index.*

- [x] `list_thaat`
  - **Signature:** `() -> List[str]`
  - **Docstring:** *List supported thaats by name.*

- [x] `mela_to_degrees`
  - **Signature:** `(mela: Union[str, int]) -> np.ndarray`
  - **Docstring:** *Construct the svara indices (degrees) for a given melakarta raga*

- [x] `mela_to_svara`
  - **Signature:** `(mela: Union[str, int], abbr: bool = True, unicode: bool = True) -> List[str]`
  - **Docstring:** *Spell the Carnatic svara names for a given melakarta raga*

- [x] `thaat_to_degrees`
  - **Signature:** `(thaat: str) -> np.ndarray`
  - **Docstring:** *Construct the svara indices (degrees) for a given thaat*

## `librosa/core/pitch.py`

- [N/A] `__check_yin_params` - Private Python validation helper for YIN parameters, not exposed in JavaScript API
  - **Signature:** `(sr: float, fmax: float, fmin: float, frame_length: int)`
  - **Docstring:** *Check the feasibility of yin/pyin parameters against*

- [N/A] `__pyin_helper` - Private Python implementation helper for pYIN algorithm, not exposed in JavaScript API
  - **Signature:** `(yin_frames, parabolic_shifts, sr, thresholds, boltzmann_parameter, beta_probs, no_trough_prob, min_period, fmin, n_pitch_bins, n_bins_per_semitone)`

- [N/A] `_cumulative_mean_normalized_difference` - Private Python implementation helper for YIN algorithm, not exposed in JavaScript API
  - **Signature:** `(y_frames: np.ndarray, min_period: int, max_period: int) -> np.ndarray`
  - **Docstring:** *Cumulative mean normalized difference function (equation 8 in [#]_)*

- [N/A] `_helper` - Private Python implementation helper, not exposed in JavaScript API
  - **Signature:** `(a, b)`

- [N/A] `_parabolic_interpolation` - Private Python implementation helper for parabolic interpolation, not exposed in JavaScript API
  - **Signature:** `(x: np.ndarray, axis: int = -2) -> np.ndarray`
  - **Docstring:** *Piecewise parabolic interpolation for yin and pyin.*

- [N/A] `_pi_stencil` - Private Python stencil helper for parabolic interpolation, not exposed in JavaScript API
  - **Signature:** `(x: np.ndarray) -> np.ndarray`
  - **Docstring:** *Stencil to compute local parabolic interpolation*

- [N/A] `_pi_wrapper` - Private Python vectorized wrapper for parabolic interpolation, not exposed in JavaScript API
  - **Signature:** `(x: np.ndarray, y: np.ndarray) -> None`
  - **Docstring:** *Vectorized wrapper for the parabolic interpolation stencil*

- [x] `estimate_tuning`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: Optional[int] = 2048, resolution: float = 0.01, bins_per_octave: int = 12, **kwargs: Any) -> float`
  - **Docstring:** *Estimate the tuning of an audio time series or spectrogram input.*

- [x] `piptrack`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: Optional[int] = 2048, hop_length: Optional[int] = None, fmin: float = 150.0, fmax: float = 4000.0, threshold: float = 0.1, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', ref: Optional[Union[float, Callable]] = None) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Pitch tracking on thresholded parabolically-interpolated STFT.*

- [x] `pitch_tuning`
  - **Signature:** `(frequencies: ArrayLike, resolution: float = 0.01, bins_per_octave: int = 12) -> float`
  - **Docstring:** *Given a collection of pitches, estimate its tuning offset*

- [x] `pyin`
  - **Signature:** `(y: np.ndarray, fmin: float, fmax: float, sr: float = 22050, frame_length: int = 2048, win_length: Optional[Union[int, Deprecated]] = Deprecated(), hop_length: Optional[int] = None, n_thresholds: int = 100, beta_parameters: Tuple[float, float] = (2, 18), boltzmann_parameter: float = 2, resolution: float = 0.1, max_transition_rate: float = 35.92, switch_prob: float = 0.01, no_trough_prob: float = 0.01, fill_na: Optional[float] = np.nan, center: bool = True, pad_mode: _PadMode = 'constant') -> Tuple[np.ndarray, np.ndarray, np.ndarray]`
  - **Docstring:** *Fundamental frequency (F0) estimation using probabilistic YIN (pYIN).*

- [x] `yin`
  - **Signature:** `(y: np.ndarray, fmin: float, fmax: float, sr: float = 22050, frame_length: int = 2048, win_length: Optional[Union[int, Deprecated]] = Deprecated(), hop_length: Optional[int] = None, trough_threshold: float = 0.1, center: bool = True, pad_mode: _PadMode = 'constant') -> np.ndarray`
  - **Docstring:** *Fundamental frequency (F0) estimation using the YIN algorithm.*

## `librosa/core/spectrum.py`

- [N/A] `__overlap_add` - Private Python implementation helper for overlap-add in Griffin-Lim, not exposed in JavaScript API
  - **Signature:** `(y, ytmp, hop_length)`

- [N/A] `__reassign_frequencies` - Private Python implementation helper for reassigned spectrogram, not exposed in JavaScript API
  - **Signature:** `(y: np.ndarray, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, dtype: Optional[DTypeLike] = None, pad_mode: _PadModeSTFT = 'constant') -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Instantaneous frequencies based on a spectrogram representation.*

- [N/A] `__reassign_times` - Private Python implementation helper for reassigned spectrogram, not exposed in JavaScript API
  - **Signature:** `(y: np.ndarray, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, dtype: Optional[DTypeLike] = None, pad_mode: _PadModeSTFT = 'constant') -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Time reassignments based on a spectrogram representation.*

- [N/A] `_spectrogram` - Private Python implementation helper for spectrogram computation, not exposed in JavaScript API
  - **Signature:** `(y: Optional[np.ndarray] = None, S: Optional[np.ndarray] = None, n_fft: Optional[int] = 2048, hop_length: Optional[int] = 512, power: float = 1, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant') -> Tuple[np.ndarray, int]`
  - **Docstring:** *Retrieve a magnitude spectrogram.*

- [x] `amplitude_to_db`
  - **Signature:** `(S: _ComplexLike_co, ref: Union[float, Callable] = ..., amin: float = ..., top_db: Optional[float] = ...) -> np.floating[Any]`

- [x] `amplitude_to_db`
  - **Signature:** `(S: _SequenceLike[_ComplexLike_co], ref: Union[float, Callable] = ..., amin: float = ..., top_db: Optional[float] = ...) -> np.ndarray`

- [x] `amplitude_to_db`
  - **Signature:** `(S: _ScalarOrSequence[_ComplexLike_co], ref: Union[float, Callable] = ..., amin: float = ..., top_db: Optional[float] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `amplitude_to_db`
  - **Signature:** `(S: _ScalarOrSequence[_ComplexLike_co], ref: Union[float, Callable] = 1.0, amin: float = 1e-05, top_db: Optional[float] = 80.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert an amplitude spectrogram to dB-scaled spectrogram.*

- [x] `db_to_amplitude`
  - **Signature:** `(S_db: _FloatLike_co, ref: float = ...) -> np.floating[Any]`

- [x] `db_to_amplitude`
  - **Signature:** `(S_db: np.ndarray, ref: float = ...) -> np.ndarray`

- [x] `db_to_amplitude`
  - **Signature:** `(S_db: Union[_FloatLike_co, np.ndarray], ref: float = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `db_to_amplitude`
  - **Signature:** `(S_db: Union[_FloatLike_co, np.ndarray], ref: float = 1.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert a dB-scaled spectrogram to an amplitude spectrogram.*

- [x] `db_to_power`
  - **Signature:** `(S_db: _FloatLike_co, ref: float = ...) -> np.floating[Any]`

- [x] `db_to_power`
  - **Signature:** `(S_db: np.ndarray, ref: float = ...) -> np.ndarray`

- [x] `db_to_power`
  - **Signature:** `(S_db: Union[_FloatLike_co, np.ndarray], ref: float = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `db_to_power`
  - **Signature:** `(S_db: Union[_FloatLike_co, np.ndarray], ref: float = 1.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert dB-scale values to a power values.*

- [x] `fmt`
  - **Signature:** `(y: np.ndarray, t_min: float = 0.5, n_fmt: Optional[int] = None, kind: str = 'cubic', beta: float = 0.5, over_sample: float = 1, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Fast Mellin transform (FMT)*

- [x] `griffinlim`
  - **Signature:** `(S: np.ndarray, n_iter: int = 32, hop_length: Optional[int] = None, win_length: Optional[int] = None, n_fft: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, dtype: Optional[DTypeLike] = None, length: Optional[int] = None, pad_mode: _PadModeSTFT = 'constant', momentum: float = 0.99, init: Optional[str] = 'random', random_state: Optional[Union[int, np.random.RandomState, np.random.Generator]] = None) -> np.ndarray`
  - **Docstring:** *Approximate magnitude spectrogram inversion using the "fast" Griffin-Lim algorithm.*

- [TODO] `iirt` - User-facing IIR transform function, could be implemented in JavaScript using Web Audio BiquadFilterNode
  - **Signature:** `(y: np.ndarray, sr: float = 22050, win_length: int = 2048, hop_length: Optional[int] = None, center: bool = True, tuning: float = 0.0, pad_mode: _PadMode = 'constant', flayout: str = 'sos', res_type: str = 'soxr_hq', **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Time-frequency representation using IIR filters*

- [x] `istft`
  - **Signature:** `(stft_matrix: np.ndarray, hop_length: Optional[int] = None, win_length: Optional[int] = None, n_fft: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, dtype: Optional[DTypeLike] = None, length: Optional[int] = None, out: Optional[np.ndarray] = None) -> np.ndarray`
  - **Docstring:** *Inverse short-time Fourier transform (ISTFT).*

- [x] `magphase`
  - **Signature:** `(D: np.ndarray, power: float = 1) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Separate a complex-valued spectrogram D into its magnitude (S)*

- [x] `pcen`
  - **Signature:** `(S: np.ndarray, sr: float = ..., hop_length: int = ..., gain: float = ..., bias: float = ..., power: float = ..., time_constant: float = ..., eps: float = ..., b: Optional[float] = ..., max_size: int = ..., ref: Optional[np.ndarray] = ..., axis: int = ..., max_axis: Optional[int] = ..., zi: Optional[np.ndarray] = ..., return_zf: Literal[False] = ...) -> np.ndarray`

- [x] `pcen`
  - **Signature:** `(S: np.ndarray, sr: float = ..., hop_length: int = ..., gain: float = ..., bias: float = ..., power: float = ..., time_constant: float = ..., eps: float = ..., b: Optional[float] = ..., max_size: int = ..., ref: Optional[np.ndarray] = ..., axis: int = ..., max_axis: Optional[int] = ..., zi: Optional[np.ndarray] = ..., return_zf: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `pcen`
  - **Signature:** `(S: np.ndarray, sr: float = ..., hop_length: int = ..., gain: float = ..., bias: float = ..., power: float = ..., time_constant: float = ..., eps: float = ..., b: Optional[float] = ..., max_size: int = ..., ref: Optional[np.ndarray] = ..., axis: int = ..., max_axis: Optional[int] = ..., zi: Optional[np.ndarray] = ..., return_zf: bool = ...) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`

- [x] `pcen`
  - **Signature:** `(S: np.ndarray, sr: float = 22050, hop_length: int = 512, gain: float = 0.98, bias: float = 2, power: float = 0.5, time_constant: float = 0.4, eps: float = 1e-06, b: Optional[float] = None, max_size: int = 1, ref: Optional[np.ndarray] = None, axis: int = -1, max_axis: Optional[int] = None, zi: Optional[np.ndarray] = None, return_zf: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Per-channel energy normalization (PCEN)*

- [x] `perceptual_weighting`
  - **Signature:** `(S: np.ndarray, frequencies: np.ndarray, kind: str = 'A', **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Perceptual weighting of a power spectrogram::*

- [x] `phase_vocoder`
  - **Signature:** `(D: np.ndarray, rate: float, hop_length: Optional[int] = None, n_fft: Optional[int] = None) -> np.ndarray`
  - **Docstring:** *Phase vocoder.  Given an STFT matrix D, speed up by a factor of ``rate``*

- [x] `power_to_db`
  - **Signature:** `(S: _ComplexLike_co, ref: Union[float, Callable] = ..., amin: float = ..., top_db: Optional[float] = ...) -> np.floating[Any]`

- [x] `power_to_db`
  - **Signature:** `(S: _SequenceLike[_ComplexLike_co], ref: Union[float, Callable] = ..., amin: float = ..., top_db: Optional[float] = ...) -> np.ndarray`

- [x] `power_to_db`
  - **Signature:** `(S: _ScalarOrSequence[_ComplexLike_co], ref: Union[float, Callable] = ..., amin: float = ..., top_db: Optional[float] = ...) -> Union[np.floating[Any], np.ndarray]`

- [x] `power_to_db`
  - **Signature:** `(S: _ScalarOrSequence[_ComplexLike_co], ref: Union[float, Callable] = 1.0, amin: float = 1e-10, top_db: Optional[float] = 80.0) -> Union[np.floating[Any], np.ndarray]`
  - **Docstring:** *Convert a power spectrogram (amplitude squared) to decibel (dB) units*

- [x] `reassigned_spectrogram`
  - **Signature:** `(y: np.ndarray, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, reassign_frequencies: bool = True, reassign_times: bool = True, ref_power: Union[float, Callable] = 1e-06, fill_nan: bool = False, clip: bool = True, dtype: Optional[DTypeLike] = None, pad_mode: _PadModeSTFT = 'constant') -> Tuple[np.ndarray, np.ndarray, np.ndarray]`
  - **Docstring:** *Time-frequency reassigned spectrogram.*

- [x] `stft`
  - **Signature:** `(y: np.ndarray, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, dtype: Optional[DTypeLike] = None, pad_mode: _PadModeSTFT = 'constant', out: Optional[np.ndarray] = None) -> np.ndarray`
  - **Docstring:** *Short-time Fourier transform (STFT).*

## `librosa/decompose.py`

- [N/A] `__nn_filter_helper` - Private Python implementation helper for nn_filter, not exposed in JavaScript API
  - **Signature:** `(R_data, R_indices, R_ptr, S: np.ndarray, aggregate: Callable) -> np.ndarray`
  - **Docstring:** *Nearest-neighbor filter helper function.*

- [x] `decompose`
  - **Signature:** `(S: np.ndarray, n_components: Optional[int] = None, transformer: Optional[object] = None, sort: bool = False, fit: bool = True, **kwargs: Any) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Decompose a feature matrix.*

- [x] `hpss`
  - **Signature:** `(S: np.ndarray, kernel_size: Union[_IntLike_co, Tuple[_IntLike_co, _IntLike_co], List[_IntLike_co]] = 31, power: float = 2.0, mask: bool = False, margin: Union[_FloatLike_co, Tuple[_FloatLike_co, _FloatLike_co], List[_FloatLike_co]] = 1.0) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Median-filtering harmonic percussive source separation (HPSS).*

- [x] `nn_filter`
  - **Signature:** `(S: np.ndarray, rec: Optional[Union[scipy.sparse.spmatrix, np.ndarray]] = None, aggregate: Optional[Callable] = None, axis: int = -1, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Filter by nearest-neighbor aggregation.*

## `librosa/display.py`

- [N/A] `__call__` - Matplotlib formatter magic method, not applicable to JavaScript (browser uses Canvas/SVG)
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Return the time format as pos*

- [N/A] `__call__` - Matplotlib formatter magic method, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Apply the formatter to position*

- [N/A] `__call__` - Matplotlib formatter magic method, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`

- [N/A] `__call__` - Matplotlib formatter magic method, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Apply the formatter to position*

- [N/A] `__call__` - Matplotlib formatter magic method, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Apply the formatter to position*

- [N/A] `__call__` - Matplotlib formatter magic method for chroma, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Format for chroma positions*

- [N/A] `__call__` - Matplotlib formatter magic method for chroma, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Format for chroma positions*

- [N/A] `__call__` - Matplotlib formatter magic method for chroma, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Format for chroma positions*

- [N/A] `__call__` - Matplotlib formatter magic method for tonnetz, not applicable to JavaScript
  - **Signature:** `(self, x: float, pos: Optional[int] = None) -> str`
  - **Docstring:** *Format for tonnetz positions*

- [N/A] `__check_axes` - Matplotlib axes helper, not applicable to JavaScript (browser uses Canvas/SVG contexts)
  - **Signature:** `(axes: Optional[mplaxes.Axes]) -> mplaxes.Axes`
  - **Docstring:** *Check if "axes" is an instance of an axis object. If not, use `gca`.*

- [N/A] `__coord_chroma` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, bins_per_octave: int = 12, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Get chroma bin numbers*

- [N/A] `__coord_cqt_hz` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, fmin: Optional[_FloatLike_co] = None, bins_per_octave: int = 12, sr: float = 22050, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Get CQT bin frequencies*

- [N/A] `__coord_fft_hz` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, sr: float = 22050, n_fft: Optional[int] = None, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Get the frequencies for FFT bins*

- [N/A] `__coord_fourier_tempo` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, sr: float = 22050, hop_length: int = 512, win_length: Optional[int] = None, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Fourier tempogram coordinates*

- [N/A] `__coord_mel_hz` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, fmin: Optional[float] = 0.0, fmax: Optional[float] = None, sr: float = 22050, htk: bool = False, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Get the frequencies for Mel bins*

- [N/A] `__coord_n` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Get bare positions*

- [N/A] `__coord_tempo` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, sr: float = 22050, hop_length: int = 512, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Tempo coordinates*

- [N/A] `__coord_time` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, sr: float = 22050, hop_length: int = 512, **_kwargs: Any) -> np.ndarray`
  - **Docstring:** *Get time coordinates from frames*

- [N/A] `__coord_vqt_hz` - Matplotlib coordinate helper for display, not applicable to JavaScript API
  - **Signature:** `(n: int, fmin: Optional[_FloatLike_co] = None, bins_per_octave: int = 12, sr: float = 22050, intervals: Optional[Union[str, Collection[float]]] = None, unison: Optional[str] = None, **_kwargs: Any) -> np.ndarray`

- [N/A] `__decorate_axis` - Matplotlib axis decoration helper, not applicable to JavaScript
  - **Signature:** `(axis, ax_type, key='C:maj', Sa=None, mela=None, thaat=None, unicode=True, fmin=None, unison=None, intervals=None, bins_per_octave=None, n_bins=None)`
  - **Docstring:** *Configure axis tickers, locators, and labels*

- [N/A] `__del__` - Python destructor for display class, not applicable to JavaScript
  - **Signature:** `(self) -> None`
  - **Docstring:** *Disconnect callback methods on delete*

- [N/A] `__envelope` - Matplotlib display helper for waveshow, not applicable to JavaScript API
  - **Signature:** `(x, hop)`
  - **Docstring:** *Compute the max-envelope of non-overlapping frames of x at length hop*

- [N/A] `__init__` - Python constructor for TimeFormatter, not applicable to JavaScript
  - **Signature:** `(self, lag: bool = False, unit: Optional[str] = None)`

- [N/A] `__init__` - Python constructor for NoteFormatter, not applicable to JavaScript
  - **Signature:** `(self, octave: bool = True, major: bool = True, key: str = 'C:maj', unicode: bool = True)`

- [N/A] `__init__` - Python constructor for SvaraFormatter (Carnatic), not applicable to JavaScript
  - **Signature:** `(self, Sa: float, octave: bool = True, major: bool = True, abbr: bool = False, mela: Optional[Union[str, int]] = None, unicode: bool = True)`

- [N/A] `__init__` - Python constructor for IntervalFormatter, not applicable to JavaScript
  - **Signature:** `(self, fmin: int, n_bins: int, bins_per_octave: int, intervals: Union[str, Collection[float]], major: bool = True, unison: Optional[str] = None, unicode: bool = True)`

- [N/A] `__init__` - Python constructor for TonnetzFormatter, not applicable to JavaScript
  - **Signature:** `(self, major: bool = True)`

- [N/A] `__init__` - Python constructor for ChromaFormatter, not applicable to JavaScript
  - **Signature:** `(self, key: str = 'C:maj', unicode: bool = True)`

- [N/A] `__init__` - Python constructor for ChromaSvaraFormatter, not applicable to JavaScript
  - **Signature:** `(self, Sa: Optional[float] = None, mela: Optional[Union[int, str]] = None, abbr: bool = True, unicode: bool = True)`

- [N/A] `__init__` - Python constructor for ChromaFJSFormatter, not applicable to JavaScript
  - **Signature:** `(self, intervals: Union[str, Collection[float]], unison: str = 'C', unicode: bool = True, bins_per_octave: Optional[int] = None)`

- [N/A] `__init__` - Python constructor for AdaptiveWaveplot, not applicable to JavaScript
  - **Signature:** `(self, times: np.ndarray, y: np.ndarray, steps: Line2D, envelope: PolyCollection, sr: float = 22050, max_samples: int = 11025, transpose: bool = False)`

- [N/A] `__mesh_coords` - Matplotlib coordinate mesh helper, not applicable to JavaScript API
  - **Signature:** `(ax_type, coords, n, **kwargs)`
  - **Docstring:** *Compute axis coordinates*

- [N/A] `__same_axes` - Matplotlib axes comparison helper, not applicable to JavaScript
  - **Signature:** `(x_axis, y_axis, xlim, ylim)`
  - **Docstring:** *Check if two axes are similar, used to determine squared plots*

- [N/A] `__scale_axes` - Matplotlib axes scaling helper, not applicable to JavaScript
  - **Signature:** `(axes, ax_type, which, tempo_min, tempo_max)`
  - **Docstring:** *Set the axis scaling*

- [N/A] `__set_current_image` - Matplotlib pyplot helper, not applicable to JavaScript
  - **Signature:** `(ax, img)`
  - **Docstring:** *Set the current image when working in pyplot mode.*

- [x] `cmap` - Matplotlib colormap function, not applicable to JavaScript (browser uses CSS/Canvas gradients)
  - **Signature:** `(data: np.ndarray, robust: bool = True, cmap_seq: str = 'magma', cmap_bool: str = 'gray_r', cmap_div: str = 'coolwarm') -> Colormap`
  - **Docstring:** *Get a default colormap from the given data.*

- [x] `connect` - Matplotlib event callback connector, not applicable to JavaScript
  - **Signature:** `(self, ax: mplaxes.Axes, signal: str = 'xlim_changed') -> None`
  - **Docstring:** *Connect the adaptor to a signal on an axes object.*

- [x] `disconnect` - Matplotlib event callback disconnector, not applicable to JavaScript
  - **Signature:** `(self, strict: bool = False) -> None`
  - **Docstring:** *Disconnect the adaptor's update callback.*

- [x] `specshow` - Matplotlib spectrogram display function, not applicable to JavaScript (browser would use Canvas/WebGL)
  - **Signature:** `(data: np.ndarray, x_coords: Optional[np.ndarray] = None, y_coords: Optional[np.ndarray] = None, x_axis: Optional[str] = None, y_axis: Optional[str] = None, sr: float = 22050, hop_length: int = 512, n_fft: Optional[int] = None, win_length: Optional[int] = None, fmin: Optional[float] = None, fmax: Optional[float] = None, tempo_min: Optional[float] = 16, tempo_max: Optional[float] = 480, tuning: float = 0.0, bins_per_octave: int = 12, key: str = 'C:maj', Sa: Optional[Union[float, int]] = None, mela: Optional[Union[str, int]] = None, thaat: Optional[str] = None, auto_aspect: bool = True, htk: bool = False, unicode: bool = True, intervals: Optional[Union[str, np.ndarray]] = None, unison: Optional[str] = None, ax: Optional[mplaxes.Axes] = None, **kwargs: Any) -> QuadMesh`
  - **Docstring:** *Display a spectrogram/chromagram/cqt/etc.*

- [x] `update` - Matplotlib display update callback, not applicable to JavaScript
  - **Signature:** `(self, ax: mplaxes.Axes) -> None`
  - **Docstring:** *Update the matplotlib display according to the current viewport limits.*

- [x] `waveshow` - Matplotlib waveform display function, not applicable to JavaScript (browser would use Canvas/SVG)
  - **Signature:** `(y: np.ndarray, sr: float = 22050, max_points: int = 11025, axis: Optional[str] = 'time', offset: float = 0.0, marker: Union[str, MplPath, MarkerStyle] = '', where: str = 'post', label: Optional[str] = None, transpose: bool = False, ax: Optional[mplaxes.Axes] = None, x_axis: Optional[Union[str, Deprecated]] = Deprecated(), **kwargs: Any) -> AdaptiveWaveplot`
  - **Docstring:** *Visualize a waveform in the time domain.*

## `librosa/effects.py`

- [N/A] `_signal_to_frame_nonsilent` - Private Python implementation helper for split/trim functions, not exposed in JavaScript API
  - **Signature:** `(y: np.ndarray, frame_length: int = 2048, hop_length: int = 512, top_db: float = 60, ref: Union[Callable, float] = np.max, aggregate: Callable = np.max) -> np.ndarray`
  - **Docstring:** *Frame-wise non-silent indicator for audio input.*

- [x] `deemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = ..., zi: Optional[ArrayLike] = ..., return_zf: Literal[False] = ...) -> np.ndarray`

- [x] `deemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = ..., zi: Optional[ArrayLike] = ..., return_zf: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `deemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = 0.97, zi: Optional[ArrayLike] = None, return_zf: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *De-emphasize an audio signal with the inverse operation of preemphasis():*

- [x] `harmonic`
  - **Signature:** `(y: np.ndarray, kernel_size: Union[_IntLike_co, Tuple[_IntLike_co, _IntLike_co], List[_IntLike_co]] = 31, power: float = 2.0, mask: bool = False, margin: Union[_FloatLike_co, Tuple[_FloatLike_co, _FloatLike_co], List[_FloatLike_co]] = 1.0, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant') -> np.ndarray`
  - **Docstring:** *Extract harmonic elements from an audio time-series.*

- [x] `hpss`
  - **Signature:** `(y: np.ndarray, kernel_size: Union[_IntLike_co, Tuple[_IntLike_co, _IntLike_co], List[_IntLike_co]] = 31, power: float = 2.0, mask: bool = False, margin: Union[_FloatLike_co, Tuple[_FloatLike_co, _FloatLike_co], List[_FloatLike_co]] = 1.0, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant') -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Decompose an audio time series into harmonic and percussive components.*

- [x] `percussive`
  - **Signature:** `(y: np.ndarray, kernel_size: Union[_IntLike_co, Tuple[_IntLike_co, _IntLike_co], List[_IntLike_co]] = 31, power: float = 2.0, mask: bool = False, margin: Union[_FloatLike_co, Tuple[_FloatLike_co, _FloatLike_co], List[_FloatLike_co]] = 1.0, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant') -> np.ndarray`
  - **Docstring:** *Extract percussive elements from an audio time-series.*

- [x] `pitch_shift`
  - **Signature:** `(y: np.ndarray, sr: float, n_steps: float, bins_per_octave: int = 12, res_type: str = 'soxr_hq', scale: bool = False, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Shift the pitch of a waveform by ``n_steps`` steps.*

- [x] `preemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = ..., zi: Optional[ArrayLike] = ..., return_zf: Literal[False] = ...) -> np.ndarray`

- [x] `preemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = ..., zi: Optional[ArrayLike] = ..., return_zf: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `preemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = ..., zi: Optional[ArrayLike] = ..., return_zf: bool) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`

- [x] `preemphasis`
  - **Signature:** `(y: np.ndarray, coef: float = 0.97, zi: Optional[ArrayLike] = None, return_zf: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Pre-emphasize an audio signal with a first-order differencing filter:*

- [x] `remix`
  - **Signature:** `(y: np.ndarray, intervals: Iterable[Tuple[int, int]], align_zeros: bool = True) -> np.ndarray`
  - **Docstring:** *Remix an audio signal by re-ordering time intervals.*

- [x] `split`
  - **Signature:** `(y: np.ndarray, top_db: float = 60, ref: Union[float, Callable] = np.max, frame_length: int = 2048, hop_length: int = 512, aggregate: Callable = np.max) -> np.ndarray`
  - **Docstring:** *Split an audio signal into non-silent intervals.*

- [x] `time_stretch`
  - **Signature:** `(y: np.ndarray, rate: float, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Time-stretch an audio series by a fixed rate.*

- [x] `trim`
  - **Signature:** `(y: np.ndarray, top_db: float = 60, ref: Union[float, Callable] = np.max, frame_length: int = 2048, hop_length: int = 512, aggregate: Callable = np.max) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Trim leading and trailing silence from an audio signal.*

## `librosa/feature/__init__.py`

- No functions found.

## `librosa/feature/inverse.py`

- [x] `mel_to_audio`
  - **Signature:** `(M: np.ndarray, sr: float = 22050, n_fft: int = 2048, hop_length: Optional[int] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', power: float = 2.0, n_iter: int = 32, length: Optional[int] = None, dtype: DTypeLike = np.float32, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Invert a mel power spectrogram to audio using Griffin-Lim.*

- [x] `mel_to_stft`
  - **Signature:** `(M: np.ndarray, sr: float = 22050, n_fft: int = 2048, power: float = 2.0, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Approximate STFT magnitude from a Mel power spectrogram.*

- [x] `mfcc_to_audio`
  - **Signature:** `(mfcc: np.ndarray, n_mels: int = 128, dct_type: int = 2, norm: Optional[str] = 'ortho', ref: float = 1.0, lifter: float = 0, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Convert Mel-frequency cepstral coefficients to a time-domain audio signal*

- [x] `mfcc_to_mel`
  - **Signature:** `(mfcc: np.ndarray, n_mels: int = 128, dct_type: int = 2, norm: Optional[str] = 'ortho', ref: float = 1.0, lifter: float = 0) -> np.ndarray`
  - **Docstring:** *Invert Mel-frequency cepstral coefficients to approximate a Mel power*

## `librosa/feature/rhythm.py`

- [x] `fourier_tempogram`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, hop_length: int = 512, win_length: int = 384, center: bool = True, window: _WindowSpec = 'hann') -> np.ndarray`
  - **Docstring:** *Compute the Fourier tempogram: the short-time Fourier transform of the*

- [x] `tempo`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, tg: Optional[np.ndarray] = None, hop_length: int = 512, start_bpm: float = 120, std_bpm: float = 1.0, ac_size: float = 8.0, max_tempo: Optional[float] = 320.0, aggregate: Optional[Callable[..., Any]] = np.mean, prior: Optional[scipy.stats.rv_continuous] = None) -> np.ndarray`
  - **Docstring:** *Estimate the tempo (beats per minute)*

- [x] `tempogram`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, hop_length: int = 512, win_length: int = 384, center: bool = True, window: _WindowSpec = 'hann', norm: Optional[float] = np.inf) -> np.ndarray`
  - **Docstring:** *Compute the tempogram: local autocorrelation of the onset strength envelope. [#]_*

- [x] `tempogram_ratio`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, tg: Optional[np.ndarray] = None, bpm: Optional[np.ndarray] = None, hop_length: int = 512, win_length: int = 384, start_bpm: float = 120, std_bpm: float = 1.0, max_tempo: Optional[float] = 320.0, freqs: Optional[np.ndarray] = None, factors: Optional[np.ndarray] = None, aggregate: Optional[Callable[..., Any]] = None, prior: Optional[scipy.stats.rv_continuous] = None, center: bool = True, window: _WindowSpec = 'hann', kind: str = 'linear', fill_value: float = 0, norm: Optional[float] = np.inf) -> np.ndarray`
  - **Docstring:** *Tempogram ratio features, also known as spectral rhythm patterns. [1]_*

## `librosa/feature/spectral.py`

- [x] `chroma_cens`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, C: Optional[np.ndarray] = None, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, tuning: Optional[float] = None, n_chroma: int = 12, n_octaves: int = 7, bins_per_octave: int = 36, cqt_mode: str = 'full', window: Optional[np.ndarray] = None, norm: Optional[float] = 2, win_len_smooth: Optional[int] = 41, smoothing_window: _WindowSpec = 'hann') -> np.ndarray`
  - **Docstring:** *Compute the chroma variant "Chroma Energy Normalized" (CENS)*

- [x] `chroma_cqt`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, C: Optional[np.ndarray] = None, hop_length: int = 512, fmin: Optional[_FloatLike_co] = None, norm: Optional[Union[int, float]] = np.inf, threshold: float = 0.0, tuning: Optional[float] = None, n_chroma: int = 12, n_octaves: int = 7, window: Optional[np.ndarray] = None, bins_per_octave: Optional[int] = 36, cqt_mode: str = 'full') -> np.ndarray`
  - **Docstring:** *Constant-Q chromagram*

- [x] `chroma_stft`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, norm: Optional[float] = np.inf, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', tuning: Optional[float] = None, n_chroma: int = 12, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute a chromagram from a waveform or power spectrogram.*

- [x] `chroma_vqt`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, V: Optional[np.ndarray] = None, hop_length: int = 512, fmin: Optional[float] = None, intervals: Union[str, Collection[float]], norm: Optional[float] = np.inf, threshold: float = 0.0, n_octaves: int = 7, bins_per_octave: int = 12, gamma: float = 0) -> np.ndarray`
  - **Docstring:** *Variable-Q chromagram*

- [x] `melspectrogram`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', power: float = 2.0, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute a mel-scaled spectrogram.*

- [x] `mfcc`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_mfcc: int = 20, dct_type: int = 2, norm: Optional[str] = 'ortho', lifter: float = 0, mel_norm: Optional[Union[Literal['slaney'], float]] = 'slaney', **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Mel-frequency cepstral coefficients (MFCCs)*

- [x] `poly_features`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', order: int = 1, freq: Optional[np.ndarray] = None) -> np.ndarray`
  - **Docstring:** *Get coefficients of fitting an nth-order polynomial to the columns*

- [x] `rms`
  - **Signature:** `(y: Optional[np.ndarray] = None, S: Optional[np.ndarray] = None, frame_length: int = 2048, hop_length: int = 512, center: bool = True, pad_mode: _PadMode = 'constant', dtype: DTypeLike = np.float32) -> np.ndarray`
  - **Docstring:** *Compute root-mean-square (RMS) value for each frame, either from the*

- [x] `spectral_bandwidth`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', freq: Optional[np.ndarray] = None, centroid: Optional[np.ndarray] = None, norm: bool = True, p: float = 2) -> np.ndarray`
  - **Docstring:** *Compute p'th-order spectral bandwidth.*

- [x] `spectral_centroid`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, freq: Optional[np.ndarray] = None, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant') -> np.ndarray`
  - **Docstring:** *Compute the spectral centroid.*

- [x] `spectral_contrast`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', freq: Optional[np.ndarray] = None, fmin: float = 200.0, n_bands: int = 6, quantile: float = 0.02, linear: bool = False) -> np.ndarray`
  - **Docstring:** *Compute spectral contrast*

- [x] `spectral_flatness`
  - **Signature:** `(y: Optional[np.ndarray] = None, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', amin: float = 1e-10, power: float = 2.0) -> np.ndarray`
  - **Docstring:** *Compute spectral flatness*

- [x] `spectral_rolloff`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, win_length: Optional[int] = None, window: _WindowSpec = 'hann', center: bool = True, pad_mode: _PadModeSTFT = 'constant', freq: Optional[np.ndarray] = None, roll_percent: float = 0.85) -> np.ndarray`
  - **Docstring:** *Compute roll-off frequency.*

- [x] `tonnetz`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, chroma: Optional[np.ndarray] = None, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute the tonal centroid features (tonnetz)*

- [x] `zero_crossing_rate`
  - **Signature:** `(y: np.ndarray, frame_length: int = 2048, hop_length: int = 512, center: bool = True, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute the zero-crossing rate of an audio time series.*

## `librosa/feature/utils.py`

- [N/A] `__stack` - Private Python implementation helper for stack_memory, not exposed in JavaScript API
  - **Signature:** `(history, data, n_steps, delay)`
  - **Docstring:** *Memory-stacking helper function.*

- [x] `delta`
  - **Signature:** `(data: np.ndarray, width: int = 9, order: int = 1, axis: int = -1, mode: str = 'interp', **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute delta features: local estimate of the derivative*

- [x] `stack_memory`
  - **Signature:** `(data: np.ndarray, n_steps: int = 2, delay: int = 1, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Short-term history embedding: vertically concatenate a data*

## `librosa/filters.py`

- [N/A] `__float_window` - Private Python decorator for window functions, not exposed in JavaScript API
  - **Signature:** `(window_spec)`
  - **Docstring:** *Decorate a window function to support fractional input lengths.*

- [N/A] `__window_ss_fill` - Private Python implementation helper for window envelope computation, not exposed in JavaScript API
  - **Signature:** `(x, win_sq, n_frames, hop_length)`
  - **Docstring:** *Compute the sum-square envelope of a window.*

- [N/A] `_multirate_fb` - Private Python implementation helper for multirate filterbank, not exposed in JavaScript API
  - **Signature:** `(center_freqs: Optional[np.ndarray] = None, sample_rates: Optional[np.ndarray] = None, Q: float = 25.0, passband_ripple: float = 1, stopband_attenuation: float = 50, ftype: str = 'ellip', flayout: str = 'sos') -> Tuple[List[Any], np.ndarray]`
  - **Docstring:** *Construct a multirate filterbank.*

- [N/A] `_relative_bandwidth` - Private Python implementation helper for bandwidth calculation, not exposed in JavaScript API
  - **Signature:** `(freqs: np.ndarray) -> np.ndarray`
  - **Docstring:** *Compute the relative bandwidth for each of a set of specified frequencies.*

- [N/A] `_wrap` - Private Python window wrapping helper, not exposed in JavaScript API
  - **Signature:** `(n, *args, **kwargs)`
  - **Docstring:** *Wrap the window*

- [x] `chroma`
  - **Signature:** `(sr: float, n_fft: int, n_chroma: int = 12, tuning: float = 0.0, ctroct: float = 5.0, octwidth: Union[float, None] = 2, norm: Optional[float] = 2, base_c: bool = True, dtype: DTypeLike = np.float32) -> np.ndarray`
  - **Docstring:** *Create a chroma filter bank.*

- [x] `constant_q`
  - **Signature:** `(sr: float, fmin: Optional[_FloatLike_co] = None, n_bins: int = 84, bins_per_octave: int = 12, window: _WindowSpec = 'hann', filter_scale: float = 1, pad_fft: bool = True, norm: Optional[float] = 1, dtype: DTypeLike = np.complex64, gamma: float = 0, **kwargs: Any) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Construct a constant-Q basis.*

- [x] `constant_q_lengths`
  - **Signature:** `(sr: float, fmin: _FloatLike_co, n_bins: int = 84, bins_per_octave: int = 12, window: _WindowSpec = 'hann', filter_scale: float = 1, gamma: float = 0) -> np.ndarray`
  - **Docstring:** *Return length of each filter in a constant-Q basis.*

- [x] `cq_to_chroma`
  - **Signature:** `(n_input: int, bins_per_octave: int = 12, n_chroma: int = 12, fmin: Optional[_FloatLike_co] = None, window: Optional[np.ndarray] = None, base_c: bool = True, dtype: DTypeLike = np.float32) -> np.ndarray`
  - **Docstring:** *Construct a linear transformation matrix to map Constant-Q bins*

- [x] `diagonal_filter`
  - **Signature:** `(window: _WindowSpec, n: int, slope: float = 1.0, angle: Optional[float] = None, zero_mean: bool = False) -> np.ndarray`
  - **Docstring:** *Build a two-dimensional diagonal filter.*

- [x] `get_window`
  - **Signature:** `(window: _WindowSpec, Nx: int, fftbins: Optional[bool] = True) -> np.ndarray`
  - **Docstring:** *Compute a window function.*

- [x] `mel`
  - **Signature:** `(sr: float, n_fft: int, n_mels: int = 128, fmin: float = 0.0, fmax: Optional[float] = None, htk: bool = False, norm: Optional[Union[Literal['slaney'], float]] = 'slaney', dtype: DTypeLike = np.float32) -> np.ndarray`
  - **Docstring:** *Create a Mel filter-bank.*

- [x] `mr_frequencies`
  - **Signature:** `(tuning: float) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Generate center frequencies and sample rate pairs.*

- [x] `semitone_filterbank`
  - **Signature:** `(center_freqs: Optional[np.ndarray] = None, tuning: float = 0.0, sample_rates: Optional[np.ndarray] = None, flayout: str = 'ba', **kwargs: Any) -> Tuple[List[Any], np.ndarray]`
  - **Docstring:** *Construct a multi-rate bank of infinite-impulse response (IIR)*

- [x] `wavelet`
  - **Signature:** `(freqs: np.ndarray, sr: float = 22050, window: _WindowSpec = 'hann', filter_scale: float = 1, pad_fft: bool = True, norm: Optional[float] = 1, dtype: DTypeLike = np.complex64, gamma: float = 0, alpha: Optional[float] = None, **kwargs: Any) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Construct a wavelet basis using windowed complex sinusoids.*

- [x] `wavelet_lengths`
  - **Signature:** `(freqs: ArrayLike, sr: float = 22050, window: _WindowSpec = 'hann', filter_scale: float = 1, gamma: Optional[float] = 0, alpha: Optional[Union[float, np.ndarray]] = None) -> Tuple[np.ndarray, float]`
  - **Docstring:** *Return length of each filter in a wavelet basis.*

- [x] `window_bandwidth`
  - **Signature:** `(window: _WindowSpec, n: int = 1000) -> float`
  - **Docstring:** *Get the equivalent noise bandwidth (ENBW) of a window function.*

- [x] `window_sumsquare`
  - **Signature:** `(window: _WindowSpec, n_frames: int, hop_length: int = 512, win_length: Optional[int] = None, n_fft: int = 2048, dtype: DTypeLike = np.float32, norm: Optional[float] = None) -> np.ndarray`
  - **Docstring:** *Compute the sum-square envelope of a window function at a given hop length.*

## `librosa/onset.py`

- [x] `onset_backtrack`
  - **Signature:** `(events: np.ndarray, energy: np.ndarray) -> np.ndarray`
  - **Docstring:** *Backtrack detected onset events to the nearest preceding local*

- [x] `onset_detect`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, onset_envelope: Optional[np.ndarray] = None, hop_length: int = 512, backtrack: bool = False, energy: Optional[np.ndarray] = None, units: str = 'frames', normalize: bool = True, sparse: bool = True, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Locate note onset events by picking peaks in an onset strength envelope.*

- [x] `onset_strength`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, lag: int = 1, max_size: int = 1, ref: Optional[np.ndarray] = None, detrend: bool = False, center: bool = True, feature: Optional[Callable] = None, aggregate: Optional[Union[Callable, bool]] = None, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute a spectral flux onset strength envelope.*

- [x] `onset_strength_multi`
  - **Signature:** `(y: Optional[np.ndarray] = None, sr: float = 22050, S: Optional[np.ndarray] = None, n_fft: int = 2048, hop_length: int = 512, lag: int = 1, max_size: int = 1, ref: Optional[np.ndarray] = None, detrend: bool = False, center: bool = True, feature: Optional[Callable] = None, aggregate: Optional[Union[Callable, bool]] = None, channels: Optional[Union[Sequence[int], Sequence[slice]]] = None, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Compute a spectral flux onset strength envelope across multiple channels.*

## `librosa/segment.py`

- [N/A] `__affinity_bandwidth` - Private Python implementation helper for bandwidth calculation in recurrence matrices, not exposed in JavaScript API
  - **Signature:** `(rec: scipy.sparse.csr_matrix, bw_mode: Optional[Union[np.ndarray, _FloatLike_co, str]], k: int) -> Union[float, np.ndarray]`

- [N/A] `__my_filter` - Private Python filter wrapper for lag domain operations, not exposed in JavaScript API
  - **Signature:** `(wrapped_f, *args, **kwargs)`
  - **Docstring:** *Wrap the filter with lag conversions*

- [x] `agglomerative`
  - **Signature:** `(data: np.ndarray, k: int, clusterer: Optional[sklearn.cluster.AgglomerativeClustering] = None, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Bottom-up temporal segmentation.*

- [x] `cross_similarity`
  - **Signature:** `(data: np.ndarray, data_ref: np.ndarray, k: Optional[int] = ..., metric: str = ..., sparse: Literal[False] = ..., mode: str = ..., bandwidth: Optional[Union[np.ndarray, _FloatLike_co, str]] = None, full: bool = False) -> np.ndarray`

- [x] `cross_similarity`
  - **Signature:** `(data: np.ndarray, data_ref: np.ndarray, k: Optional[int] = ..., metric: str = ..., sparse: Literal[True] = ..., mode: str = ..., bandwidth: Optional[Union[np.ndarray, _FloatLike_co, str]] = None, full: bool = False) -> scipy.sparse.csc_matrix`

- [x] `cross_similarity`
  - **Signature:** `(data: np.ndarray, data_ref: np.ndarray, k: Optional[int] = None, metric: str = 'euclidean', sparse: bool = False, mode: str = 'connectivity', bandwidth: Optional[Union[np.ndarray, _FloatLike_co, str]] = None, full: bool = False) -> Union[np.ndarray, scipy.sparse.csc_matrix]`
  - **Docstring:** *Compute cross-similarity from one data sequence to a reference sequence.*

- [x] `lag_to_recurrence`
  - **Signature:** `(lag: _ArrayOrSparseMatrix, axis: int = -1) -> _ArrayOrSparseMatrix`
  - **Docstring:** *Convert a lag matrix into a recurrence matrix.*

- [x] `path_enhance`
  - **Signature:** `(R: np.ndarray, n: int, window: _WindowSpec = 'hann', max_ratio: float = 2.0, min_ratio: Optional[float] = None, n_filters: int = 7, zero_mean: bool = False, clip: bool = True, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Multi-angle path enhancement for self- and cross-similarity matrices.*

- [x] `recurrence_matrix`
  - **Signature:** `(data: np.ndarray, k: Optional[int] = ..., width: int = ..., metric: str = ..., sym: bool = ..., sparse: Literal[True] = ..., mode: str = ..., bandwidth: Optional[Union[np.ndarray, _FloatLike_co, str]] = ..., self: bool = ..., axis: int = ..., full: bool = False) -> scipy.sparse.csc_matrix`

- [x] `recurrence_matrix`
  - **Signature:** `(data: np.ndarray, k: Optional[int] = ..., width: int = ..., metric: str = ..., sym: bool = ..., sparse: Literal[False] = ..., mode: str = ..., bandwidth: Optional[Union[np.ndarray, _FloatLike_co, str]] = ..., self: bool = ..., axis: int = ..., full: bool = False) -> np.ndarray`

- [x] `recurrence_matrix`
  - **Signature:** `(data: np.ndarray, k: Optional[int] = None, width: int = 1, metric: str = 'euclidean', sym: bool = False, sparse: bool = False, mode: str = 'connectivity', bandwidth: Optional[Union[np.ndarray, _FloatLike_co, str]] = None, self: bool = False, axis: int = -1, full: bool = False) -> Union[np.ndarray, scipy.sparse.csc_matrix]`
  - **Docstring:** *Compute a recurrence matrix from a data matrix.*

- [x] `recurrence_to_lag`
  - **Signature:** `(rec: _ArrayOrSparseMatrix, pad: bool = True, axis: int = -1) -> _ArrayOrSparseMatrix`
  - **Docstring:** *Convert a recurrence matrix into a lag matrix.*

- [x] `subsegment`
  - **Signature:** `(data: np.ndarray, frames: np.ndarray, n_segments: int = 4, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Sub-divide a segmentation by feature clustering.*

- [x] `timelag_filter`
  - **Signature:** `(function: _F, pad: bool = True, index: int = 0) -> _F`
  - **Docstring:** *Apply a filter in the time-lag domain.*

## `librosa/sequence.py`

- [N/A] `__dtw_backtracking` - Private Python implementation helper for DTW backtracking, not exposed in JavaScript API
  - **Signature:** `(steps: np.ndarray, step_sizes_sigma: np.ndarray, subseq: bool, start: Optional[int] = None) -> List[Tuple[int, int]]`
  - **Docstring:** *Backtrack optimal warping path.*

- [N/A] `__dtw_calc_accu_cost` - Private Python implementation helper for DTW cost calculation, not exposed in JavaScript API
  - **Signature:** `(C: np.ndarray, D: np.ndarray, steps: np.ndarray, step_sizes_sigma: np.ndarray, weights_mul: np.ndarray, weights_add: np.ndarray, max_0: int, max_1: int) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Calculate the accumulated cost matrix D.*

- [N/A] `__rqa_backtrack` - Private Python implementation helper for RQA backtracking, not exposed in JavaScript API
  - **Signature:** `(score, pointers)`
  - **Docstring:** *RQA path backtracking*

- [N/A] `__rqa_dp` - Private Python implementation helper for RQA dynamic programming, not exposed in JavaScript API
  - **Signature:** `(sim: np.ndarray, gap_onset: float, gap_extend: float, knight: bool) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *RQA dynamic programming implementation*

- [N/A] `_helper` - Private Python helper function for Viterbi, not exposed in JavaScript API
  - **Signature:** `(lp)`

- [N/A] `_helper` - Private Python helper function for Viterbi (overload), not exposed in JavaScript API
  - **Signature:** `(lp)`

- [N/A] `_viterbi` - Private Python implementation helper for Viterbi algorithm, not exposed in JavaScript API
  - **Signature:** `(log_prob: np.ndarray, log_trans: np.ndarray, log_p_init: np.ndarray) -> Tuple[np.ndarray, np.ndarray]`
  - **Docstring:** *Core Viterbi algorithm.*

- [x] `dtw`
  - **Signature:** `(X: np.ndarray, Y: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[False], global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[False] = ...) -> np.ndarray`

- [x] `dtw`
  - **Signature:** `(C: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[False], global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[False] = ...) -> np.ndarray`

- [x] `dtw`
  - **Signature:** `(X: np.ndarray, Y: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[False], global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `dtw`
  - **Signature:** `(C: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[False], global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `dtw`
  - **Signature:** `(X: np.ndarray, Y: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[True] = ..., global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[False] = ...) -> Tuple[np.ndarray, np.ndarray]`

- [x] `dtw`
  - **Signature:** `(C: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[True] = ..., global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[False] = ...) -> Tuple[np.ndarray, np.ndarray]`

- [x] `dtw`
  - **Signature:** `(X: np.ndarray, Y: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[True] = ..., global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[True]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]`

- [x] `dtw`
  - **Signature:** `(C: np.ndarray, metric: str = ..., step_sizes_sigma: Optional[np.ndarray] = ..., weights_add: Optional[np.ndarray] = ..., weights_mul: Optional[np.ndarray] = ..., subseq: bool = ..., backtrack: Literal[True] = ..., global_constraints: bool = ..., band_rad: float = ..., return_steps: Literal[True]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]`

- [x] `dtw`
  - **Signature:** `(X: Optional[np.ndarray] = None, Y: Optional[np.ndarray] = None, C: Optional[np.ndarray] = None, metric: str = 'euclidean', step_sizes_sigma: Optional[np.ndarray] = None, weights_add: Optional[np.ndarray] = None, weights_mul: Optional[np.ndarray] = None, subseq: bool = False, backtrack: bool = True, global_constraints: bool = False, band_rad: float = 0.25, return_steps: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray], Tuple[np.ndarray, np.ndarray, np.ndarray]]`
  - **Docstring:** *Dynamic time warping (DTW).*

- [x] `dtw_backtracking`
  - **Signature:** `(steps: np.ndarray, step_sizes_sigma: Optional[np.ndarray] = None, subseq: bool = False, start: Optional[Union[int, np.integer[Any]]] = None) -> np.ndarray`
  - **Docstring:** *Backtrack a warping path.*

- [x] `rqa`
  - **Signature:** `(sim: np.ndarray, gap_onset: float = ..., gap_extend: float = ..., knight_moves: bool = ..., backtrack: Literal[False]) -> np.ndarray`

- [x] `rqa`
  - **Signature:** `(sim: np.ndarray, gap_onset: float = ..., gap_extend: float = ..., knight_moves: bool = ..., backtrack: Literal[True] = ...) -> Tuple[np.ndarray, np.ndarray]`

- [x] `rqa`
  - **Signature:** `(sim: np.ndarray, gap_onset: float = ..., gap_extend: float = ..., knight_moves: bool = ..., backtrack: bool = ...) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`

- [x] `rqa`
  - **Signature:** `(sim: np.ndarray, gap_onset: float = 1, gap_extend: float = 1, knight_moves: bool = True, backtrack: bool = True) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Recurrence quantification analysis (RQA)*

- [x] `transition_cycle`
  - **Signature:** `(n_states: int, prob: Union[float, Iterable[float]]) -> np.ndarray`
  - **Docstring:** *Construct a cyclic transition matrix over ``n_states``.*

- [x] `transition_local`
  - **Signature:** `(n_states: int, width: Union[int, Iterable[int]], window: _WindowSpec = 'triangle', wrap: bool = False) -> np.ndarray`
  - **Docstring:** *Construct a localized transition matrix.*

- [x] `transition_loop`
  - **Signature:** `(n_states: int, prob: Union[float, Iterable[float]]) -> np.ndarray`
  - **Docstring:** *Construct a self-loop transition matrix over ``n_states``.*

- [x] `transition_uniform`
  - **Signature:** `(n_states: int) -> np.ndarray`
  - **Docstring:** *Construct a uniform transition matrix over ``n_states``.*

- [x] `viterbi`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_init: Optional[np.ndarray] = ..., return_logp: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `viterbi`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_init: Optional[np.ndarray] = ..., return_logp: Literal[False] = ...) -> np.ndarray`

- [x] `viterbi`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_init: Optional[np.ndarray] = None, return_logp: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Viterbi decoding from observation likelihoods.*

- [x] `viterbi_binary`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = ..., p_init: Optional[np.ndarray] = ..., return_logp: Literal[False] = ...) -> np.ndarray`

- [x] `viterbi_binary`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = ..., p_init: Optional[np.ndarray] = ..., return_logp: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `viterbi_binary`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = ..., p_init: Optional[np.ndarray] = ..., return_logp: bool = ...) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`

- [x] `viterbi_binary`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = None, p_init: Optional[np.ndarray] = None, return_logp: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Viterbi decoding from binary (multi-label), discriminative state predictions.*

- [x] `viterbi_discriminative`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = ..., p_init: Optional[np.ndarray] = ..., return_logp: Literal[False] = ...) -> np.ndarray`

- [x] `viterbi_discriminative`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = ..., p_init: Optional[np.ndarray] = ..., return_logp: Literal[True]) -> Tuple[np.ndarray, np.ndarray]`

- [x] `viterbi_discriminative`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = ..., p_init: Optional[np.ndarray] = ..., return_logp: bool) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`

- [x] `viterbi_discriminative`
  - **Signature:** `(prob: np.ndarray, transition: np.ndarray, p_state: Optional[np.ndarray] = None, p_init: Optional[np.ndarray] = None, return_logp: bool = False) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Viterbi decoding from discriminative state predictions.*

## `librosa/util/__init__.py`

- No functions found.

## `librosa/util/_nnls.py`

- [N/A] `_nnls_lbfgs_block` - Private Python implementation helper for NNLS solver, not exposed in JavaScript API
  - **Signature:** `(A: np.ndarray, B: np.ndarray, x_init: Optional[np.ndarray] = None, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Solve the constrained problem over a single block*

- [N/A] `_nnls_obj` - Private Python implementation helper for NNLS objective calculation, not exposed in JavaScript API
  - **Signature:** `(x: np.ndarray, shape: Sequence[int], A: np.ndarray, B: np.ndarray) -> Tuple[float, np.ndarray]`
  - **Docstring:** *Compute the objective and gradient for NNLS*

- [TODO] `nnls` - User-facing non-negative least squares function, could be implemented in JavaScript
  - **Signature:** `(A: np.ndarray, B: np.ndarray, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Non-negative least squares.*

## `librosa/util/decorators.py`

- [N/A] `__wrapper` - Python decorator wrapper for deprecation warnings, not applicable to JavaScript
  - **Signature:** `(func: Callable[P, R], *args: P.args, **kwargs: P.kwargs) -> R`
  - **Docstring:** *Warn the user, and then proceed.*

- [N/A] `__wrapper` - Python decorator wrapper for move warnings, not applicable to JavaScript
  - **Signature:** `(func: Callable[P, R], *args: P.args, **kwargs: P.kwargs) -> R`
  - **Docstring:** *Warn the user, and then proceed.*

- [N/A] `__wrapper` - Python decorator wrapper for vectorization, not applicable to JavaScript
  - **Signature:** `(function)`

- [N/A] `_vec` - Private Python vectorization helper, not applicable to JavaScript
  - **Signature:** `(*args, **kwargs)`

- [x] `deprecated` - Python decorator for deprecation warnings, not applicable to JavaScript
  - **Signature:** `(version: str, version_removed: str) -> Callable[[Callable[P, R]], Callable[P, R]]`
  - **Docstring:** *Mark a function as deprecated.*

- [x] `moved` - Python decorator for moved function warnings, not applicable to JavaScript
  - **Signature:** `(moved_from: str, version: str, version_removed: str) -> Callable[[Callable[P, R]], Callable[P, R]]`
  - **Docstring:** *Mark functions as moved/renamed.*

- [N/A] `vectorize` - Python decorator for np.vectorize, not applicable to JavaScript
  - **Signature:** `(otypes: Optional[Union[str, Iterable[DTypeLike]]] = None, doc: Optional[str] = None, excluded: Optional[Iterable[Union[int, str]]] = None, cache: bool = False, signature: Optional[str] = None) -> Callable[[_F], _F]`
  - **Docstring:** *Wrap a function for use with np.vectorize.*

## `librosa/util/deprecation.py`

- [N/A] `__repr__` - Python magic method for deprecated objects display, not applicable to JavaScript
  - **Signature:** `(self) -> str`
  - **Docstring:** *Pretty-print display for deprecated objects*

- [x] `rename_kw` - Python utility for handling renamed keyword arguments, not applicable to JavaScript
  - **Signature:** `(old_name: str, old_value: Any, new_name: str, new_value: Any, version_deprecated: str, version_removed: str) -> Any`
  - **Docstring:** *Handle renamed arguments.*

## `librosa/util/example_data/__init__.py`

- No functions found.

## `librosa/util/exceptions.py`

- No functions found.

## `librosa/util/files.py`

- [N/A] `__get_files` - Private Python filesystem helper, not applicable to JavaScript (browser has no filesystem access)
  - **Signature:** `(dir_name: Union[str, os.PathLike[Any]], extensions: Set[str])`
  - **Docstring:** *Get a list of files in a single directory*

- [N/A] `_resource_file` - Private Python package resource context manager, not applicable to JavaScript
  - **Signature:** `(package: str, resource: str)`
  - **Docstring:** *Provide a context manager for accessing resources in a package.*

- [x] `cite` - Python utility for printing citation information, not applicable to JavaScript browser context
  - **Signature:** `(version: Optional[str] = None) -> str`
  - **Docstring:** *Print the citation information for librosa.*

- [x] `example` - Implemented in xa-file.js for loading example audio files from URLs in browser
  - **Signature:** `(key: str, hq: bool = False) -> str`
  - **Docstring:** *Retrieve the example recording identified by 'key'.*

- [x] `example_info` - Implemented as `exampleInfo()` in xa-file.js for browser metadata access
  - **Signature:** `(key: str) -> None`
  - **Docstring:** *Display licensing and metadata information for the given example recording.*

- [x] `find_files` - Python filesystem utility for finding audio files, not applicable to JavaScript (browser has no filesystem access)
  - **Signature:** `(directory: Union[str, os.PathLike[Any]], ext: Optional[Union[str, List[str]]] = None, recurse: bool = True, case_sensitive: bool = False, limit: Optional[int] = None, offset: int = 0) -> List[str]`
  - **Docstring:** *Get a sorted list of (audio) files in a directory or directory sub-tree.*

- [x] `list_examples` - Implemented as `listExamples()` in xa-file.js for browser example registry
  - **Signature:** `() -> None`
  - **Docstring:** *List the available audio recordings included with librosa.*

## `librosa/util/matching.py`

- [N/A] `__jaccard` - Private Python implementation helper for Jaccard similarity, not exposed in JavaScript API
  - **Signature:** `(int_a: np.ndarray, int_b: np.ndarray)`
  - **Docstring:** *Jaccard similarity between two intervals*

- [N/A] `__match_events_helper` - Private Python implementation helper for event matching, not exposed in JavaScript API
  - **Signature:** `(output: np.ndarray, events_from: np.ndarray, events_to: np.ndarray, left: bool = True, right: bool = True)`

- [N/A] `__match_interval_overlaps` - Private Python implementation helper for interval overlap matching, not exposed in JavaScript API
  - **Signature:** `(query, intervals_to, candidates)`
  - **Docstring:** *Find the best Jaccard match from query to candidates*

- [N/A] `__match_intervals` - Private Python Numba-accelerated helper for interval matching, not exposed in JavaScript API
  - **Signature:** `(intervals_from: np.ndarray, intervals_to: np.ndarray, strict: bool = True) -> np.ndarray`
  - **Docstring:** *Numba-accelerated interval matching algorithm.*

- [x] `match_events`
  - **Signature:** `(events_from: _SequenceLike, events_to: _SequenceLike, left: bool = True, right: bool = True) -> np.ndarray`
  - **Docstring:** *Match one set of events to another.*

- [x] `match_intervals`
  - **Signature:** `(intervals_from: np.ndarray, intervals_to: np.ndarray, strict: bool = True) -> np.ndarray`
  - **Docstring:** *Match one set of time intervals to another.*

## `librosa/util/utils.py`

- [N/A] `__count_unique` - Private Python implementation helper for counting unique values, not exposed in JavaScript API
  - **Signature:** `(x)`
  - **Docstring:** *Count the number of unique values in an array.*

- [N/A] `__is_unique` - Private Python implementation helper for uniqueness checking, not exposed in JavaScript API
  - **Signature:** `(x)`
  - **Docstring:** *Determine if the input array has all unique values.*

- [N/A] `__peak_pick` - Private Python vectorized wrapper for peak-picking, not exposed in JavaScript API
  - **Signature:** `(x, pre_max, post_max, pre_avg, post_avg, delta, wait, peaks)`
  - **Docstring:** *Vectorized wrapper for the peak-picker*

- [N/A] `__shear_dense` - Private Python Numba-accelerated helper for shearing dense arrays, not exposed in JavaScript API
  - **Signature:** `(X: np.ndarray, factor: int = +1, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Numba-accelerated shear for dense (ndarray) arrays*

- [N/A] `__shear_sparse` - Private Python implementation helper for shearing sparse matrices, not exposed in JavaScript API
  - **Signature:** `(X: scipy.sparse.spmatrix, factor: int = +1, axis: int = -1) -> scipy.sparse.spmatrix`
  - **Docstring:** *Fast shearing for sparse matrices*

- [N/A] `_cabs2` - Private Python implementation helper for abs2, not exposed in JavaScript API
  - **Signature:** `(x: _ComplexLike_co) -> _FloatLike_co`
  - **Docstring:** *Efficiently compute abs2 on complex inputs*

- [N/A] `_localmax` - Private Python vectorized wrapper for local maxima, not exposed in JavaScript API
  - **Signature:** `(x, y)`
  - **Docstring:** *Vectorized wrapper for the localmax stencil*

- [N/A] `_localmax_sten` - Private Python Numba stencil for local maxima, not exposed in JavaScript API
  - **Signature:** `(x)`
  - **Docstring:** *Numba stencil for local maxima computation*

- [N/A] `_localmin` - Private Python vectorized wrapper for local minima, not exposed in JavaScript API
  - **Signature:** `(x, y)`
  - **Docstring:** *Vectorized wrapper for the localmin stencil*

- [N/A] `_localmin_sten` - Private Python Numba stencil for local minima, not exposed in JavaScript API
  - **Signature:** `(x)`
  - **Docstring:** *Numba stencil for local minima computation*

- [N/A] `_phasor_angles` - Private Python implementation helper for phasor angles, not exposed in JavaScript API
  - **Signature:** `(x) -> np.complexfloating[Any, Any]`

- [x] `abs2`
  - **Signature:** `(x: _NumberOrArray, dtype: Optional[DTypeLike] = None) -> _NumberOrArray`
  - **Docstring:** *Compute the squared magnitude of a real or complex array.*

- [x] `axis_sort`
  - **Signature:** `(S: np.ndarray, axis: int = ..., index: Literal[False] = ..., value: Optional[Callable[..., Any]] = ...) -> np.ndarray`

- [x] `axis_sort`
  - **Signature:** `(S: np.ndarray, axis: int = ..., index: Literal[True], value: Optional[Callable[..., Any]] = ...) -> Tuple[np.ndarray, np.ndarray]`

- [x] `axis_sort`
  - **Signature:** `(S: np.ndarray, axis: int = -1, index: bool = False, value: Optional[Callable[..., Any]] = None) -> Union[np.ndarray, Tuple[np.ndarray, np.ndarray]]`
  - **Docstring:** *Sort an array along its rows or columns.*

- [x] `buf_to_float`
  - **Signature:** `(x: np.ndarray, n_bytes: int = 2, dtype: DTypeLike = np.float32) -> np.ndarray`
  - **Docstring:** *Convert an integer buffer to floating point values.*

- [x] `count_unique`
  - **Signature:** `(data: np.ndarray, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Count the number of unique values in a multi-dimensional array*

- [x] `cyclic_gradient`
  - **Signature:** `(data: np.ndarray, edge_order: Literal[1, 2] = 1, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Estimate the gradient of a function over a uniformly sampled,*

- [x] `dtype_c2r`
  - **Signature:** `(d: DTypeLike, default: Optional[type] = np.float32) -> DTypeLike`
  - **Docstring:** *Find the real numpy dtype corresponding to a complex dtype.*

- [x] `dtype_r2c`
  - **Signature:** `(d: DTypeLike, default: Optional[type] = np.complex64) -> DTypeLike`
  - **Docstring:** *Find the complex numpy dtype corresponding to a real dtype.*

- [x] `expand_to`
  - **Signature:** `(x: np.ndarray, ndim: int, axes: Union[int, slice, Sequence[int], Sequence[slice]]) -> np.ndarray`
  - **Docstring:** *Expand the dimensions of an input array with*

- [x] `fill_off_diagonal`
  - **Signature:** `(x: np.ndarray, radius: float, value: float = 0) -> None`
  - **Docstring:** *Set all cells of a matrix to a given ``value``*

- [x] `fix_frames`
  - **Signature:** `(frames: _SequenceLike[int], x_min: Optional[int] = 0, x_max: Optional[int] = None, pad: bool = True) -> np.ndarray`
  - **Docstring:** *Fix a list of frames to lie within [x_min, x_max]*

- [x] `fix_length`
  - **Signature:** `(data: np.ndarray, size: int, axis: int = -1, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Fix the length an array ``data`` to exactly ``size`` along a target axis.*

- [x] `frame`
  - **Signature:** `(x: np.ndarray, frame_length: int, hop_length: int, axis: int = -1, writeable: bool = False, subok: bool = False) -> np.ndarray`
  - **Docstring:** *Slice a data array into (overlapping) frames.*

- [x] `index_to_slice`
  - **Signature:** `(idx: _SequenceLike[int], idx_min: Optional[int] = None, idx_max: Optional[int] = None, step: Optional[int] = None, pad: bool = True) -> List[slice]`
  - **Docstring:** *Generate a slice array from an index array.*

- [x] `is_positive_int`
  - **Signature:** `(x: float) -> bool`
  - **Docstring:** *Check that x is a positive integer, i.e. 1 or greater.*

- [x] `is_unique`
  - **Signature:** `(data: np.ndarray, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Determine if the input array consists of all unique values*

- [x] `localmax`
  - **Signature:** `(x: np.ndarray, axis: int = 0) -> np.ndarray`
  - **Docstring:** *Find local maxima in an array*

- [x] `localmin`
  - **Signature:** `(x: np.ndarray, axis: int = 0) -> np.ndarray`
  - **Docstring:** *Find local minima in an array*

- [x] `normalize`
  - **Signature:** `(S: np.ndarray, norm: Optional[float] = np.inf, axis: Optional[int] = 0, threshold: Optional[_FloatLike_co] = None, fill: Optional[bool] = None) -> np.ndarray`
  - **Docstring:** *Normalize an array along a chosen axis.*

- [x] `pad_center`
  - **Signature:** `(data: np.ndarray, size: int, axis: int = -1, **kwargs: Any) -> np.ndarray`
  - **Docstring:** *Pad an array to a target length along a target axis.*

- [x] `peak_pick`
  - **Signature:** `(x: np.ndarray, pre_max: int, post_max: int, pre_avg: int, post_avg: int, delta: float, wait: int, sparse: bool = True, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Use a flexible heuristic to pick peaks in a signal.*

- [x] `phasor`
  - **Signature:** `(angles: np.ndarray, mag: Optional[np.ndarray] = ...) -> np.ndarray`

- [x] `phasor`
  - **Signature:** `(angles: _Real, mag: Optional[_Number] = ...) -> np.complexfloating[Any, Any]`

- [x] `phasor`
  - **Signature:** `(angles: Union[np.ndarray, _Real], mag: Optional[Union[np.ndarray, _Number]] = None) -> Union[np.ndarray, np.complexfloating[Any, Any]]`
  - **Docstring:** *Construct a complex phasor representation from angles.*

- [x] `shear`
  - **Signature:** `(X: np.ndarray, factor: int = ..., axis: int = ...) -> np.ndarray`

- [x] `shear`
  - **Signature:** `(X: scipy.sparse.spmatrix, factor: int = ..., axis: int = ...) -> scipy.sparse.spmatrix`

- [x] `shear`
  - **Signature:** `(X: _ArrayOrSparseMatrix, factor: int = 1, axis: int = -1) -> _ArrayOrSparseMatrix`
  - **Docstring:** *Shear a matrix by a given factor.*

- [x] `softmask`
  - **Signature:** `(X: np.ndarray, X_ref: np.ndarray, power: float = 1, split_zeros: bool = False) -> np.ndarray`
  - **Docstring:** *Robustly compute a soft-mask operation.*

- [x] `sparsify_rows`
  - **Signature:** `(x: np.ndarray, quantile: float = 0.01, dtype: Optional[DTypeLike] = None) -> scipy.sparse.csr_matrix`
  - **Docstring:** *Return a row-sparse matrix approximating the input*

- [x] `stack`
  - **Signature:** `(arrays: List[np.ndarray], axis: int = 0) -> np.ndarray`
  - **Docstring:** *Stack one or more arrays along a target axis.*

- [x] `sync`
  - **Signature:** `(data: np.ndarray, idx: Union[Sequence[int], Sequence[slice]], aggregate: Optional[Callable[..., Any]] = None, pad: bool = True, axis: int = -1) -> np.ndarray`
  - **Docstring:** *Aggregate a multi-dimensional array between specified boundaries.*

- [x] `tiny`
  - **Signature:** `(x: Union[float, np.ndarray]) -> _FloatLike_co`
  - **Docstring:** *Compute the tiny-value corresponding to an input's data type.*

- [x] `valid_audio`
  - **Signature:** `(y: np.ndarray) -> bool`
  - **Docstring:** *Determine whether a variable contains valid audio data.*

- [x] `valid_int`
  - **Signature:** `(x: float, cast: Optional[Callable[[float], float]] = None) -> int`
  - **Docstring:** *Ensure that an input value is integer-typed.*

- [x] `valid_intervals`
  - **Signature:** `(intervals: np.ndarray) -> bool`
  - **Docstring:** *Ensure that an array is a valid representation of time intervals:*

## `librosa/version.py`

- [N/A] `__get_mod_version` - Private Python utility for getting module versions, not applicable to JavaScript
  - **Signature:** `(modname)`

- [N/A] `show_versions` - Python utility for displaying dependency versions, not applicable to JavaScript browser context
  - **Signature:** `() -> None`
  - **Docstring:** *Return the version information for all librosa dependencies.*

