/**
 * GET /api/health
 * Health check + API capability discovery
 */
export function GET() {
  return new Response(JSON.stringify({
    status: 'ok',
    version: '1.1.1',
    engine: 'pleco-xa',
    endpoints: {
      'POST /api/analyze': 'Full audio analysis (BPM, beats, onsets, features). Send WAV as binary body or multipart form.',
      'POST /api/bpm': 'BPM detection only. Lightweight and fast.',
      'POST /api/loops': 'Beat-aligned loop suggestions.',
      'POST /api/features': 'Extract specific audio features (zcr, rms, chroma, onsets).',
      'POST /api/live/stream': 'SSE-based live inference. Stream audio chunks, get real-time analysis.',
      'GET /api/health': 'This endpoint.',
    },
    formats: {
      supported: ['audio/wav', 'audio/wave', 'application/octet-stream'],
      note: 'Send WAV files directly as request body (Content-Type: audio/wav) or as multipart form-data with field name "audio". Raw PCM Float32 also accepted with Content-Type: application/octet-stream and query params ?sr=44100&channels=1',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}
