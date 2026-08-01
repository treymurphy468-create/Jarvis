import { useCallback, useEffect, useRef, useState } from 'react';
import CompanionFace from '../components/CompanionFace';
import RateLimitPanel from '../components/RateLimitPanel';
import UsageBars from '../components/UsageBars';
import { useEventStream, SERVER } from '../hooks/useEventStream';
import { useJarvisRealtime } from '../hooks/useJarvisRealtime';
import { useUsageStats } from '../hooks/useUsageStats';
import {
  getLastBootId,
  markBootSeen,
  pickWittyGreeting,
  shouldPlayGreeting,
} from '../utils/voiceGreeting';

export default function CompanionWindow() {
  const [mood, setMood] = useState('neutral');
  const [status, setStatus] = useState('Paused');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const { artifacts, confirmations } = useEventStream();
  const manualStopRef = useRef(false);
  const hasVoiceStartedRef = useRef(false);
  const bootIdRef = useRef(null);

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

  const usageStats = useUsageStats({ connected });

  const isRateLimited =
    !connected &&
    (errorInfo?.code === 'rate_limit' || errorInfo?.code === 'quota');

  useEffect(() => {
    fetch(`${SERVER}/api/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.bootId) bootIdRef.current = data.bootId;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (confirmations.length > 0 && !isRateLimited) {
      setPendingConfirm(confirmations[confirmations.length - 1]);
      setMood('concerned');
    }
  }, [confirmations, isRateLimited]);

  const startVoice = useCallback(async () => {
    manualStopRef.current = false;

    try {
      const res = await fetch(`${SERVER}/api/health`);
      if (res.ok) {
        const data = await res.json();
        if (data?.bootId) bootIdRef.current = data.bootId;
      }
    } catch { /* server not up */ }

    const bootId = bootIdRef.current;
    const lastBootId = getLastBootId();
    const isFirstVoiceStart = !hasVoiceStartedRef.current;
    const recoveringFromRateLimit = errorInfo?.code === 'rate_limit';
    const greet = shouldPlayGreeting({
      bootId,
      lastBootId,
      isFirstVoiceStart,
      recoveringFromRateLimit,
    });

    hasVoiceStartedRef.current = true;
    markBootSeen(bootId);

    connect(true, {
      greet,
      greetMessage: greet ? pickWittyGreeting() : null,
    });
  }, [connect, errorInfo?.code]);

  const handleStop = () => {
    manualStopRef.current = true;
    disconnect();
    setStatus('Paused');
  };

  const handleStart = () => {
    startVoice();
  };

  const handleConfirm = async (approved) => {
    if (!pendingConfirm) return;
    await confirmAction(pendingConfirm.action_id, approved);
    setPendingConfirm(null);
    setMood('neutral');
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'v' && e.key !== 'V') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (connected) {
        handleStop();
      } else if (!connecting) {
        startVoice();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [connected, connecting, startVoice]);

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

      <UsageBars
        credits={usageStats?.credits}
        session={usageStats?.session}
        creditsLimited={errorInfo?.code === 'quota'}
        sessionLimited={errorInfo?.code === 'rate_limit'}
      />

      {isRateLimited && (
        <RateLimitPanel code={errorInfo?.code || 'rate_limit'} />
      )}

      <p className="status-text">
        {isRateLimited
          ? (errorInfo?.code === 'quota' ? 'Billing required' : 'Voice limit — press Start when ready')
          : connecting
            ? 'Connecting voice…'
            : connected
              ? (isSpeaking ? 'Speaking…' : 'Listening')
              : status}
      </p>

      <div className="companion-controls">
        {connected ? (
          <button className="btn" onClick={handleStop}>Stop voice</button>
        ) : (
          <button className="btn primary" onClick={handleStart} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Start voice'}
          </button>
        )}
      </div>

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
