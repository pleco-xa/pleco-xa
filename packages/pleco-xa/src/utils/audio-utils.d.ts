/**
 * Audio utility functions for signal processing
 */
export declare function computeRMS(audioBuffer: AudioBuffer): number;
export declare function computePeak(audioBuffer: AudioBuffer): number;
export declare function computeZeroCrossingRate(audioBuffer: AudioBuffer): number;
export declare function findAllZeroCrossings(audioData: Float32Array, start: number): number[];
export declare function findAudioStart(audioData: Float32Array, sampleRate: number): number;
export declare function applyHannWindow(audioData: Float32Array): Float32Array;
export declare function reverseBufferSection(buffer: AudioBuffer, start: number, end: number): AudioBuffer;
