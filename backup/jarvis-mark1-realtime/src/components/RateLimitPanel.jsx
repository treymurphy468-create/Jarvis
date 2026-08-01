import { useEffect, useState } from 'react';
import { formatCountdown, getStoredRateLimitUntil, clearRateLimitUntil, JARVIS_WEB_URL, RATE_LIMITS_URL } from '../utils/parseApiError';

export default function RateLimitPanel({ retryAt, code, onExpired }) {
  const hasTimer = code === 'rate_limit' && (retryAt || getStoredRateLimitUntil());
  const [remaining, setRemaining] = useState(() => {
    if (!hasTimer) return 0;
    const until = retryAt || getStoredRateLimitUntil();
    return until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0;
  });

  useEffect(() => {
    if (!hasTimer) return;
    const until = retryAt || getStoredRateLimitUntil();
    if (!until) return;

    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearRateLimitUntil();
        onExpired?.();
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [retryAt, hasTimer, onExpired]);

  const expired = !hasTimer || remaining <= 0;
  const webUrl = code === 'quota'
    ? 'https://platform.openai.com/account/billing'
    : JARVIS_WEB_URL;
  const webLabel = code === 'quota' ? 'Open billing settings' : 'Open web panel';

  return (
    <div className="rate-limit-panel">
      <p className="rate-limit-label">{code === 'quota' ? 'Billing required' : 'Voice limit'}</p>
      {hasTimer && (
        <p className="rate-limit-counter">{expired ? 'Ready' : formatCountdown(remaining)}</p>
      )}
      <p className="rate-limit-hint">
        {hasTimer
          ? (expired ? 'You can retry voice now.' : 'Voice returns when the timer hits zero.')
          : 'Voice unavailable until billing is configured.'}
      </p>
      <a className="rate-limit-link" href={webUrl} target="_blank" rel="noreferrer">
        {webLabel}
      </a>
      {code === 'rate_limit' && (
        <a className="rate-limit-link subtle" href={RATE_LIMITS_URL} target="_blank" rel="noreferrer">
          View limits on OpenAI
        </a>
      )}
    </div>
  );
}
