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

const NETWORK_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network error/i,
  /econnrefused/i,
  /enotfound/i,
  /etimedout/i,
  /err_connection/i,
  /err_address_unreachable/i,
  /err_internet_disconnected/i,
  /err_name_not_resolved/i,
  /err_network_changed/i,
];

function formatOffline() {
  return {
    friendly: 'Cannot reach Jarvis or OpenAI on this network. Check internet and press Start voice.',
    code: 'offline',
    retryable: true,
  };
}

function looksLikeNetwork(msg) {
  return NETWORK_PATTERNS.some((re) => re.test(msg));
}

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
    if (looksLikeNetwork(raw)) return formatOffline();
    return { friendly: raw.slice(0, 180), code: 'unknown', retryable: true };
  }

  if (looksLikeLimit(msg, code)) {
    if (code === 'insufficient_quota' || /quota/i.test(msg)) return formatQuota();
    return formatRateLimit();
  }

  if (looksLikeNetwork(msg)) return formatOffline();

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

export const JARVIS_WEB_URL = 'http://127.0.0.1:5173?window=artifact';
export const RATE_LIMITS_URL = 'https://platform.openai.com/account/rate-limits';
