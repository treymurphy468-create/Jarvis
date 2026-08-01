import { useEffect, useState } from 'react';

function formatUsd(value) {
  if (value == null) return '$0.00';
  return `$${Math.max(0, value).toFixed(2)}`;
}

function formatDetail(meter, variant) {
  if (!meter) return '—';
  if (variant === 'credits' || meter.unit === 'balance') {
    const max = meter.max ?? 500;
    return `$0 – $${max}`;
  }
  if (meter.unit === 'rpm') {
    if (meter.limit != null) return `${Math.round(meter.used ?? 0)}/${Math.round(meter.limit)} req/min`;
    return `${Math.round(meter.used ?? 0)} req/min`;
  }
  return formatUsd(meter.balance ?? meter.used);
}

function formatResetLabel(resetAt) {
  if (!resetAt) return null;
  const ms = resetAt - Date.now();
  if (ms <= 0) return 'Resets now';
  const sec = Math.ceil(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `Resets ${d}d ${h % 24}h`;
  }
  if (h > 0) return `Resets ${h}h ${m}m`;
  if (m > 0) return `Resets ${m}m`;
  return `Resets ${sec}s`;
}

function formatSyncAge(syncedAt, source) {
  if (source === 'unconfigured') return 'Set JARVIS_CREDIT_BALANCE';
  if (source === 'env' || source === 'manual') return 'Matches billing';
  if (!syncedAt) return 'Checking…';
  const sec = Math.floor((Date.now() - syncedAt) / 1000);
  if (sec < 15) return 'Live';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function barClass(ratio, limited, variant) {
  if (variant === 'credits') {
    if (limited || ratio <= 0.05) return `usage-bar-fill critical ${variant}`;
    if (ratio <= 0.2) return `usage-bar-fill warn ${variant}`;
    return `usage-bar-fill ok ${variant}`;
  }
  if (limited) return `usage-bar-fill limited ${variant}`;
  if (ratio == null) return `usage-bar-fill unknown ${variant}`;
  if (ratio >= 0.9) return `usage-bar-fill critical ${variant}`;
  if (ratio >= 0.7) return `usage-bar-fill warn ${variant}`;
  return `usage-bar-fill ok ${variant}`;
}

export default function UsageBar({ meter, limited, variant = 'credits' }) {
  const [resetLabel, setResetLabel] = useState(() => formatResetLabel(meter?.resetAt));
  const [syncLabel, setSyncLabel] = useState(() => formatSyncAge(meter?.syncedAt, meter?.source));

  useEffect(() => {
    const tick = () => {
      setResetLabel(formatResetLabel(meter?.resetAt));
      setSyncLabel(formatSyncAge(meter?.syncedAt, meter?.source));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [meter?.resetAt, meter?.syncedAt, meter?.source]);

  const isBalance = variant === 'credits';
  const display = meter || {
    label: isBalance ? 'Credits' : 'RPM',
    balance: 0,
    max: 500,
    ratio: 0,
    resetAt: null,
    unit: isBalance ? 'balance' : 'rpm',
  };

  const r = isBalance
    ? (limited ? 0 : (display.ratio ?? 0))
    : (limited ? 1 : display.ratio);
  const fillWidth = `${Math.max(isBalance && r <= 0 ? 0 : 2, (r ?? 0) * 100)}%`;
  const headValue = isBalance
    ? formatUsd(display.balance)
    : (r != null ? `${Math.round(r * 100)}%` : '—');

  return (
    <div className={`usage-bar usage-bar-${variant}${limited ? ' limited' : ''}`}>
      <div className="usage-bar-head">
        <span className="usage-bar-label">{display.label}</span>
        <span className={`usage-bar-pct${isBalance ? ' balance' : ''}`}>{headValue}</span>
      </div>
      <div className="usage-bar-track">
        <div className="usage-bar-ticks">
          {[0, 25, 50, 75, 100].map((t) => (
            <span key={t} className="usage-bar-tick" style={{ left: `${t}%` }} />
          ))}
        </div>
        <div className={barClass(r, limited, variant)} style={{ width: fillWidth }} />
        {isBalance && (
          <div className="usage-bar-scale">
            <span>$0</span>
            <span>${display.max ?? 500}</span>
          </div>
        )}
      </div>
      <div className="usage-bar-foot">
        <span className="usage-bar-detail">{formatDetail(display, variant)}</span>
        {isBalance ? (
          <>
            <span className="usage-bar-reset">{syncLabel}</span>
            <a
              className="usage-bar-reset usage-bar-billing-link"
              href={display.billingUrl || 'https://platform.openai.com/settings/organization/billing/overview'}
              target="_blank"
              rel="noreferrer"
              title="Credit balance on Billing → Overview (Pay as you go)"
            >
              Billing ↗
            </a>
          </>
        ) : resetLabel && (
          <span className="usage-bar-reset">{resetLabel}</span>
        )}
      </div>
    </div>
  );
}
