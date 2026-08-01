import { useCallback, useEffect, useRef, useState } from 'react';
import CompanionFace from '../components/CompanionFace';
import { useEventStream, SERVER } from '../hooks/useEventStream';
import { useJarvisRealtime } from '../hooks/useJarvisRealtime';

const AUTO_VOICE = new URLSearchParams(window.location.search).get('autovoice') !== '0';

export default function CompanionWindow() {
  const [mood, setMood] = useState('neutral');
  const [status, setStatus] = useState(AUTO_VOICE ? 'Starting voice…' : 'Ready');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
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
    error,
    isSpeaking,
    isListening,
    connect,
    disconnect,
    confirmAction,
  } = useJarvisRealtime({ onToolCall, setAudioLevel, setSpeechPulse, setMood, setStatus });

  // Auto-start voice when companion opens
  useEffect(() => {
    if (!AUTO_VOICE || autoStartedRef.current) return;
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
  }, [connect]);

  // Auto-reconnect after errors unless user clicked Stop
  useEffect(() => {
    if (!AUTO_VOICE || manualStopRef.current || connected || connecting) return;
    if (!error) return;

    const timer = setTimeout(() => {
      if (!manualStopRef.current) {
        setStatus('Reconnecting…');
        connect();
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [error, connected, connecting, connect]);

  useEffect(() => {
    if (confirmations.length > 0) {
      setPendingConfirm(confirmations[confirmations.length - 1]);
      setMood('concerned');
    }
  }, [confirmations]);

  const handleStop = () => {
    manualStopRef.current = true;
    disconnect();
    setStatus('Voice stopped');
  };

  const handleStart = () => {
    manualStopRef.current = false;
    connect();
  };

  const handleConfirm = async (approved) => {
    if (!pendingConfirm) return;
    await confirmAction(pendingConfirm.action_id, approved);
    setPendingConfirm(null);
    setMood('neutral');
  };

  const statusLabel = error
    ? error.slice(0, 120)
    : connecting
      ? 'Connecting voice…'
      : connected
        ? (isSpeaking ? 'Speaking…' : isListening ? 'Listening' : status)
        : status;

  return (
    <div className="companion-window">
      <div className="companion-header">
        <span className="companion-title">Jarvis</span>
        <span className={`status-dot ${connected ? 'live' : connecting ? 'connecting' : ''}`} />
      </div>

      <CompanionFace
        mood={isSpeaking ? 'speaking' : isListening ? 'listening' : mood}
        audioLevel={audioLevel}
        speechPulse={speechPulse}
        isSpeaking={isSpeaking}
      />

      <p className="status-text">{statusLabel}</p>

      <div className="companion-controls">
        {connected ? (
          <button className="btn" onClick={handleStop}>Stop voice</button>
        ) : (
          <button className="btn primary" onClick={handleStart} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Start voice'}
          </button>
        )}
      </div>

      {pendingConfirm && (
        <div className="confirm-banner">
          <p>{pendingConfirm.message}</p>
          <div className="confirm-actions">
            <button className="btn primary" onClick={() => handleConfirm(true)}>Confirm</button>
            <button className="btn" onClick={() => handleConfirm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {artifacts.length > 0 && (
        <p className="artifact-hint">{artifacts.length} artifact(s) in panel →</p>
      )}
    </div>
  );
}
