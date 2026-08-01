const RATE_LIMIT_FLAG_KEY = 'jarvis_voice_limit_code';

export function markVoiceLimited(code) {
  sessionStorage.setItem(RATE_LIMIT_FLAG_KEY, code);
}

export function clearVoiceLimited() {
  sessionStorage.removeItem(RATE_LIMIT_FLAG_KEY);
}

export function getVoiceLimited() {
  return sessionStorage.getItem(RATE_LIMIT_FLAG_KEY);
}

export function getStoredLimitError() {
  const code = getVoiceLimited();
  if (code === 'rate_limit') return formatRateLimit();
  if (code === 'quota') return formatQuota();
  return null;
}

const LIMIT_PATTERNS = [
  /rate[_\s-]?limit/i,
  /rate_limit_exceeded/i,
  /too many requests/i,
  /usage limit/i,
  /session limit/i,
  /maximum number of sessions/i,
  /quota exceeded/i,
  /insufficient_quota/i,
];

function looksLikeLimit(msg, code) {
  if (code === 'rate_limit_exceeded' || code === 'insufficient_quota') return true;
  return LIMIT_PATTERNS.some((re) => re.test(msg));
}

export function parseApiError(raw) {
  if (!raw) return { friendly: 'Connection failed', code: 'unknown', retryable: true };

  let parsed;
  let msg = raw;
  let code = 'unknown';
  try {
    parsed = JSON.parse(raw);
    const err = parsed.error || parsed;
    msg = err.message || parsed.message || raw;
    code = err.code || err.type || parsed.code || 'unknown';
  } catch {
    if (looksLikeLimit(raw, '')) return formatRateLimit();
    if (raw.includes('quota')) return formatQuota();
    return { friendly: raw.slice(0, 180), code: 'unknown', retryable: true };
  }

  if (looksLikeLimit(msg, code)) {
    if (code === 'insufficient_quota' || /quota/i.test(msg)) return formatQuota();
    return formatRateLimit();
  }

  return { friendly: msg.slice(0, 180), code, retryable: true };
}

function formatRateLimit() {
  markVoiceLimited('rate_limit');
  return {
    friendly: 'Voice limit reached',
    code: 'rate_limit',
    retryable: false,
  };
}

function formatQuota() {
  markVoiceLimited('quota');
  return {
    friendly: 'Billing required',
    code: 'quota',
    retryable: false,
    webUrl: 'https://platform.openai.com/account/billing',
    webLabel: 'Open billing settings',
  };
}

export const JARVIS_WEB_URL = 'http://localhost:5173?window=artifact';
export const RATE_LIMITS_URL = 'https://platform.openai.com/account/rate-limits';
