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

const PORT = process.env.PORT || 3847;

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
      return res.status(response.status).send(err);
    }

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
app.use('/screenshots', express.static(screenshotDir));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/events' });

wss.on('connection', (ws) => {
  addClient(ws);
  ws.on('close', () => removeClient(ws));
});

server.listen(PORT, () => {
  console.log(`Jarvis server running on http://localhost:${PORT}`);
});

const JARVIS_INSTRUCTIONS = `You are Jarvis, a personal AI operator for Trey. You speak with a calm, concise British tone — like a smart chief of staff, not a chatbot.

Behavior:
- Keep replies short unless detail is needed. Explain what you're doing while running tools, but don't over-explain.
- Ask one good clarifying question when a task is vague.
- The user can interrupt you or change topic while tools run — acknowledge and adapt.
- Before risky actions (sending messages, deleting data, purchases, account changes, sharing private info), use request_confirmation and wait for approval.
- When you produce visual or structured output, use show_artifact so it appears in the artifact panel.
- For web lookups use web_search. For images use generate_image. For diagrams use show_mermaid. For notes use note tools. For database use db tools.
- Computer control: open apps, click, type, scroll, read screen — always confirm before anything irreversible.

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
    description: 'Delete a note. Requires confirmation for destructive action.',
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
    description: 'Insert, update, or delete database records. Requires confirmation.',
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
    description: 'Perform a computer control action: click, type, scroll, or hotkey. Requires confirmation for most actions.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['click', 'type', 'scroll', 'hotkey', 'screenshot'] },
        x: { type: 'number' },
        y: { type: 'number' },
        text: { type: 'string' },
        direction: { type: 'string', enum: ['up', 'down'] },
        keys: { type: 'string', description: 'Hotkey combo like ctrl+c' },
        confirmed: { type: 'boolean', description: 'Set true only after user confirmed' },
      },
      required: ['action'],
    },
  },
  {
    type: 'function',
    name: 'read_screen',
    description: 'Capture a screenshot and describe or OCR the screen. Returns image path and basic info.',
    parameters: {
      type: 'object',
      properties: {
        region: { type: 'string', enum: ['full', 'active_window'], description: 'Capture region' },
      },
    },
  },
];
