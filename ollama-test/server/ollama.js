import { executeTool } from './tools/handlers.js';
import { JARVIS_INSTRUCTIONS, OLLAMA_TOOLS, VOICE_ACTION_TOOLS } from './instructions.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:9b';
const OLLAMA_VOICE_MODEL = process.env.OLLAMA_VOICE_MODEL || 'qwen3.5:2b';
const MAX_TOOL_ROUNDS = 12;
const VOICE_TOOL_ROUNDS = 2;
const VOICE_NUM_PREDICT = Number(process.env.OLLAMA_VOICE_NUM_PREDICT || 64);

const VOICE_CHAT_SYSTEM = `You are Jarvis — calm, concise British assistant. Reply in ONE short spoken sentence (two max for math). No markdown. Be accurate with numbers.`;

const VOICE_ACTION_SYSTEM = `You are Jarvis. The user wants an action. Call ONE tool with complete arguments:
open_app(app_name), open_url(url), google_search(query), web_search(query).
Then confirm in one short sentence. Never use tools for math or general questions.`;

const MATH_OR_CHAT_RE = /(?:what(?:'s| is)|how much is|calculate|compute|\d+\s*[+\-*/×÷]\s*\d+)/i;
const ACTION_RE = /\b(open|launch|start|go to|visit|navigate to|search for|google|look up|browse to)\b|https?:\/\/|www\./i;

const sessions = new Map();

export function voiceWantsTools(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (MATH_OR_CHAT_RE.test(t) && !/\b(open|launch|go to|visit|search for|google)\b/i.test(t)) return false;
  return ACTION_RE.test(t);
}

export function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, [{ role: 'system', content: JARVIS_INSTRUCTIONS }]);
  }
  return sessions.get(sessionId);
}

export function clearSession(sessionId) {
  sessions.delete(sessionId);
}

async function ollamaChat(messages, { tools = null, model = OLLAMA_MODEL, numPredict = null, temperature = 0.5 } = {}) {
  const body = {
    model,
    messages,
    stream: false,
    think: false,
    keep_alive: '30m',
    options: {
      num_predict: numPredict ?? VOICE_NUM_PREDICT,
      num_ctx: 2048,
      temperature,
    },
  };
  if (tools?.length) body.tools = tools;

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

export async function warmupVoiceModel() {
  try {
    await ollamaChat(
      [{ role: 'user', content: 'hi' }],
      { model: OLLAMA_VOICE_MODEL, numPredict: 1, temperature: 0 },
    );
    console.log(`Voice model warm: ${OLLAMA_VOICE_MODEL}`);
  } catch (err) {
    console.warn('Voice model warmup failed:', err.message);
  }
}

export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    const hasModel = models.some((m) => m === OLLAMA_MODEL || m.startsWith(`${OLLAMA_MODEL}:`));
    const hasVoiceModel = models.some((m) => m === OLLAMA_VOICE_MODEL || m.startsWith(`${OLLAMA_VOICE_MODEL}:`));
    return {
      ok: true,
      models,
      model: OLLAMA_MODEL,
      voiceModel: OLLAMA_VOICE_MODEL,
      modelReady: hasModel,
      voiceModelReady: hasVoiceModel,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function parseToolArgs(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function validateVoiceToolCall(name, args) {
  switch (name) {
    case 'google_search':
    case 'web_search':
      return typeof args.query === 'string' && args.query.trim().length > 0;
    case 'open_url':
      return typeof args.url === 'string' && args.url.trim().length > 0 && args.url !== 'undefined';
    case 'open_app':
      return typeof args.app_name === 'string' && args.app_name.trim().length > 0;
    default:
      return true;
  }
}

async function runVoiceChatTurn(userText) {
  const messages = [
    { role: 'system', content: VOICE_CHAT_SYSTEM },
    { role: 'user', content: userText },
  ];
  const data = await ollamaChat(messages, {
    model: OLLAMA_VOICE_MODEL,
    numPredict: VOICE_NUM_PREDICT,
    temperature: 0.3,
  });
  const msg = data.message;
  if (!msg) throw new Error('Empty response from Ollama');
  const reply = (msg.content || '').trim() || 'Sorry, I did not catch that.';
  return { reply, toolCallsUsed: false, voiceMode: 'chat' };
}

async function runVoiceActionTurn(userText) {
  const messages = [
    { role: 'system', content: VOICE_ACTION_SYSTEM },
    { role: 'user', content: userText },
  ];

  let rounds = 0;
  while (rounds < VOICE_TOOL_ROUNDS) {
    rounds += 1;
    const data = await ollamaChat(messages, {
      tools: VOICE_ACTION_TOOLS,
      model: OLLAMA_MODEL,
      numPredict: 80,
      temperature: 0.2,
    });
    const msg = data.message;
    if (!msg) throw new Error('Empty response from Ollama');

    const stored = { role: msg.role, content: msg.content || '' };
    if (msg.tool_calls?.length) stored.tool_calls = msg.tool_calls;
    messages.push(stored);

    const toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0) {
      return {
        reply: (msg.content || '').trim() || 'Done.',
        toolCallsUsed: rounds > 1,
        voiceMode: 'action',
      };
    }

    for (const tc of toolCalls) {
      const fn = tc.function || {};
      const name = fn.name;
      const args = parseToolArgs(fn.arguments);

      if (!validateVoiceToolCall(name, args)) {
        messages.push({
          role: 'tool',
          content: JSON.stringify({ error: `Missing required arguments for ${name}` }),
          tool_name: name,
        });
        continue;
      }

      const result = await executeTool(name, args);
      messages.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_name: name,
      });
    }
  }

  return {
    reply: 'Done.',
    toolCallsUsed: true,
    voiceMode: 'action',
  };
}

export async function runAgentTurn(sessionId, userText, { voice = false } = {}) {
  if (voice) {
    const useTools = voiceWantsTools(userText);
    console.log(`Voice: ${useTools ? 'action' : 'chat'} (${useTools ? OLLAMA_MODEL : OLLAMA_VOICE_MODEL}) — "${userText.slice(0, 60)}"`);
    return useTools ? runVoiceActionTurn(userText) : runVoiceChatTurn(userText);
  }

  const messages = getSession(sessionId);
  messages.push({ role: 'user', content: userText });

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds += 1;
    const data = await ollamaChat(messages, {
      tools: OLLAMA_TOOLS,
      model: OLLAMA_MODEL,
      numPredict: 512,
      temperature: 0.7,
    });
    const msg = data.message;
    if (!msg) throw new Error('Empty response from Ollama');

    const stored = { role: msg.role, content: msg.content || '' };
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
      const args = parseToolArgs(fn.arguments);
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
