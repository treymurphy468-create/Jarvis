# Jarvis Ollama Test Build

Experimental copy of Jarvis that uses **Ollama** (local LLM) + **ElevenLabs** (TTS) instead of OpenAI Realtime.

Runs on separate ports so it won't conflict with the main Realtime Jarvis:
- Server: **3848**
- Vite: **5174**

## Prerequisites

1. **Ollama** installed and running:
   ```powershell
   ollama serve
   ollama pull qwen3.5:9b
   # or set OLLAMA_MODEL in .env to any model you have
   ```

2. **ElevenLabs** API key and voice ID from [elevenlabs.io](https://elevenlabs.io)

3. Copy `.env.example` to `.env` and fill in keys

## Quick start

From the **main project root**:

```powershell
npm run dev:ollama-test
```

Or from this folder:

```powershell
npm install
npm run dev
```

Say **"run ollama test"** to Trey's agent and it will launch this build.

## How it works

| Step | Component |
|------|-----------|
| Speech in | Browser Web Speech API (mic) |
| Brain | Ollama chat API with tool calling |
| Tools | Same Jarvis tools (files, browser, notes, etc.) |
| Speech out | ElevenLabs TTS |

## Optional keys

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | DALL-E images + screen vision (optional) |
| `EXA_API_KEY` | Inline web search (optional) |

## Switch back to Realtime

Run the main Jarvis from the project root:

```powershell
npm run dev
```

The frozen Realtime backup lives in `backup/jarvis-mark1-realtime/`.
