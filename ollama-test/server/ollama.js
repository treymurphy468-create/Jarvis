import { executeTool } from './tools/handlers.js';
import { JARVIS_INSTRUCTIONS, OLLAMA_TOOLS } from './instructions.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const MAX_TOOL_ROUNDS = 12;

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

async function ollamaChat(messages) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools: OLLAMA_TOOLS,
      stream: false,
    }),
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

export async function runAgentTurn(sessionId, userText) {
  const messages = getSession(sessionId);
  messages.push({ role: 'user', content: userText });

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds += 1;
    const data = await ollamaChat(messages);
    const msg = data.message;
    if (!msg) throw new Error('Empty response from Ollama');

    messages.push(msg);

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        reply: msg.content || '',
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
      });
    }
  }

  return {
    reply: 'I ran quite a few tools — shall I continue, or would you like a summary?',
    toolCallsUsed: true,
    messages: messages.length,
  };
}
