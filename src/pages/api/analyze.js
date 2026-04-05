/**
 * POST /api/analyze
 * Full audio analysis: BPM, beats, onsets, features
 *
 * Accepts:
 *   - WAV file as binary body (Content-Type: audio/wav)
 *   - Multipart form-data with field "audio"
 *   - Raw PCM Float32 (Content-Type: application/octet-stream, ?sr=44100)
 */
import { decodeWav, fromRawPCM, analyzeAudio } from '../../lib/audio-engine.js'

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
      if (!file) {
        return jsonError('Missing "audio" field in form data', 400)
      }
      const arrayBuffer = await file.arrayBuffer()
      audioData = decodeWav(arrayBuffer)
    } else if (contentType.includes('application/octet-stream')) {
      const arrayBuffer = await request.arrayBuffer()
      const sr = parseInt(url.searchParams?.get('sr') || '44100')
      const float32 = new Float32Array(arrayBuffer)
      audioData = fromRawPCM(float32, sr)
    } else {
      // Assume WAV binary body
      const arrayBuffer = await request.arrayBuffer()
      if (arrayBuffer.byteLength < 44) {
        return jsonError('Request body too small. Send a WAV file or raw PCM data.', 400)
      }
      audioData = decodeWav(arrayBuffer)
    }

    const startTime = performance.now()
    const results = analyzeAudio(audioData.pcm, audioData.sampleRate)
    const elapsed = performance.now() - startTime

    return new Response(JSON.stringify({
      ...results,
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
