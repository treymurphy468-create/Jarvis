const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

function normalizeMathText(text) {
  let t = (text || '').toLowerCase();
  t = t.replace(/\bwhat(?:'s| is)\b/g, ' ');
  t = t.replace(/\bhow much is\b/g, ' ');
  t = t.replace(/\b(calculate|compute|evaluate|solve)\b/g, ' ');
  t = t.replace(/\bmultiplied by\b/g, '*');
  t = t.replace(/\bdivided by\b/g, '/');
  t = t.replace(/\bplus\b/g, '+');
  t = t.replace(/\bminus\b/g, '-');
  t = t.replace(/\btimes\b/g, '*');
  t = t.replace(/\bover\b/g, '/');
  t = t.replace(/×/g, '*').replace(/÷/g, '/');

  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    t = t.replace(new RegExp(`\\b${word}\\b`, 'g'), String(num));
  }

  return t.replace(/\s+/g, ' ').trim();
}

function safeEvalArithmetic(expr) {
  const cleaned = expr.replace(/\s/g, '');
  if (!/^[\d+\-*/().]+$/.test(cleaned)) return null;
  if (cleaned.length > 40) return null;
  try {
    const result = Function(`"use strict"; return (${cleaned})`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

function formatMathResult(n) {
  const rounded = Math.round(n * 1e10) / 1e10;
  const str = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `That's ${str}.`;
}

/** Instant local answer for arithmetic — no LLM needed */
export function tryLocalMathAnswer(text) {
  const normalized = normalizeMathText(text);
  const exprMatch = normalized.match(/([\d+\-*/().\s]+)/);
  if (!exprMatch) return null;

  const expr = exprMatch[1].replace(/[^\d+\-*/().\s]/g, '').trim();
  if (!/[\d]/.test(expr) || !/[+\-*/]/.test(expr)) return null;

  const result = safeEvalArithmetic(expr);
  if (result === null) return null;

  return formatMathResult(result);
}

export function voiceNeedsSmartModel(text) {
  const t = (text || '').trim();
  if (!t || tryLocalMathAnswer(t)) return false;
  if (t.length > 90) return true;
  return /\b(why|explain|how does|compare|difference|reason|because|analyze|describe)\b/i.test(t);
}
