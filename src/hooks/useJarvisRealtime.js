import { useCallback, useRef, useState } from 'react';
import { SERVER } from './useEventStream';
import { parseApiError } from '../utils/parseApiError';

export function useJarvisRealtime({ onToolCall, setAudioLevel, setSpeechPulse, setMood, setStatus }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioStateRef = useRef({ envelope: 0, prevEnvelope: 0, pulse: 0, speaking: false });
  const lastConnectAtRef = useRef(0);

  const stopAudioMonitor = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    setAudioLevel?.(0);
    setSpeechPulse?.(0);
  };

  const startAudioMonitor = (stream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.15;
      source.connect(analyser);

      const timeData = new Uint8Array(analyser.fftSize);
      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const state = audioStateRef.current;

      const tick = () => {
        analyser.getByteTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        // RMS amplitude — tracks syllable volume
        let sumSq = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / timeData.length);

        // Voice-band energy — vowels sit ~300–3400 Hz
        const binHz = ctx.sampleRate / analyser.fftSize;
        const lo = Math.floor(280 / binHz);
        const hi = Math.min(Math.floor(3400 / binHz), freqData.length - 1);
        let voiceSum = 0;
        for (let i = lo; i <= hi; i++) voiceSum += freqData[i];
        const voice = voiceSum / ((hi - lo + 1) * 255);

        const raw = Math.min(1, Math.max(rms * 2.8, voice * 1.4));

        // Envelope: fast attack, slower release
        if (raw > state.envelope) {
          state.envelope += (raw - state.envelope) * 0.55;
        } else {
          state.envelope += (raw - state.envelope) * 0.18;
        }

        // Syllable peak detection — fires on each vowel/word beat
        const rise = state.envelope - state.prevEnvelope;
        if (state.speaking && rise > 0.045 && state.envelope > 0.1) {
          state.pulse = 1;
        } else {
          state.pulse *= 0.78; // quick decay → visible "pop" per syllable
        }
        state.prevEnvelope = state.envelope;

        setAudioLevel?.(state.envelope);
        setSpeechPulse?.(state.pulse);

        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* optional */ }
  };

  const handleServerEvent = useCallback(async (event) => {
    switch (event.type) {
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        audioStateRef.current.speaking = true;
        setIsSpeaking(true);
        setMood('speaking');
        break;
      case 'response.done':
      case 'response.completed':
        audioStateRef.current.speaking = false;
        audioStateRef.current.envelope = 0;
        audioStateRef.current.pulse = 0;
        setIsSpeaking(false);
        setAudioLevel?.(0);
        setSpeechPulse?.(0);
        setMood('neutral');
        break;
      case 'input_audio_buffer.speech_started':
        setIsListening(true);
        setMood('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        setIsListening(false);
        break;
      case 'response.function_call_arguments.done':
      case 'response.output_item.done': {
        const item = event.item || event;
        if (item?.type === 'function_call' || event.name) {
          const name = item.name || event.name;
          const callId = item.call_id || event.call_id;
          let args = {};
          try {
            args = JSON.parse(item.arguments || event.arguments || '{}');
          } catch { /* empty */ }

          setStatus(`Running ${name}…`);
          setMood('thinking');
          const output = await onToolCall(name, args);

          dcRef.current?.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output,
            },
          }));
          dcRef.current?.send(JSON.stringify({ type: 'response.create' }));
        }
        break;
      }
      default:
        break;
    }
  }, [onToolCall, setAudioLevel, setSpeechPulse, setMood, setStatus]);

  const connect = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastConnectAtRef.current < 20000) {
      setError('Wait ~20s between voice sessions to avoid burning API limits.');
      setErrorInfo({ friendly: 'Wait before reconnecting', code: 'cooldown', retryable: false });
      return;
    }
    lastConnectAtRef.current = now;

    setConnecting(true);
    setError(null);
    setErrorInfo(null);
    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        startAudioMonitor(e.streams[0]);
      };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        setConnected(true);
        setConnecting(false);
        setStatus('Listening');
        setMood('listening');
      };

      dc.onmessage = (e) => {
        try {
          handleServerEvent(JSON.parse(e.data));
        } catch { /* ignore */ }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(`${SERVER}/api/realtime/session`, {
        method: 'POST',
        body: offer.sdp,
        headers: { 'Content-Type': 'application/sdp' },
      });

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }

      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() });
    } catch (err) {
      const info = parseApiError(err.message || 'Connection failed');
      setError(info.friendly);
      setErrorInfo(info);
      setConnecting(false);
      setMood('concerned');
      setStatus(info.friendly);
    }
  }, [handleServerEvent, setMood, setStatus]);

  const disconnect = useCallback(() => {
    stopAudioMonitor();
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.pause();
    pcRef.current = null;
    dcRef.current = null;
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
