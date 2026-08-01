import { useCallback, useRef, useState } from 'react';
import { SERVER } from './useEventStream';

export function useJarvisRealtime({ onToolCall, setAudioLevel, setMood, setStatus }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);

  const stopAudioMonitor = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };

  const startAudioMonitor = (stream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setAudioLevel(avg);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* optional */ }
  };

  const handleServerEvent = useCallback(async (event) => {
    switch (event.type) {
      case 'response.output_audio.delta':
        setIsSpeaking(true);
        setMood('speaking');
        break;
      case 'response.done':
        setIsSpeaking(false);
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
  }, [onToolCall, setMood, setStatus]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Remote audio from Jarvis
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
        startAudioMonitor(e.streams[0]);
      };

      // Mic input
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      pc.addTrack(ms.getTracks()[0]);

      // Data channel for events + tool calls
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
      setError(err.message || 'Connection failed');
      setConnecting(false);
      setMood('concerned');
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
  }, [setMood, setStatus]);

  const confirmAction = useCallback(async (action_id, approved) => {
    await fetch(`${SERVER}/api/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id, approved }),
    });
    setStatus(approved ? 'Confirmed' : 'Cancelled');
  }, [setStatus]);

  return { connected, connecting, error, isSpeaking, isListening, connect, disconnect, confirmAction };
}
