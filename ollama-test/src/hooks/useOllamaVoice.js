import { useCallback, useRef, useState } from 'react';
import { SERVER } from './useEventStream';

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function useOllamaVoice({ onToolCall, setAudioLevel, setSpeechPulse, setMood, setStatus }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioStateRef = useRef({ envelope: 0, prevEnvelope: 0, pulse: 0, speaking: false });
  const processingRef = useRef(false);
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const audioCtxRef = useRef(null);

  const stopAudioMonitor = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    setAudioLevel?.(0);
    setSpeechPulse?.(0);
  };

  const startAudioMonitor = (audioEl) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      const source = ctx.createMediaElementSource(audioEl);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.15;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const state = audioStateRef.current;

      const tick = () => {
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeData.length);

        const binHz = ctx.sampleRate / analyser.fftSize;
        const lo = Math.floor(280 / binHz);
        const hi = Math.min(Math.floor(3400 / binHz), freqData.length - 1);
        let voiceSum = 0;
        for (let i = lo; i <= hi; i++) voiceSum += freqData[i];
        const voice = voiceSum / ((hi - lo + 1) * 255);

        const raw = Math.min(1, Math.max(rms * 2.8, voice * 1.4));

        if (raw > state.envelope) {
          state.envelope += (raw - state.envelope) * 0.55;
        } else {
          state.envelope += (raw - state.envelope) * 0.18;
        }

        const rise = state.envelope - state.prevEnvelope;
        if (state.speaking && rise > 0.045 && state.envelope > 0.1) {
          state.pulse = 1;
        } else {
          state.pulse *= 0.78;
        }
        state.prevEnvelope = state.envelope;

        setAudioLevel?.(state.envelope);
        setSpeechPulse?.(state.pulse);

        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* optional */ }
  };

  const playTts = useCallback(async (text) => {
    const res = await fetch(`${SERVER}/api/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'TTS failed');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => {
        audioStateRef.current.speaking = true;
        setIsSpeaking(true);
        setMood('speaking');
        startAudioMonitor(audio);
      };

      audio.onended = () => {
        stopAudioMonitor();
        audioStateRef.current.speaking = false;
        audioStateRef.current.envelope = 0;
        audioStateRef.current.pulse = 0;
        setIsSpeaking(false);
        setAudioLevel?.(0);
        setSpeechPulse?.(0);
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch(reject);
    });
  }, [setAudioLevel, setMood, setSpeechPulse]);

  const handleTranscript = useCallback(async (transcript) => {
    if (!transcript.trim() || processingRef.current) return;

    processingRef.current = true;
    setIsListening(false);
    setMood('thinking');
    setStatus('Thinking…');

    try {
      const res = await fetch(`${SERVER}/api/ollama/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          sessionId: sessionIdRef.current,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'Chat failed');
      }

      const data = await res.json();
      const reply = data.reply || 'Right.';
      setStatus('Speaking…');
      await playTts(reply);
      setStatus('Listening');
      setMood('listening');
      setIsListening(true);
    } catch (err) {
      setError(err.message);
      setErrorInfo({ friendly: err.message, code: 'error', retryable: true });
      setMood('concerned');
      setStatus(err.message);
    } finally {
      processingRef.current = false;
    }
  }, [playTts, setMood, setStatus]);

  const startRecognition = useCallback(() => {
    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported in this browser');
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-GB';

    rec.onstart = () => {
      setIsListening(true);
      setMood('listening');
      setStatus('Listening');
    };

    rec.onresult = (event) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (finalText.trim()) {
        handleTranscript(finalText.trim());
      }
    };

    rec.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setError(`Mic error: ${event.error}`);
      setErrorInfo({ friendly: event.error, code: 'mic', retryable: true });
    };

    rec.onend = () => {
      if (recognitionRef.current === rec && connected && !processingRef.current) {
        try { rec.start(); } catch { /* already started */ }
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [connected, handleTranscript, setMood, setStatus]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    setErrorInfo(null);

    try {
      const health = await fetch(`${SERVER}/api/health`);
      const data = await health.json();

      if (!data.ollama?.ok) {
        throw new Error('Ollama is not running. Start it with: ollama serve');
      }
      if (!data.ollama?.modelReady) {
        throw new Error(`Model "${data.ollama.model}" not found. Run: ollama pull ${data.ollama.model}`);
      }
      if (!data.elevenlabs) {
        throw new Error('ElevenLabs not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to .env');
      }

      startRecognition();
      setConnected(true);
      setConnecting(false);
    } catch (err) {
      setError(err.message);
      setErrorInfo({ friendly: err.message, code: 'setup', retryable: true });
      setConnecting(false);
      setMood('concerned');
      setStatus(err.message);
    }
  }, [setMood, setStatus, startRecognition]);

  const disconnect = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    audioRef.current?.pause();
    stopAudioMonitor();
    setConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
    setStatus('Ready');
    setMood('neutral');
  }, [setMood, setStatus, setAudioLevel, setSpeechPulse]);

  const confirmAction = useCallback(async (action_id, approved) => {
    await fetch(`${SERVER}/api/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id, approved }),
    });
    setStatus(approved ? 'Confirmed' : 'Cancelled');
  }, [setStatus]);

  return { connected, connecting, error, errorInfo, isSpeaking, isListening, connect, disconnect, confirmAction };
}
