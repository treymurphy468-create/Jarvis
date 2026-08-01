import { pipeline, env } from '@xenova/transformers';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';

const STT_MODEL = process.env.STT_MODEL || 'Xenova/whisper-base.en';

env.useBrowserCache = false;
env.allowLocalModels = true;

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

let transcriberPromise = null;
let sttReady = false;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', STT_MODEL)
      .then((t) => {
        sttReady = true;
        console.log('STT model ready:', STT_MODEL);
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

/** Parse 16-bit PCM WAV to Float32Array for transformers.js in Node */
function loadWavAsFloat32(wavPath) {
  const buf = readFileSync(wavPath);
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const start = offset + 8;
      const numSamples = Math.floor(size / 2);
      const audio = new Float32Array(numSamples);
      for (let i = 0; i < numSamples; i++) {
        audio[i] = buf.readInt16LE(start + i * 2) / 32768;
      }
      return audio;
    }
    offset += 8 + size;
  }
  throw new Error('Invalid WAV file — no data chunk');
}

export async function checkWhisper() {
  try {
    await getTranscriber();
    return { ok: true, engine: 'transformers', model: STT_MODEL, ready: true };
  } catch (err) {
    return { ok: false, engine: 'transformers', model: STT_MODEL, ready: false, error: err.message };
  }
}

getTranscriber().catch((err) => console.warn('STT model preload failed:', err.message));

export async function transcribeAudio(buffer, mimeType = 'audio/webm') {
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const inputPath = join(tmpdir(), `jarvis-stt-in-${randomUUID()}.${ext}`);
  const wavPath = join(tmpdir(), `jarvis-stt-out-${randomUUID()}.wav`);

  try {
    writeFileSync(inputPath, buffer);
    // Always normalize to 16kHz mono — required by Whisper
    await convertToWav(inputPath, wavPath);

    const audio = loadWavAsFloat32(wavPath);
    if (audio.length < 1600) {
      console.log('STT: audio too short', audio.length, 'samples');
      return '';
    }

    const transcriber = await getTranscriber();
    const result = await transcriber(audio, {
      language: 'english',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = (result.text || '').trim();
    console.log('STT:', text || '(empty)');
    return text;
  } finally {
    try { unlinkSync(inputPath); } catch { /* ignore */ }
    try { unlinkSync(wavPath); } catch { /* ignore */ }
  }
}
