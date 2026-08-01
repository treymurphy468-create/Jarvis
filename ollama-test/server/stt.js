import { writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const WHISPER_MODEL = process.env.OLLAMA_WHISPER_MODEL || 'dimavz/whisper-tiny:latest';

function modelBase(name) {
  return (name || '').split(':')[0];
}

function modelMatches(installed, wanted) {
  if (!installed || !wanted) return false;
  if (installed === wanted) return true;
  return modelBase(installed) === modelBase(wanted);
}

function resolveModelName(installedModels, wanted) {
  const exact = installedModels.find((m) => m === wanted);
  if (exact) return exact;
  const base = modelBase(wanted);
  return installedModels.find((m) => modelBase(m) === base) || wanted;
}

export async function checkWhisper() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, model: WHISPER_MODEL };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const resolved = resolveModelName(models, WHISPER_MODEL);
    const ready = models.some((m) => modelMatches(m, WHISPER_MODEL));
    return { ok: ready, model: resolved, configured: WHISPER_MODEL, models };
  } catch {
    return { ok: false, model: WHISPER_MODEL };
  }
}

export async function transcribeAudio(buffer, mimeType = 'audio/webm') {
  const ext = mimeType.includes('wav') ? 'wav' : 'webm';
  const tmpPath = join(tmpdir(), `jarvis-stt-${randomUUID()}.${ext}`);

  const tags = await fetch(`${OLLAMA_URL}/api/tags`).then((r) => r.json()).catch(() => ({ models: [] }));
  const models = (tags.models || []).map((m) => m.name);
  const model = resolveModelName(models, WHISPER_MODEL);

  try {
    writeFileSync(tmpPath, buffer);

    const res = await fetch(`${OLLAMA_URL}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, file: tmpPath }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Whisper transcribe failed (${res.status}): ${err}`);
    }

    const data = await res.json();
    return (data.text || '').trim();
  } finally {
    try { unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
