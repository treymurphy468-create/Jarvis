import { useCallback, useRef, useState } from 'react';
import { SERVER } from './useEventStream';

const SILENCE_MS = 1200;
const SPEECH_THRESHOLD = 0.012;
const MIN_RECORD_MS = 400;
const MAX_RECORD_MS = 15000;

export function useOllamaVoice({ setAudioLevel, setSpeechPulse, setMood, setStatus }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioStateRef = useRef({ envelope: 0, prevEnvelope: 0, pulse: 0, speaking: false });
  const processingRef = useRef(false);
  const activeRef = useRef(false);
  const sessionIdRef = useRef(`session-${Date.now()}`);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordStartRef = useRef(0);
  const silenceStartRef = useRef(null);
  const speechDetectedRef = useRef(false);
  const listenLoopRef = useRef(null);
  const playbackCtxRef = useRef(null);
  const micLevelRef = useRef(0);
  const isSpeakingRef = useRef(false);
  const handleTranscriptRef = useRef(null);

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

  const startAudioMonitor = (ctx, sourceNode) => {
    try {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.25;
      sourceNode.connect(analyser);
      analyser.connect(ctx.destination);

      const timeData = new Uint8Array(analyser.fftSize);
      const state = audioStateRef.current;
      state.envelope = 0;
      state.pulse = 0;
      state.prevEnvelope = 0;

      const tick = () => {
        if (!isSpeakingRef.current) {
          animFrameRef.current = null;
          setAudioLevel?.(micLevelRef.current);
          setSpeechPulse?.(0);
          return;
        }
        analyser.getByteTimeDomainData(timeData);
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeData.length);
        const raw = Math.min(1, rms * 2.8);

        if (raw > state.envelope) state.envelope += (raw - state.envelope) * 0.55;
        else state.envelope += (raw - state.envelope) * 0.18;

        const rise = state.envelope - state.prevEnvelope;
        if (state.speaking && rise > 0.045 && state.envelope > 0.1) state.pulse = 1;
        else state.pulse *= 0.78;
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

    const arrayBuffer = await res.arrayBuffer();
    if (!playbackCtxRef.current) playbackCtxRef.current = new AudioContext();
    const ctx = playbackCtxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    return new Promise((resolve, reject) => {
      source.onended = () => {
        isSpeakingRef.current = false;
        audioStateRef.current.speaking = false;
        stopAudioMonitor();
        setIsSpeaking(false);
        setAudioLevel?.(micLevelRef.current);
        setSpeechPulse?.(0);
        setMood('listening');
        resolve();
      };

      isSpeakingRef.current = true;
      audioStateRef.current.speaking = true;
      setIsSpeaking(true);
      setMood('speaking');
      startAudioMonitor(ctx, source);
      source.start(0);
    });
  }, [setAudioLevel, setMood, setSpeechPulse]);

  const transcribeBlob = async (blob) => {
    const res = await fetch(`${SERVER}/api/stt`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Transcription failed');
    }
    const data = await res.json();
    return data.text?.trim() || '';
  };

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch { /* ignore */ }
    }
    mediaRecorderRef.current = null;
  }, []);

  const finishRecording = useCallback(async () => {
    stopRecording();
    speechDetectedRef.current = false;
    silenceStartRef.current = null;

    const chunks = chunksRef.current;
    chunksRef.current = [];

    if (!chunks.length || !activeRef.current) return;

    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
    if (blob.size < 1000) return;

    processingRef.current = true;
    setIsListening(false);
    setAudioLevel?.(0);
    setSpeechPulse?.(0);
    setMood('thinking');
    setStatus('Transcribing…');

    try {
      const text = await transcribeBlob(blob);
      if (text && activeRef.current) {
        await handleTranscriptRef.current?.(text);
      } else if (activeRef.current) {
        setStatus("Didn't catch that — try again");
        setMood('listening');
        setIsListening(true);
        setTimeout(() => {
          if (activeRef.current && !processingRef.current) setStatus('Listening');
        }, 2000);
      }
    } catch (err) {
      if (activeRef.current) {
        setError(err.message);
        setErrorInfo({ friendly: err.message, code: 'stt', retryable: true });
        setMood('concerned');
        setStatus(err.message);
      }
    } finally {
      processingRef.current = false;
    }
  }, [setMood, setStatus, stopRecording]);

  const startRecording = useCallback(() => {
    if (!streamRef.current || mediaRecorderRef.current || processingRef.current) return;

    chunksRef.current = [];
    speechDetectedRef.current = false;
    silenceStartRef.current = null;
    recordStartRef.current = Date.now();

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    const rec = new MediaRecorder(streamRef.current, { mimeType: mime });
    mediaRecorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      if (mediaRecorderRef.current === rec) mediaRecorderRef.current = null;
    };

    rec.start(250);
  }, []);

  const listenLoop = useCallback(() => {
    if (!activeRef.current || !analyserRef.current) return;

    const analyser = analyserRef.current;
    const timeData = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (!activeRef.current) return;
      listenLoopRef.current = requestAnimationFrame(tick);

      if (processingRef.current || isSpeakingRef.current) return;

      analyser.getByteTimeDomainData(timeData);
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = (timeData[i] - 128) / 128;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const level = Math.min(1, rms * 3);
      micLevelRef.current = level;

      if (!processingRef.current && !isSpeakingRef.current) {
        setAudioLevel?.(level);
      }

      const now = Date.now();
      const isSpeech = rms > SPEECH_THRESHOLD;

      if (isSpeech) {
        silenceStartRef.current = null;
        if (!mediaRecorderRef.current && !processingRef.current) {
          startRecording();
          speechDetectedRef.current = true;
        }
      } else if (mediaRecorderRef.current && speechDetectedRef.current) {
        if (!silenceStartRef.current) silenceStartRef.current = now;
        const silentFor = now - silenceStartRef.current;
        const recordedFor = now - recordStartRef.current;

        if (silentFor >= SILENCE_MS && recordedFor >= MIN_RECORD_MS) {
          finishRecording();
        } else if (recordedFor >= MAX_RECORD_MS) {
          finishRecording();
        }
      }
    };

    tick();
  }, [finishRecording, setAudioLevel, startRecording]);

  const handleTranscript = useCallback(async (transcript) => {
    if (!transcript.trim() || !activeRef.current) return;

    setMood('thinking');
    setStatus('Thinking…');
    clearErrors();

    try {
      const res = await fetch(`${SERVER}/api/ollama/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: transcript, sessionId: sessionIdRef.current }),
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
      if (activeRef.current) {
        setStatus('Listening');
        setMood('listening');
        setIsListening(true);
      }
    }
  }, [playTts, setMood, setStatus]);

  handleTranscriptRef.current = handleTranscript;

  const releaseMic = useCallback(() => {
    if (listenLoopRef.current) cancelAnimationFrame(listenLoopRef.current);
    listenLoopRef.current = null;
    stopRecording();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, [stopRecording]);

  const connect = useCallback(async () => {
    setConnecting(true);
    clearErrors();

    try {
      const health = await fetch(`${SERVER}/api/health`);
      const data = await health.json();

      if (!data.ollama?.ok) throw new Error('Ollama is not running. Start it with: ollama serve');
      if (!data.ollama?.modelReady) throw new Error(`Model "${data.ollama.model}" not found. Run: ollama pull ${data.ollama.model}`);
      if (!data.whisper?.ok) throw new Error('Speech-to-text not ready. Restart the Jarvis server.');
      if (!data.elevenlabs) throw new Error('ElevenLabs not configured in .env');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      activeRef.current = true;
      setConnected(true);
      setConnecting(false);
      setIsListening(true);
      setMood('listening');
      setStatus('Listening');
      listenLoop();
    } catch (err) {
      releaseMic();
      activeRef.current = false;
      setError(err.message);
      setErrorInfo({ friendly: err.message, code: 'setup', retryable: true });
      setConnecting(false);
      setMood('concerned');
      setStatus(err.message);
    }
  }, [listenLoop, releaseMic, setMood, setStatus]);

  const disconnect = useCallback(() => {
    activeRef.current = false;
    stopAudioMonitor();
    releaseMic();
    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;
    setConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
    clearErrors();
    setStatus('Voice stopped');
    setMood('neutral');
  }, [releaseMic, setMood, setStatus, setAudioLevel, setSpeechPulse]);

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
