export function parseWaitSeconds(waitStr) {
  if (!waitStr) return null;
  let total = 0;
  const h = waitStr.match(/(\d+)\s*h/i);
  const m = waitStr.match(/(\d+)\s*m/i);
  const s = waitStr.match(/(\d+)\s*s/i);
  if (h) total += parseInt(h[1], 10) * 3600;
  if (m) total += parseInt(m[1], 10) * 60;
  if (s) total += parseInt(s[1], 10);
  return total > 0 ? total : null;
}

export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const RATE_LIMIT_KEY = 'jarvis_rate_limit_until';

export function storeRateLimitUntil(retryAt) {
  if (retryAt) sessionStorage.setItem(RATE_LIMIT_KEY, String(retryAt));
}

export function getStoredRateLimitUntil() {
  const v = sessionStorage.getItem(RATE_LIMIT_KEY);
  return v ? parseInt(v, 10) : null;
}

export function clearRateLimitUntil() {
  sessionStorage.removeItem(RATE_LIMIT_KEY);
}

export function parseApiError(raw) {
  if (!raw) return { friendly: 'Connection failed', code: 'unknown', retryable: true };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (raw.includes('Rate limit') || raw.includes('rate_limit')) {
      return formatRateLimit(raw);
    }
    if (raw.includes('quota') || raw.includes('insufficient_quota')) {
      return formatQuota();
    }
    return { friendly: raw.slice(0, 180), code: 'unknown', retryable: true };
  }

  const err = parsed.error || parsed;
  const msg = err.message || raw;
  const code = err.code || err.type || 'unknown';

  if (code === 'rate_limit_exceeded' || msg.includes('Rate limit')) {
    return formatRateLimit(msg);
  }
  if (code === 'insufficient_quota' || msg.includes('quota')) {
    return formatQuota();
  }

  return { friendly: msg.slice(0, 180), code, retryable: true };
}

function formatRateLimit(msg) {
  const waitStr = msg.match(/try again in ([^.]+)/i)?.[1]?.trim();
  const seconds = parseWaitSeconds(waitStr);
  const retryAt = seconds ? Date.now() + seconds * 1000 : null;
  if (retryAt) storeRateLimitUntil(retryAt);

  return {
    friendly: 'Voice limit reached',
    code: 'rate_limit',
    retryable: false,
    retryAt,
    retrySeconds: seconds,
  };
}

function formatQuota() {
  return {
    friendly: 'Billing required',
    code: 'quota',
    retryable: false,
    retryAt: null,
    webUrl: 'https://platform.openai.com/account/billing',
    webLabel: 'Open billing settings',
  };
}

export const JARVIS_WEB_URL = 'http://localhost:5173?window=artifact';
export const RATE_LIMITS_URL = 'https://platform.openai.com/account/rate-limits';
