/**
 * POST /api/live/stream
 * Server-Sent Events (SSE) based live inference endpoint
 *
 * The killer feature: stream audio data and get real-time analysis back.
 *
 * Usage:
 *   1. POST audio chunks as binary body (raw PCM Float32, application/octet-stream)
 *      Query params: ?sr=44100&chunk_size=4096
 *
 *   2. For continuous streaming, POST the full audio and receive chunked analysis:
 *      The server splits audio into chunks and streams back analysis results via SSE
 *
 *   3. For agent integration, POST a WAV file and get streaming analysis results
 *      as they're computed (BPM refines over time, onsets detected per-chunk)
 *
 * Response: text/event-stream with JSON data events
 */
import { decodeWav, fromRawPCM, analyzeLiveChunk, detectBPM } from '../../../lib/audio-engine.js'

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
      const arrayBuffer = await request.arrayBuffer()
      if (arrayBuffer.byteLength < 44) {
        return jsonError('Request body too small', 400)
      }
      audioData = decodeWav(arrayBuffer)
    }

    const sr = audioData.sampleRate
    const pcm = audioData.pcm
    const chunkSizeSec = parseFloat(url.searchParams?.get('chunk_seconds') || '2')
    const chunkSamples = Math.floor(chunkSizeSec * sr)

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        // Send initial metadata event
        controller.enqueue(encoder.encode(sseEvent('metadata', {
          sample_rate: sr,
          duration: pcm.length / sr,
          num_samples: pcm.length,
          chunk_seconds: chunkSizeSec,
          total_chunks: Math.ceil(pcm.length / chunkSamples),
        })))

        // Process chunks
        let chunkIndex = 0
        const totalChunks = Math.ceil(pcm.length / chunkSamples)
        let allOnsets = []
        let runningBPM = null

        for (let offset = 0; offset < pcm.length; offset += chunkSamples) {
          const end = Math.min(offset + chunkSamples, pcm.length)
          const chunk = pcm.slice(offset, end)

          const chunkResult = analyzeLiveChunk(chunk, sr, chunkIndex)

          // Accumulate onsets (adjust timestamps to global position)
          const globalOffset = offset / sr
          const globalOnsets = (chunkResult.onsets || []).map(t => t + globalOffset)
          allOnsets = allOnsets.concat(globalOnsets)

          // Update running BPM if this chunk produced one
          if (chunkResult.bpm_estimate) {
            runningBPM = chunkResult.bpm_estimate
          }

          controller.enqueue(encoder.encode(sseEvent('chunk', {
            ...chunkResult,
            global_time_offset: globalOffset,
            onsets_global: globalOnsets,
            running_bpm: runningBPM,
            progress: (chunkIndex + 1) / totalChunks,
          })))

          chunkIndex++
        }

        // Final consolidated result
        let finalBPM = runningBPM
        try {
          // Do a full BPM pass on complete audio for best accuracy
          const fullBPM = detectBPM(pcm, sr)
          finalBPM = fullBPM.bpm
        } catch (_e) { /* use running estimate */ }

        controller.enqueue(encoder.encode(sseEvent('complete', {
          final_bpm: finalBPM,
          total_onsets: allOnsets.length,
          onset_times: allOnsets.slice(0, 500),
          duration: pcm.length / sr,
        })))

        controller.enqueue(encoder.encode(sseEvent('done', {})))
        controller.close()
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        ...CORS,
      },
    })
  } catch (error) {
    return jsonError(error.message, 500)
  }
}

function sseEvent(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}
