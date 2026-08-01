import { executeTool } from './tools/handlers.js';
import { JARVIS_INSTRUCTIONS, OLLAMA_TOOLS } from './instructions.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const MAX_TOOL_ROUNDS = 12;
const VOICE_NUM_PREDICT = Number(process.env.OLLAMA_VOICE_NUM_PREDICT || 180);

const VOICE_SUFFIX = `

VOICE MODE (active): Answer directly in one or two short spoken sentences.
- For questions, math, facts, or chat: reply immediately — do NOT call tools.
- Only use tools when the user explicitly asks you to DO something (open an app, search the web, change files, etc.).
- Show your reasoning briefly; be accurate with numbers and calculations.`;

const sessions = new Map();

export function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, [
      { role: 'system', content: JARVIS_INSTRUCTIONS },
    ]);
  }
  return sessions.get(sessionId);
}

export function clearSession(sessionId) {
  sessions.delete(sessionId);
}

async function ollamaChat(messages, { voice = false } = {}) {
  const body = {
    model: OLLAMA_MODEL,
    messages,
    stream: false,
    think: false,
  };
  if (voice) {
    // Voice = plain chat only. Tools caused bad calls (e.g. google_search with undefined query).
    body.options = { num_predict: VOICE_NUM_PREDICT, temperature: 0.5 };
  } else {
    body.tools = OLLAMA_TOOLS;
  }

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama error (${res.status}): ${err}`);
  }

  return res.json();
}

export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const hasModel = models.some((m) => m === OLLAMA_MODEL || m.startsWith(`${OLLAMA_MODEL}:`));
    return { ok: true, models, model: OLLAMA_MODEL, modelReady: hasModel };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function ensureVoiceInstructions(messages, voice) {
  if (!voice) return messages;
  const sys = messages.find((m) => m.role === 'system');
  if (sys && !sys.content.includes('VOICE MODE (active)')) {
    sys.content += VOICE_SUFFIX;
  }
  return messages;
}

export async function runAgentTurn(sessionId, userText, { voice = false } = {}) {
  const messages = getSession(sessionId);
  ensureVoiceInstructions(messages, voice);
  messages.push({ role: 'user', content: userText });

  if (voice) {
    const data = await ollamaChat(messages, { voice: true });
    const msg = data.message;
    if (!msg) throw new Error('Empty response from Ollama');
    const reply = (msg.content || '').trim() || 'Sorry, I did not catch that.';
    messages.push({ role: 'assistant', content: reply });
    return { reply, toolCallsUsed: false, messages: messages.length };
  }

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds += 1;
    const data = await ollamaChat(messages, { voice: false });
    const msg = data.message;
    if (!msg) throw new Error('Empty response from Ollama');

    const stored = {
      role: msg.role,
      content: msg.content || '',
    };
    if (msg.tool_calls?.length) stored.tool_calls = msg.tool_calls;
    messages.push(stored);

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        reply: (msg.content || '').trim(),
        toolCallsUsed: rounds > 1,
        messages: messages.length,
      };
    }

    for (const tc of toolCalls) {
      const fn = tc.function || {};
      const name = fn.name;
      let args = {};
      try {
        args = JSON.parse(fn.arguments || '{}');
      } catch { /* empty args */ }

      const result = await executeTool(name, args);
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_name: name,
      });
    }
  }

  return {
    reply: 'I ran quite a few tools — shall I continue, or would you like a summary?',
    toolCallsUsed: true,
    messages: messages.length,
  };
}
