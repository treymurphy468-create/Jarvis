import { useCallback, useEffect, useRef, useState } from 'react';
import CompanionFace from '../components/CompanionFace';
import RateLimitPanel from '../components/RateLimitPanel';
import UsageBars from '../components/UsageBars';
import { SERVER } from '../config';
import { useEventStream } from '../hooks/useEventStream';
import { useJarvisRealtime } from '../hooks/useJarvisRealtime';
import { useUsageStats } from '../hooks/useUsageStats';
import { waitForHealth } from '../utils/waitForHealth';
import {
  getLastBootId,
  markBootSeen,
  pickWittyGreeting,
  shouldPlayGreeting,
} from '../utils/voiceGreeting';

const AUTO_VOICE = new URLSearchParams(window.location.search).get('autovoice') !== '0';

export default function CompanionWindow() {
  const [mood, setMood] = useState('neutral');
  const [status, setStatus] = useState(AUTO_VOICE ? 'Starting voice…' : 'Paused');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const { artifacts, confirmations } = useEventStream();
  const manualStopRef = useRef(false);
  const hasVoiceStartedRef = useRef(false);
  const autoStartedRef = useRef(false);
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
    let cancelled = false;
    waitForHealth(SERVER, { attempts: 8, delayMs: 400 }).then((data) => {
      if (!cancelled && data?.bootId) bootIdRef.current = data.bootId;
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (confirmations.length > 0 && !isRateLimited) {
      setPendingConfirm(confirmations[confirmations.length - 1]);
      setMood('concerned');
    }
  }, [confirmations, isRateLimited]);

  const startVoice = useCallback(async () => {
    manualStopRef.current = false;
    setStatus('Starting voice…');

    const health = await waitForHealth(SERVER, { attempts: 20, delayMs: 500 });
    if (health?.bootId) bootIdRef.current = health.bootId;
    if (!health) {
      setMood('concerned');
      setStatus('Waiting for server…');
      return;
    }

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
  }, [connect, errorInfo?.code, setMood, setStatus]);

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
    if (!AUTO_VOICE || autoStartedRef.current || isRateLimited) return;
    let cancelled = false;
    (async () => {
      const health = await waitForHealth(SERVER, { attempts: 40, delayMs: 500 });
      if (cancelled || autoStartedRef.current || manualStopRef.current) return;
      if (health?.bootId) bootIdRef.current = health.bootId;
      if (!health) {
        setMood('concerned');
        setStatus('Waiting for server…');
        return;
      }
      autoStartedRef.current = true;
      startVoice();
    })();
    return () => { cancelled = true; };
  }, [startVoice, isRateLimited]);

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
        <div className="companion-header-right">
          <span
            className={`status-dot ${connected ? 'live' : isRateLimited ? 'limited' : connecting ? 'connecting' : ''}`}
            title="Voice status"
            aria-hidden="true"
          />
          <button
            type="button"
            className="companion-close"
            aria-label="Close Jarvis"
            title="Close Jarvis"
            onClick={() => window.jarvis?.quit?.()}
          >
            ×
          </button>
        </div>
      </div>

      <CompanionFace
        mood={faceMood}
        audioLevel={isRateLimited ? 0 : audioLevel}
        speechPulse={isRateLimited ? 0 : speechPulse}
        isSpeaking={isSpeaking}
      />

      <UsageBars
        session={usageStats?.session}
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
