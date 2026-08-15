import { useCallback, useRef, useState } from 'react';
import { SERVER } from '../config';
import { dispatchCreditsUpdate } from './useUsageStats';
import { parseApiError, clearVoiceLimited, getStoredLimitError } from '../utils/parseApiError';

export function useJarvisRealtime({ onToolCall, setAudioLevel, setSpeechPulse, setMood, setStatus }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [errorInfo, setErrorInfo] = useState(() => getStoredLimitError());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioStateRef = useRef({ envelope: 0, prevEnvelope: 0, pulse: 0, speaking: false });
  const lastConnectAtRef = useRef(0);
  const handledCallIdsRef = useRef(new Set());
  const responseCreateTimerRef = useRef(null);
  const toolOutputsPendingRef = useRef(0);
  const connectingRef = useRef(false);

  const tearDownConnection = useCallback(() => {
    stopAudioMonitor();
    dcRef.current?.close();
    pcRef.current?.close();
    audioRef.current?.pause();
    pcRef.current = null;
    dcRef.current = null;
    setConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
  }, [setAudioLevel, setSpeechPulse]);

  const enterLimitMode = useCallback((info) => {
    tearDownConnection();
    fetch(`${SERVER}/api/usage/session-end`, { method: 'POST' }).catch(() => {});
    connectingRef.current = false;
    setConnecting(false);
    setError(info.friendly);
    setErrorInfo(info);
    setMood('concerned');
    setStatus(info.friendly);
  }, [tearDownConnection, setMood, setStatus]);

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

  const scheduleResponseCreate = useCallback(() => {
    if (responseCreateTimerRef.current) clearTimeout(responseCreateTimerRef.current);
    responseCreateTimerRef.current = setTimeout(() => {
      responseCreateTimerRef.current = null;
      dcRef.current?.send(JSON.stringify({ type: 'response.create' }));
    }, 80);
  }, []);

  const handleServerEvent = useCallback(async (event) => {
    switch (event.type) {
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        audioStateRef.current.speaking = true;
        setIsSpeaking(true);
        setMood('speaking');
        break;
      case 'response.done':
      case 'response.completed': {
        audioStateRef.current.speaking = false;
        audioStateRef.current.envelope = 0;
        audioStateRef.current.pulse = 0;
        setIsSpeaking(false);
        setAudioLevel?.(0);
        setSpeechPulse?.(0);
        setMood('neutral');
        const usage = event.response?.usage;
        if (usage) {
          fetch(`${SERVER}/api/usage/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usage }),
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data?.credits) dispatchCreditsUpdate(data.credits); })
            .catch(() => {});
        }
        break;
      }
      case 'input_audio_buffer.speech_started':
        setIsListening(true);
        setMood('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
        setIsListening(false);
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const usage = event.usage;
        if (usage) {
          fetch(`${SERVER}/api/usage/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usage }),
          })
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data?.credits) dispatchCreditsUpdate(data.credits); })
            .catch(() => {});
        }
        break;
      }
      case 'response.created':
        toolOutputsPendingRef.current = 0;
        break;
      case 'response.output_item.added':
        if (event.item?.type === 'function_call') {
          toolOutputsPendingRef.current += 1;
        }
        break;
      case 'response.function_call_arguments.done': {
        const callId = event.call_id;
        if (!callId || handledCallIdsRef.current.has(callId)) break;
        handledCallIdsRef.current.add(callId);

        const name = event.name;
        let args = {};
        try {
          args = JSON.parse(event.arguments || '{}');
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
        scheduleResponseCreate();
        break;
      }
      case 'error': {
        const info = parseApiError(JSON.stringify({ error: event.error || event }));
        if (info.code === 'rate_limit' || info.code === 'quota') {
          enterLimitMode(info);
        }
        break;
      }
      default:
        break;
    }
  }, [onToolCall, scheduleResponseCreate, enterLimitMode, setAudioLevel, setSpeechPulse, setMood, setStatus]);

  const connect = useCallback(async (force = false, options = {}) => {
    const { greet = false, greetMessage } = options;
    if (connectingRef.current) return;
    const now = Date.now();
    if (!force && now - lastConnectAtRef.current < 20000) {
      setError('Wait ~20s between voice sessions to avoid burning API limits.');
      setErrorInfo({ friendly: 'Wait before reconnecting', code: 'cooldown', retryable: false });
      return;
    }
    lastConnectAtRef.current = now;
    handledCallIdsRef.current.clear();
    toolOutputsPendingRef.current = 0;
    if (responseCreateTimerRef.current) {
      clearTimeout(responseCreateTimerRef.current);
      responseCreateTimerRef.current = null;
    }

    setConnecting(true);
    connectingRef.current = true;
    setError(null);
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
      pc.oniceconnectionstatechange = () => {
        if (pcRef.current !== pc) return;
        if (pc.iceConnectionState !== 'failed') return;
        tearDownConnection();
        connectingRef.current = false;
        setConnecting(false);
        setError('Voice connection failed on this network. Press Start voice to retry.');
        setErrorInfo({ friendly: 'Voice connection failed on this network', code: 'ice_failed', retryable: true });
        setMood('concerned');
        setStatus('Voice connection failed on this network. Press Start voice to retry.');
      };

      const ms = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      for (const track of ms.getAudioTracks()) {
        track.enabled = true;
        pc.addTrack(track, ms);
      }
      startAudioMonitor(ms);

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        clearVoiceLimited();
        setConnected(true);
        setConnecting(false);
        connectingRef.current = false;
        setError(null);
        setErrorInfo(null);
        setStatus('Listening');
        setMood('listening');
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            audio: {
              input: {
                turn_detection: {
                  type: 'server_vad',
                  threshold: 0.4,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 500,
                  create_response: true,
                  interrupt_response: true,
                },
              },
            },
          },
        }));
        if (greet && greetMessage) {
          dc.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'message',
              role: 'user',
              content: [{ type: 'input_text', text: `Say exactly: "${greetMessage}"` }],
            },
          }));
          scheduleResponseCreate();
        }
      };

      dc.onclose = () => {
        if (connectingRef.current) return;
        tearDownConnection();
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
      const micDenied = err?.name === 'NotAllowedError' || err?.name === 'NotReadableError';
      const micMissing = err?.name === 'NotFoundError';
      const info = micDenied
        ? { friendly: 'Microphone blocked. Allow mic access and press Start voice.', code: 'mic_denied', retryable: true }
        : micMissing
          ? { friendly: 'No microphone found.', code: 'mic_missing', retryable: false }
          : parseApiError(err.message || 'Connection failed');
      tearDownConnection();
      connectingRef.current = false;
      setConnecting(false);
      if (info.code === 'rate_limit' || info.code === 'quota') {
        enterLimitMode(info);
      } else {
        setError(info.friendly);
        setErrorInfo(info);
        setMood('concerned');
        setStatus(info.friendly);
      }
    }
  }, [handleServerEvent, scheduleResponseCreate, enterLimitMode, tearDownConnection, setMood, setStatus]);

  const disconnect = useCallback(() => {
    connectingRef.current = false;
    setConnecting(false);
    tearDownConnection();
    fetch(`${SERVER}/api/usage/session-end`, { method: 'POST' }).catch(() => {});
    setStatus('Paused');
    setMood('neutral');
  }, [tearDownConnection, setMood, setStatus]);

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
