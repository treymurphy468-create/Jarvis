import { JARVIS_WEB_URL, RATE_LIMITS_URL } from '../utils/parseApiError';

export default function RateLimitPanel({ code }) {
  const webUrl = code === 'quota'
    ? 'https://platform.openai.com/account/billing'
    : JARVIS_WEB_URL;
  const webLabel = code === 'quota' ? 'Open billing settings' : 'Open web panel';

  return (
    <div className="rate-limit-panel">
      <p className="rate-limit-label">{code === 'quota' ? 'Billing required' : 'Voice limit'}</p>
      <p className="rate-limit-hint">
        {code === 'quota'
          ? 'Voice unavailable until billing is configured.'
          : 'Voice will reconnect automatically when ready.'}
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
