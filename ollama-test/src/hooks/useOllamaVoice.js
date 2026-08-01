import { useCallback, useRef, useState } from 'react';
import { SERVER } from './useEventStream';

const SpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

export function useOllamaVoice({ setAudioLevel, setSpeechPulse, setMood, setStatus }) {
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
  const activeRef = useRef(false);
  const stoppingRef = useRef(false);
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const audioCtxRef = useRef(null);
  const audioSourceRef = useRef(null);
  const restartTimerRef = useRef(null);
  const handleTranscriptRef = useRef(null);
  const startRecognitionRef = useRef(() => {});

  const clearErrors = () => {
    setError(null);
    setErrorInfo(null);
  };

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
      if (ctx.state === 'suspended') ctx.resume();

      if (audioSourceRef.current) {
        try { audioSourceRef.current.disconnect(); } catch { /* already disconnected */ }
      }
      const source = ctx.createMediaElementSource(audioEl);
      audioSourceRef.current = source;
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

  const stopRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    recognitionRef.current = null;
    stoppingRef.current = true;
    try { rec.stop(); } catch { /* ignore */ }
    setTimeout(() => { stoppingRef.current = false; }, 400);
  }, []);

  const scheduleRecognitionRestart = useCallback(() => {
    if (!activeRef.current || processingRef.current) return;
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (activeRef.current && !processingRef.current) startRecognitionRef.current();
    }, 300);
  }, []);

  const startRecognition = useCallback(() => {
    if (!SpeechRecognition || !activeRef.current) return;

    stopRecognition();

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = 'en-GB';

    rec.onstart = () => {
      if (!activeRef.current) return;
      setIsListening(true);
      setMood('listening');
      setStatus('Listening');
    };

    rec.onresult = (event) => {
      if (!activeRef.current || processingRef.current) return;

      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalText += event.results[i][0].transcript;
        }
      }
      if (finalText.trim()) {
        handleTranscriptRef.current?.(finalText.trim());
      }
    };

    rec.onerror = (event) => {
      if (stoppingRef.current || !activeRef.current) return;
      if (event.error === 'no-speech' || event.error === 'aborted') {
        scheduleRecognitionRestart();
        return;
      }
      if (event.error === 'network') {
        scheduleRecognitionRestart();
        return;
      }
      setError(`Mic error: ${event.error}`);
      setErrorInfo({ friendly: event.error, code: 'mic', retryable: true });
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) return;
      recognitionRef.current = null;
      if (activeRef.current && !processingRef.current) {
        scheduleRecognitionRestart();
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      scheduleRecognitionRestart();
    }
  }, [scheduleRecognitionRestart, setMood, setStatus, stopRecognition]);

  startRecognitionRef.current = startRecognition;

  const handleTranscript = useCallback(async (transcript) => {
    if (!transcript.trim() || processingRef.current || !activeRef.current) return;

    processingRef.current = true;
    stopRecognition();
    setIsListening(false);
    setMood('thinking');
    setStatus('Thinking…');
    clearErrors();

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
      const reply = data.reply?.trim() || 'Right.';
      setStatus('Speaking…');
      await playTts(reply);
    } catch (err) {
      if (!activeRef.current) return;
      setError(err.message);
      setErrorInfo({ friendly: err.message, code: 'error', retryable: true });
      setMood('concerned');
      setStatus(err.message);
    } finally {
      processingRef.current = false;
      if (activeRef.current) {
        setStatus('Listening');
        setMood('listening');
        setIsListening(true);
        startRecognition();
      }
    }
  }, [playTts, setMood, setStatus, startRecognition, stopRecognition]);

  handleTranscriptRef.current = handleTranscript;

  const connect = useCallback(async () => {
    setConnecting(true);
    clearErrors();

    try {
      if (!SpeechRecognition) {
        throw new Error('Speech recognition not supported in this browser');
      }

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

      activeRef.current = true;
      setConnected(true);
      setConnecting(false);
      startRecognition();
    } catch (err) {
      activeRef.current = false;
      setError(err.message);
      setErrorInfo({ friendly: err.message, code: 'setup', retryable: true });
      setConnecting(false);
      setMood('concerned');
      setStatus(err.message);
    }
  }, [setMood, setStatus, startRecognition]);

  const disconnect = useCallback(() => {
    activeRef.current = false;
    stoppingRef.current = true;
    clearTimeout(restartTimerRef.current);
    stopRecognition();
    audioRef.current?.pause();
    audioRef.current = null;
    stopAudioMonitor();
    setConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
    clearErrors();
    setStatus('Ready');
    setMood('neutral');
  }, [setMood, setStatus, setAudioLevel, setSpeechPulse, stopRecognition]);

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
