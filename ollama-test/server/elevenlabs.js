const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1';

export function elevenLabsConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);
}

export async function synthesizeSpeech(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

  if (!apiKey || !voiceId) {
    throw new Error('Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID in .env');
  }

  const trimmed = (text || '').trim();
  if (!trimmed) {
    throw new Error('No text to speak');
  }

  const res = await fetch(`${ELEVENLABS_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: trimmed,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs error (${res.status}): ${err}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}
