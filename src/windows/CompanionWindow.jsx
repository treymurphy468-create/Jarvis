import { useCallback, useEffect, useState } from 'react';
import CompanionFace from '../components/CompanionFace';
import { useEventStream } from '../hooks/useEventStream';
import { useJarvisRealtime } from '../hooks/useJarvisRealtime';

export default function CompanionWindow() {
  const [mood, setMood] = useState('neutral');
  const [status, setStatus] = useState('Ready');
  const [audioLevel, setAudioLevel] = useState(0);
  const [speechPulse, setSpeechPulse] = useState(0);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const { artifacts, confirmations } = useEventStream();

  const onToolCall = useCallback(async (name, args) => {
    setMood('thinking');
    setStatus(`Running ${name}…`);
    try {
      const res = await fetch(`http://localhost:3847/api/tools/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const data = await res.json();
      setStatus('Done');
      setMood('neutral');
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

  useEffect(() => {
    if (confirmations.length > 0) {
      setPendingConfirm(confirmations[confirmations.length - 1]);
      setMood('concerned');
    }
  }, [confirmations]);

  const handleConfirm = async (approved) => {
    if (!pendingConfirm) return;
    await confirmAction(pendingConfirm.action_id, approved);
    setPendingConfirm(null);
    setMood('neutral');
  };

  return (
    <div className="companion-window">
      <div className="companion-header">
        <span className="companion-title">Jarvis</span>
        <span className={`status-dot ${connected ? 'live' : ''}`} />
      </div>

      <CompanionFace
        mood={isSpeaking ? 'speaking' : isListening ? 'listening' : mood}
        audioLevel={audioLevel}
        speechPulse={speechPulse}
        isSpeaking={isSpeaking}
      />

      <p className="status-text">{error || status}</p>

      <div className="companion-controls">
        {!connected ? (
          <button className="btn primary" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Start voice'}
          </button>
        ) : (
          <button className="btn" onClick={disconnect}>Stop</button>
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
