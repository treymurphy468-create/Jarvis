export function parseApiError(raw) {
  if (!raw) return { friendly: 'Connection failed', code: 'unknown', retryable: true };

  let parsed;
  let msg = raw;
  try {
    parsed = JSON.parse(raw);
    msg = parsed.error?.message || parsed.message || raw;
  } catch {
    if (raw.includes('Rate limit') || raw.includes('rate_limit')) {
      return formatRateLimit();
    }
    if (raw.includes('quota') || raw.includes('insufficient_quota')) {
      return formatQuota();
    }
    return { friendly: raw.slice(0, 180), code: 'unknown', retryable: true };
  }

  const err = parsed.error || parsed;
  msg = err.message || raw;
  const code = err.code || err.type || 'unknown';

  if (code === 'rate_limit_exceeded' || msg.includes('Rate limit')) {
    return formatRateLimit();
  }
  if (code === 'insufficient_quota' || msg.includes('quota')) {
    return formatQuota();
  }

  return { friendly: msg.slice(0, 180), code, retryable: true };
}

function formatRateLimit() {
  return {
    friendly: 'Voice limit reached',
    code: 'rate_limit',
    retryable: false,
  };
}

function formatQuota() {
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
