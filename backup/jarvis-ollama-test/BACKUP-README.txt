Jarvis Mark 1 — Ollama + ElevenLabs + local Whisper test build
Created: 2026-08-01 14:03
Branch snapshot: cursor/jarvis-desktop-companion (local Whisper voice pipeline)

Restore:
  1. Copy this folder to <project>/ollama-test
  2. Copy .env.example to .env and add API keys
  3. cd ollama-test && npm install && npm run dev
  Or from project root: npm run dev:ollama-test

Requires: Ollama (qwen3.5:2b + 9b), ElevenLabs API key, local Whisper via @xenova/transformers
Ports: 3848 (server), 5174 (vite)
