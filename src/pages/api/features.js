/**
 * POST /api/features
 * Extract specific audio features
 *
 * Query params:
 *   ?features=zcr,rms,chroma,onsets (comma-separated, default: all)
 */
import { decodeWav, fromRawPCM, extractFeatures } from '../../lib/audio-engine.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const ALL_FEATURES = ['zcr', 'rms', 'chroma', 'onsets']

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST({ request, url }) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let audioData

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('audio')
      if (!file) return jsonError('Missing "audio" field', 400)
      audioData = decodeWav(await file.arrayBuffer())
    } else if (contentType.includes('application/octet-stream')) {
      const sr = parseInt(url.searchParams?.get('sr') || '44100')
      audioData = fromRawPCM(new Float32Array(await request.arrayBuffer()), sr)
    } else {
      audioData = decodeWav(await request.arrayBuffer())
    }

    // Parse requested features
    const featuresParam = url.searchParams?.get('features')
    const requested = featuresParam
      ? featuresParam.split(',').filter(f => ALL_FEATURES.includes(f.trim()))
      : ALL_FEATURES

    if (requested.length === 0) {
      return jsonError(`No valid features requested. Available: ${ALL_FEATURES.join(', ')}`, 400)
    }

    const startTime = performance.now()
    const result = extractFeatures(audioData.pcm, audioData.sampleRate, requested)
    const elapsed = performance.now() - startTime

    return new Response(JSON.stringify({
      ...result,
      processing_time_ms: Math.round(elapsed),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  } catch (error) {
    return jsonError(error.message, 500)
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
