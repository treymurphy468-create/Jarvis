import { useCallback, useEffect, useState } from 'react';
import { SERVER } from '../config';

const CREDITS_SYNC_MS = 60_000;
const CREDITS_LIVE_MS = 3_000;
const SESSION_POLL_MS = 3_000;

export function dispatchCreditsUpdate(credits) {
  if (!credits) return;
  window.dispatchEvent(new CustomEvent('jarvis-credits', { detail: credits }));
}

export function useUsageStats({ connected } = {}) {
  const [stats, setStats] = useState(null);

  const applyCredits = useCallback((credits) => {
    if (!credits) return;
    setStats((prev) => ({ ...(prev || {}), credits, updatedAt: Date.now() }));
  }, []);

  useEffect(() => {
    const onCredits = (e) => applyCredits(e.detail);
    window.addEventListener('jarvis-credits', onCredits);
    return () => window.removeEventListener('jarvis-credits', onCredits);
  }, [applyCredits]);

  useEffect(() => {
    let cancelled = false;

    const loadAll = async () => {
      try {
        const res = await fetch(`${SERVER}/api/usage`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStats(data);
      } catch { /* quiet */ }
    };

    const loadCreditsLive = async () => {
      try {
        const res = await fetch(`${SERVER}/api/usage/credits`);
        if (!res.ok) return;
        const credits = await res.json();
        if (!cancelled) applyCredits(credits);
      } catch { /* quiet */ }
    };

    const syncCreditsQuiet = async () => {
      try {
        const res = await fetch(`${SERVER}/api/usage/credits?sync=1`);
        if (!res.ok) return;
        const credits = await res.json();
        if (!cancelled) applyCredits(credits);
      } catch { /* quiet */ }
    };

    loadAll();
    syncCreditsQuiet();

    const sessionId = setInterval(loadAll, connected ? SESSION_POLL_MS : 15_000);
    const liveId = setInterval(loadCreditsLive, connected ? CREDITS_LIVE_MS : 15_000);
    const syncId = setInterval(syncCreditsQuiet, CREDITS_SYNC_MS);

    return () => {
      cancelled = true;
      clearInterval(sessionId);
      clearInterval(liveId);
      clearInterval(syncId);
    };
  }, [connected, applyCredits]);

  return stats;
}
