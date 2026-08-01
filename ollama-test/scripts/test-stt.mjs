import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { transcribeAudio } from '../server/stt.js';

const tmp = tmpdir();
const wavPath = join(tmp, 'jarvis-stt-test.wav');
const webmPath = join(tmp, 'jarvis-stt-test.webm');
const phrase = 'Hello Jarvis, how are you today?';

function cleanup() {
  for (const p of [wavPath, webmPath]) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
}

try {
  // Windows SAPI speech -> WAV, then ffmpeg -> WEBM (same path browser MediaRecorder uses)
  execSync(
    `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wavPath.replace(/'/g, "''")}'); $s.Speak('${phrase.replace(/'/g, "''")}'); $s.Dispose()"`,
    { stdio: 'pipe' }
  );

  if (!existsSync(wavPath)) throw new Error('SAPI did not create WAV file');

  execSync(
    `ffmpeg -y -i "${wavPath}" -c:a libopus "${webmPath}"`,
    { stdio: 'pipe' }
  );

  const webmBuf = readFileSync(webmPath);
  console.log('WEBM test:', webmBuf.length, 'bytes');
  const webmText = await transcribeAudio(webmBuf, 'audio/webm');
  console.log('WEBM transcript:', JSON.stringify(webmText));

  const wavBuf = readFileSync(wavPath);
  console.log('WAV test:', wavBuf.length, 'bytes');
  const wavText = await transcribeAudio(wavBuf, 'audio/wav');
  console.log('WAV transcript:', JSON.stringify(wavText));

  const ok = Boolean(webmText.trim() && wavText.trim());
  if (!ok) {
    console.error('STT test failed — empty transcript');
    process.exit(1);
  }
  console.log('STT test passed');
} catch (err) {
  console.error('STT test failed:', err.message);
  process.exit(1);
} finally {
  cleanup();
}
