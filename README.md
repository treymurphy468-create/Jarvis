# Jarvis (Mark 1)

A desktop AI companion with realtime voice, tool calling, and a visual artifact panel.

## Features

- **Realtime voice** — OpenAI GPT Realtime 2.1 with British `verse` voice, interruptible conversation
- **Animated face** — blinking, moods, speech-synced mouth
- **Artifact panel** — web results, images, mermaid diagrams, notes, tables, code, task progress (expandable fullscreen)
- **Tools** — web search (EXA), image generation, notes, SQLite database, computer control
- **Safety** — confirmation required for risky actions

## Prerequisites

- Node.js 20+
- Windows 10/11 (computer control tools use PowerShell)
- OpenAI API key with Realtime API access
- Optional: EXA API key for web search

## Setup

1. Install dependencies:

```bash
npm install
```

2. Your API key is stored in `.env` (never commit this file):

```
OPENAI_API_KEY=your-key-here
EXA_API_KEY=your-exa-key-here   # optional
PORT=3847
```

3. Start the app:

```bash
npm run dev
```

This launches three processes:
- **Server** on `http://127.0.0.1:3847`
- **Vite dev server** on `http://127.0.0.1:5173`
- **Electron** with two windows (companion + artifacts)

## Launch from the Windows Desktop

The desktop app is a Windows Script Host shortcut (`wscript.exe`), not a folder click. It finds **Jarvis(Mark1)** on your Desktop (including OneDrive Desktop) and starts the OpenAI Realtime build.

Typical locations after you copy or clone the project onto the Desktop:

| What | Path |
| --- | --- |
| Project folder | `%USERPROFILE%\Desktop\Jarvis(Mark1)` |
| OneDrive Desktop | `%USERPROFILE%\OneDrive\Desktop\Jarvis(Mark1)` |
| Desktop app | `%USERPROFILE%\Desktop\Jarvis.lnk` and `Jarvis(Mark1).lnk` |
| Launcher | `%USERPROFILE%\Desktop\Jarvis(Mark1).vbs` → `scripts\Jarvis.bat` → `npm run dev` |
| OpenAI key | `Jarvis(Mark1)\.env` (`OPENAI_API_KEY=...`) |

Create / refresh the Desktop icons from the project folder:

```powershell
npm run desktop-shortcut
```

Then double-click **Jarvis** or **Jarvis(Mark1)**. The shortcut runs `wscript.exe` with `Jarvis(Mark1).vbs`, which searches those Desktop folders for a `package.json` named `jarvis-mark1` and boots OpenAI Jarvis.

Print the resolved paths:

```powershell
npm run find-jarvis
```

If boot fails, open the minimized **Jarvis** console or `logs\jarvis-boot.log`. The most common miss is a missing `.env` with `OPENAI_API_KEY`.

## Usage

1. Click **Start voice** in the companion window (bottom-right)
2. Allow microphone access when prompted
3. Talk naturally — Jarvis responds with voice and can run tools in the background
4. Visual output appears in the **Artifacts** window
5. Click **Fullscreen** on the artifact panel to expand

### Example commands

- "Search the web for the latest on quantum computing"
- "Draw a mermaid flowchart of our deployment pipeline"
- "Take a note: buy milk — use a milk emoji"
- "Generate an image of a minimalist Jarvis interface"
- "What's on my screen?"
- "Open Notepad"

### Risky actions

Jarvis will ask for confirmation before:
- Sending messages
- Deleting data
- Computer control (click, type, scroll)
- Database writes

Say "yes" or click **Confirm** in either window.

## Testing checklist

- [ ] Voice connects (green dot, "Listening" status)
- [ ] Jarvis responds audibly with British tone
- [ ] Interrupt mid-sentence — Jarvis stops and listens
- [ ] Ask for a note — appears in artifact panel
- [ ] Ask for a mermaid diagram — renders in panel
- [ ] Ask for web search — results in panel (needs EXA key)
- [ ] Ask "what's on my screen?" — screenshot + description
- [ ] Fullscreen artifact panel works

## Archived: Ollama test build (local LLM + ElevenLabs)

The experimental Ollama voice build is **archived**. Use OpenAI Realtime (`npm run dev`) as the main Jarvis.

To save or restore the Ollama test build:

```bash
npm run backup:ollama-test
```

Backup locations:
- `backup/jarvis-ollama-test/` in this project
- `logs/ollama-test-backup-*.txt` manifest
- `Downloads/Jarvis-Ollama-Test-Backup-*.zip` on your PC

To run the archived build again: `npm run dev:ollama-test`

---

## Project structure

```
server/          Express API, Realtime proxy, tool handlers
electron/        Desktop shell (companion + artifact windows)
src/             React UI, face animation, hooks
```

## Security note

If you pasted your API key in chat, rotate it at https://platform.openai.com/api-keys and update `.env`.
