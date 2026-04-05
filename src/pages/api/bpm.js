/**
 * POST /api/bpm
 * Lightweight BPM detection endpoint
 *
 * Accepts same formats as /api/analyze
 * Returns only BPM data for fast responses
 */
import { decodeWav, fromRawPCM, detectBPM } from '../../lib/audio-engine.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

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

    const startTime = performance.now()
    const result = detectBPM(audioData.pcm, audioData.sampleRate)
    const elapsed = performance.now() - startTime

    return new Response(JSON.stringify({
      ...result,
      duration: audioData.duration,
      sample_rate: audioData.sampleRate,
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
