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
      .audioCodec('pcm_s16le')
      .format('wav')
      .outputOptions(['-threads', '1'])
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

/** Whisper often hallucinates these on silence or noise */
const HALLUCINATION_RE = [
  /subscribe to (the )?channel/i,
  /thanks? for watching/i,
  /please subscribe/i,
  /like and subscribe/i,
  /for more videos/i,
  /^\[?(music|applause|silence|blank_audio)\]?\.?$/i,
];

function isLikelyHallucination(text, sampleCount) {
  if (!text) return false;
  if (HALLUCINATION_RE.some((re) => re.test(text))) return true;
  const durationSec = sampleCount / 16000;
  if (durationSec < 1.5 && text.length > 35) return true;
  if (durationSec < 3 && text.length > 70) return true;
  return false;
}

export async function transcribeAudio(buffer, mimeType = 'audio/webm') {
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const inputPath = join(tmpdir(), `jarvis-stt-in-${randomUUID()}.${ext}`);
  const wavPath = join(tmpdir(), `jarvis-stt-out-${randomUUID()}.wav`);

  try {
    writeFileSync(inputPath, buffer);
    // Always normalize to 16kHz mono — required by Whisper
    await convertToWav(inputPath, wavPath);

    const audio = loadWavAsFloat32(wavPath);
    if (audio.length < 2400) {
      console.log('STT: audio too short', audio.length, 'samples');
      return '';
    }

    const transcriber = await getTranscriber();
    const durationSec = audio.length / 16000;
    const opts = { language: 'english', task: 'transcribe' };
    // Chunking only helps long clips; it slows short voice utterances
    if (durationSec > 25) {
      opts.chunk_length_s = 30;
      opts.stride_length_s = 5;
    }

    const result = await transcriber(audio, opts);
    const text = (result.text || '').trim();
    if (!text) {
      console.log('STT: (no speech detected)');
      return '';
    }
    if (isLikelyHallucination(text, audio.length)) {
      console.log('STT: rejected hallucination:', text);
      return '';
    }
    console.log('STT:', text);
    return text;
  } finally {
    try { unlinkSync(inputPath); } catch { /* ignore */ }
    try { unlinkSync(wavPath); } catch { /* ignore */ }
  }
}
