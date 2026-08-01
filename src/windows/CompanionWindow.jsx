import { useCallback, useEffect, useRef, useState } from 'react';
import CompanionFace from '../components/CompanionFace';
import RateLimitPanel from '../components/RateLimitPanel';
import { useEventStream, SERVER } from '../hooks/useEventStream';
import { useJarvisRealtime } from '../hooks/useJarvisRealtime';
import { getStoredRateLimitUntil } from '../utils/parseApiError';

const AUTO_VOICE = new URLSearchParams(window.location.search).get('autovoice') !== '0';

export default function CompanionWindow() {
  const [mood, setMood] = useState('neutral');
  const [status, setStatus] = useState(AUTO_VOICE ? 'Starting voice…' : 'Ready');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [rateLimitExpired, setRateLimitExpired] = useState(false);
  const { artifacts, confirmations } = useEventStream();
  const manualStopRef = useRef(false);
  const autoStartedRef = useRef(false);

  const onToolCall = useCallback(async (name, args) => {
    setMood('thinking');
    setStatus(`Running ${name}…`);
    try {
      const res = await fetch(`${SERVER}/api/tools/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const data = await res.json();
      setStatus('Listening');
      setMood('listening');
      return JSON.stringify(data);
    } catch (err) {
      setStatus('Tool error');
      setMood('concerned');
      return JSON.stringify({ error: err.message });
    }
  }, []);

  const {
    connected,
    connecting,
    errorInfo,
    isSpeaking,
    isListening,
    connect,
    disconnect,
    confirmAction,
  } = useJarvisRealtime({ onToolCall, setAudioLevel, setSpeechPulse, setMood, setStatus });

  const storedLimit = getStoredRateLimitUntil();
  const isRateLimited =
    !rateLimitExpired &&
    (errorInfo?.code === 'rate_limit' ||
      errorInfo?.code === 'quota' ||
      (storedLimit && storedLimit > Date.now()));

  const retryAt = errorInfo?.retryAt || storedLimit;

  useEffect(() => {
    if (!AUTO_VOICE || autoStartedRef.current || isRateLimited) return;
    autoStartedRef.current = true;
    manualStopRef.current = false;

    let cancelled = false;
    const waitAndConnect = async () => {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        try {
          const res = await fetch(`${SERVER}/api/health`);
          if (res.ok) {
            if (!manualStopRef.current) connect();
            return;
          }
        } catch { /* server not up yet */ }
        await new Promise((r) => setTimeout(r, 800));
      }
      if (!cancelled) setStatus('Waiting for server…');
    };
    waitAndConnect();
    return () => { cancelled = true; };
  }, [connect, isRateLimited]);

  useEffect(() => {
    if (confirmations.length > 0 && !isRateLimited) {
      setPendingConfirm(confirmations[confirmations.length - 1]);
      setMood('concerned');
    }
  }, [confirmations, isRateLimited]);

  const handleStop = () => {
    manualStopRef.current = true;
    disconnect();
    setStatus('Voice stopped');
  };

  const handleStart = () => {
    manualStopRef.current = false;
    setRateLimitExpired(false);
    connect(true);
  };

  const handleLimitExpired = useCallback(() => {
    setRateLimitExpired(true);
    setMood('neutral');
    setStatus('Ready to reconnect');
    if (AUTO_VOICE && !manualStopRef.current) {
      setTimeout(() => connect(true), 800);
    }
  }, [connect]);

  const handleConfirm = async (approved) => {
    if (!pendingConfirm) return;
    await confirmAction(pendingConfirm.action_id, approved);
    setPendingConfirm(null);
    setMood('neutral');
  };

  const faceMood = isRateLimited
    ? 'rate-limited'
    : isSpeaking
      ? 'speaking'
      : isListening
        ? 'listening'
        : mood;

  return (
    <div className={`companion-window${isRateLimited ? ' rate-limited' : ''}`}>
      <div className="companion-header">
        <span className="companion-title">Jarvis</span>
        <span className={`status-dot ${connected ? 'live' : isRateLimited ? 'limited' : connecting ? 'connecting' : ''}`} />
      </div>

      <CompanionFace
        mood={faceMood}
        audioLevel={isRateLimited ? 0 : audioLevel}
        speechPulse={isRateLimited ? 0 : speechPulse}
        isSpeaking={isSpeaking}
      />

      {isRateLimited ? (
        <RateLimitPanel retryAt={retryAt} code={errorInfo?.code || 'rate_limit'} onExpired={handleLimitExpired} />
      ) : (
        <>
          <p className="status-text">{connecting ? 'Connecting voice…' : connected ? (isSpeaking ? 'Speaking…' : 'Listening') : status}</p>

          <div className="companion-controls">
            {connected ? (
              <button className="btn" onClick={handleStop}>Stop voice</button>
            ) : (
              <button className="btn primary" onClick={handleStart} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Start voice'}
              </button>
            )}
          </div>
        </>
      )}

      {!isRateLimited && pendingConfirm && (
        <div className="confirm-banner">
          <p>{pendingConfirm.message}</p>
          <div className="confirm-actions">
            <button className="btn primary" onClick={() => handleConfirm(true)}>Confirm</button>
            <button className="btn" onClick={() => handleConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {artifacts.length > 0 && !isRateLimited && (
        <p className="artifact-hint">{artifacts.length} artifact(s) in panel →</p>
      )}
    </div>
  );
}
