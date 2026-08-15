import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, '..', 'screenshots');
if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

import { registerToolRoutes } from './routes/tools.js';
import { initDatabase } from './db.js';
import { addClient, removeClient } from './events.js';
import { updateRateLimits, recordSessionConnect, recordSessionEnd, getUsageSnapshot, getCreditsSnapshot, trackVoiceUsage, setManualCreditBalance, startQuietCreditSync } from './usage.js';

const PORT = Number(process.env.PORT || 3847);
const HOST = process.env.HOST || '127.0.0.1';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in .env');
  process.exit(1);
}

await initDatabase();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/realtime/session', express.text({ type: ['application/sdp', 'text/plain'] }));

// WebRTC unified interface — browser POSTs SDP, server forwards to OpenAI
app.post('/api/realtime/session', async (req, res) => {
  try {
    const sessionConfig = JSON.stringify({
      type: 'realtime',
      model: 'gpt-realtime-2.1',
      instructions: JARVIS_INSTRUCTIONS,
      audio: {
        input: { turn_detection: { type: 'server_vad', interrupt_response: true } },
        output: { voice: 'verse' },
      },
      tools: TOOL_DEFINITIONS,
      tool_choice: 'auto',
    });

    const fd = new FormData();
    fd.set('sdp', req.body);
    fd.set('session', sessionConfig);

    const response = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: fd,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Realtime call failed:', err);
      updateRateLimits(response.headers);
      const retryAfter = response.headers.get('retry-after');
      const resetReq = response.headers.get('x-ratelimit-reset-requests');
      const resetTokens = response.headers.get('x-ratelimit-reset-tokens');
      if (retryAfter) res.setHeader('Retry-After', retryAfter);
      if (resetReq) res.setHeader('X-RateLimit-Reset-Requests', resetReq);
      if (resetTokens) res.setHeader('X-RateLimit-Reset-Tokens', resetTokens);
      return res.status(response.status).send(err);
    }

    updateRateLimits(response.headers);
    recordSessionConnect();
    res.send(await response.text());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Realtime session error' });
  }
});

// Ephemeral client secret for Realtime WebRTC
app.post('/api/session', async (_req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime-2.1',
          instructions: JARVIS_INSTRUCTIONS,
          audio: {
            input: { turn_detection: { type: 'server_vad' } },
            output: { voice: 'verse' },
          },
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Session creation failed:', err);
      return res.status(response.status).json({ error: 'Failed to create session' });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Session error' });
  }
});

registerToolRoutes(app);

app.get('/api/usage', async (_req, res) => {
  try {
    res.json(await getUsageSnapshot());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Usage unavailable' });
  }
});

app.get('/api/usage/credits', async (req, res) => {
  try {
    const force = req.query.sync === '1';
    res.json(await getCreditsSnapshot(force));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Credits unavailable' });
  }
});

app.post('/api/usage/credits/balance', (req, res) => {
  try {
    const balance = Number(req.body?.balance);
    if (!Number.isFinite(balance) || balance < 0) {
      return res.status(400).json({ error: 'Invalid balance' });
    }
    res.json(setManualCreditBalance(balance));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Balance sync failed' });
  }
});

app.post('/api/usage/track', (req, res) => {
  try {
    const result = trackVoiceUsage(req.body?.usage);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Track failed' });
  }
});

app.post('/api/usage/session-end', (_req, res) => {
  recordSessionEnd();
  res.json({ ok: true });
});

app.use('/screenshots', express.static(screenshotDir));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/events' });

wss.on('connection', (ws) => {
  addClient(ws);
  ws.on('close', () => removeClient(ws));
});

server.listen(PORT, HOST, () => {
  console.log(`Jarvis server running on http://${HOST}:${PORT}`);
  startQuietCreditSync();
});

const JARVIS_INSTRUCTIONS = `You are Jarvis, a personal AI operator for Trey. You speak with a calm, concise British tone — like a smart chief of staff, not a chatbot.

You have FULL ACCESS to help Trey. Act autonomously — do not ask permission for normal tasks. Just do the work.

Capabilities:
- Files: read, write, move, copy, delete, list, search anywhere on the machine (use ~ for home folder)
- Browser: open_url for any link, google_search to search Google in the default browser
- Web: web_search for EXA results (falls back to Google)
- Appearance: set_appearance to change colors, accent, face color, title
- Windows: window_control to move/resize companion or artifact windows, toggle always-on-top
- Computer: open apps, click, type, scroll, hotkeys, read screen — execute immediately
- Notes, database, images, mermaid diagrams, artifacts panel

Behavior:
- Keep replies short. Explain briefly while running tools.
- Ask one clarifying question only when the task is genuinely ambiguous.
- User can interrupt anytime — adapt immediately.
- Only use request_confirmation for: sending messages to others, purchases, changing account passwords, or sharing private data externally.
- When output is visual or structured, use show_artifact or the relevant tool so it appears in the artifact panel.
- For "search google" or "look this up", use google_search OR web_search — never both, and only one browser tool per request.
- For opening a specific URL, use open_url only (do not also call google_search).
- For "change your colors" or "make yourself blue", use set_appearance.
- For file tasks, use file_* tools with full paths or ~ paths.

Personality: useful, calm, slightly dry wit. Never sycophantic.`;

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    name: 'web_search',
    description: 'Search the web via EXA for current information.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        num_results: { type: 'number', description: 'Number of results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'generate_image',
    description: 'Generate an image with DALL-E and show it in the artifact panel.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image description' },
        size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'] },
      },
      required: ['prompt'],
    },
  },
  {
    type: 'function',
    name: 'show_mermaid',
    description: 'Render a mermaid diagram in the artifact panel.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        code: { type: 'string', description: 'Valid mermaid syntax' },
      },
      required: ['code'],
    },
  },
  {
    type: 'function',
    name: 'show_artifact',
    description: 'Display structured content in the artifact panel (code, table, notes, menu, task progress).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['code', 'table', 'note', 'menu', 'task_progress', 'text', 'markdown'] },
        title: { type: 'string' },
        content: { type: 'string', description: 'JSON string for tables, plain text otherwise' },
        language: { type: 'string', description: 'For code artifacts' },
      },
      required: ['type', 'title', 'content'],
    },
  },
  {
    type: 'function',
    name: 'note_create',
    description: 'Create a note in the fun notes list.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        emoji: { type: 'string', description: 'Optional emoji prefix' },
      },
      required: ['title', 'body'],
    },
  },
  {
    type: 'function',
    name: 'note_search',
    description: 'Search notes by keyword.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'note_edit',
    description: 'Edit an existing note by id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        title: { type: 'string' },
        body: { type: 'string' },
        emoji: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    type: 'function',
    name: 'note_delete',
    description: 'Delete a note by id.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
  {
    type: 'function',
    name: 'db_query',
    description: 'Run a read-only SQL SELECT on the local Jarvis database.',
    parameters: {
      type: 'object',
      properties: { sql: { type: 'string' } },
      required: ['sql'],
    },
  },
  {
    type: 'function',
    name: 'db_execute',
    description: 'Insert, update, or delete database records.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        description: { type: 'string', description: 'Human-readable description of the change' },
      },
      required: ['sql', 'description'],
    },
  },
  {
    type: 'function',
    name: 'request_confirmation',
    description: 'Ask the user to confirm a risky action before proceeding.',
    parameters: {
      type: 'object',
      properties: {
        action_id: { type: 'string', description: 'Unique id for this pending action' },
        message: { type: 'string', description: 'What you need confirmed' },
        action_type: { type: 'string', enum: ['send_message', 'delete_data', 'purchase', 'account_change', 'share_private', 'computer_control', 'other'] },
      },
      required: ['action_id', 'message', 'action_type'],
    },
  },
  {
    type: 'function',
    name: 'open_app',
    description: 'Open an application on the computer.',
    parameters: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App name or path' },
      },
      required: ['app_name'],
    },
  },
  {
    type: 'function',
    name: 'computer_action',
    description: 'Perform computer control: click, type, scroll, hotkey, or screenshot. Executes immediately.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['click', 'type', 'scroll', 'hotkey', 'screenshot'] },
        x: { type: 'number' },
        y: { type: 'number' },
        text: { type: 'string' },
        direction: { type: 'string', enum: ['up', 'down'] },
        keys: { type: 'string', description: 'Hotkey combo like ctrl+c' },
      },
      required: ['action'],
    },
  },
  {
    type: 'function',
    name: 'read_screen',
    description: 'Capture a screenshot and describe the screen.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', enum: ['full', 'active_window'] },
      },
    },
  },
  {
    type: 'function',
    name: 'open_url',
    description: 'Open any URL in the default browser.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    type: 'function',
    name: 'google_search',
    description: 'Search Google in the default browser.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'file_read',
    description: 'Read a file from disk. Use ~ for home directory.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        max_chars: { type: 'number' },
      },
      required: ['path'],
    },
  },
  {
    type: 'function',
    name: 'file_write',
    description: 'Write or append to a file. Creates parent folders if needed.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
        append: { type: 'boolean' },
      },
      required: ['path', 'content'],
    },
  },
  {
    type: 'function',
    name: 'file_move',
    description: 'Move or rename a file or folder.',
    parameters: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    type: 'function',
    name: 'file_copy',
    description: 'Copy a file.',
    parameters: {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
    },
  },
  {
    type: 'function',
    name: 'file_delete',
    description: 'Delete a file permanently.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    type: 'function',
    name: 'file_list',
    description: 'List files in a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path, default ~' },
        recursive: { type: 'boolean' },
        max_entries: { type: 'number' },
      },
    },
  },
  {
    type: 'function',
    name: 'file_search',
    description: 'Search for files by name in a directory tree.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        query: { type: 'string' },
        max_results: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'set_appearance',
    description: 'Change Jarvis UI appearance: colors, accent, face color, window title.',
    parameters: {
      type: 'object',
      properties: {
        accentColor: { type: 'string', description: 'Hex color e.g. #4ecdc4' },
        backgroundColor: { type: 'string' },
        textColor: { type: 'string' },
        faceColor: { type: 'string' },
        title: { type: 'string', description: 'Companion window title' },
      },
    },
  },
  {
    type: 'function',
    name: 'window_control',
    description: 'Move or resize Jarvis windows.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['companion', 'artifact', 'both'] },
        action: { type: 'string', enum: ['move', 'resize', 'always_on_top', 'focus', 'show', 'hide'] },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        alwaysOnTop: { type: 'boolean' },
      },
      required: ['target', 'action'],
    },
  },
];
