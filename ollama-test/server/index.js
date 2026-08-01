import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

import { registerToolRoutes } from './routes/tools.js';
import { initDatabase } from './db.js';
import { addClient, removeClient } from './events.js';
import { runAgentTurn, checkOllama, clearSession } from './ollama.js';
import { synthesizeSpeech, elevenLabsConfigured } from './elevenlabs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', 'screenshots');
if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

const PORT = process.env.PORT || 3848;

await initDatabase();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

registerToolRoutes(app);
app.use('/screenshots', express.static(screenshotDir));

app.get('/api/health', async (_req, res) => {
  const ollama = await checkOllama();
  res.json({
    status: 'ok',
    name: 'jarvis-ollama-test',
    mode: 'ollama+elevenlabs',
    port: PORT,
    ollama,
    elevenlabs: elevenLabsConfigured(),
  });
});

app.post('/api/ollama/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'message required' });
    }

    const result = await runAgentTurn(sessionId, message.trim());
    res.json(result);
  } catch (err) {
    console.error('Ollama chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ollama/reset', (req, res) => {
  const { sessionId = 'default' } = req.body || {};
  clearSession(sessionId);
  res.json({ ok: true });
});

app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body;
    const audio = await synthesizeSpeech(text);
    res.set('Content-Type', 'audio/mpeg');
    res.send(audio);
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err.message });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/events' });

wss.on('connection', (ws) => {
  addClient(ws);
  ws.on('close', () => removeClient(ws));
});

server.listen(PORT, async () => {
  const ollama = await checkOllama();
  console.log(`Jarvis Ollama test server on http://localhost:${PORT}`);
  if (!ollama.ok) {
    console.warn('⚠ Ollama not reachable — start it with: ollama serve');
  } else if (!ollama.modelReady) {
    console.warn(`⚠ Model "${ollama.model}" not found — run: ollama pull ${ollama.model}`);
  }
  if (!elevenLabsConfigured()) {
    console.warn('⚠ ElevenLabs not configured — add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to .env');
  }
});
