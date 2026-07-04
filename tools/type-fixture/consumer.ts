/**
 * Type-gate consumer fixture.
 *
 * Compiled by tools/check-types.mjs against the PACKED package (npm pack →
 * install into a throwaway temp project) with skipLibCheck: false, under
 * BOTH moduleResolution=bundler and node16. If any shipped .d.ts is
 * syntactically or semantically broken, this compile fails and the gate
 * exits non-zero.
 *
 * Imports deliberately span the main entry and the flagship subpaths so the
 * whole reachable declaration graph gets parsed and checked.
 */
import { beat_track, tempo, stft } from 'pleco-xa'
import { detect, STRATEGIES } from 'pleco-xa/loop'
import { mfcc } from 'pleco-xa/feature'

export async function exerciseTypes(): Promise<string> {
  const y = new Float32Array(22050)

  const tracked = beat_track(y, 22050, { hopLength: 512 })
  const estimated = tempo(y, { sr: 22050 })
  const spectrum = stft(y)
  const coefficients = mfcc(y, { sr: 22050, n_mfcc: 13 })

  const bufferLike = {
    getChannelData: (_channel: number) => y,
    sampleRate: 22050,
    length: y.length,
    duration: 1,
  }
  const loop = await detect(bufferLike, { strategy: 'fast' })

  return [
    tracked.tempo,
    estimated,
    spectrum,
    coefficients,
    loop.confidence,
    STRATEGIES.length,
  ]
    .map(String)
    .join(',')
}
