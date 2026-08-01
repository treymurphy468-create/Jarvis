import { pipeline, read_audio } from '@xenova/transformers';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

const STT_MODEL = process.env.STT_MODEL || 'Xenova/whisper-tiny.en';

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

let transcriberPromise = null;
let sttReady = false;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', STT_MODEL)
      .then((t) => {
        sttReady = true;
        return t;
      });
  }
  return transcriberPromise;
}

function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format('wav')
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .save(outputPath);
  });
}

export async function checkWhisper() {
  return {
    ok: true,
    engine: 'transformers',
    model: STT_MODEL,
    ready: sttReady,
    note: 'Ollama whisper models cannot transcribe; using local Xenova Whisper',
  };
}

// Warm model in background so first utterance is faster
getTranscriber().catch((err) => console.warn('STT model preload failed:', err.message));

export async function transcribeAudio(buffer, mimeType = 'audio/webm') {
  const ext = mimeType.includes('wav') ? 'wav' : 'webm';
  const inputPath = join(tmpdir(), `jarvis-stt-in-${randomUUID()}.${ext}`);
  const wavPath = join(tmpdir(), `jarvis-stt-out-${randomUUID()}.wav`);

  try {
    writeFileSync(inputPath, buffer);
    const audioPath = ext === 'wav' ? inputPath : wavPath;
    if (ext !== 'wav') await convertToWav(inputPath, wavPath);

    const audio = await read_audio(audioPath, 16000);
    const transcriber = await getTranscriber();
    const result = await transcriber(audio, { language: 'english', task: 'transcribe' });
    return (result.text || '').trim();
  } finally {
    try { unlinkSync(inputPath); } catch { /* ignore */ }
    try { unlinkSync(wavPath); } catch { /* ignore */ }
  }
}
