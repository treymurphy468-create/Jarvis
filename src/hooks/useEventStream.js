import { useCallback, useEffect, useRef, useState } from 'react';
import { SERVER, WS_URL } from '../config';

// Shared state across companion + artifact windows via localStorage events
const STORAGE_KEY = 'jarvis_events';

function loadEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"artifacts":[],"confirmations":[],"appearance":null,"window":null}');
    // Never replay window move/hide on boot — that made the companion flicker then vanish.
    parsed.window = null;
    return parsed;
  } catch {
    return { artifacts: [], confirmations: [], appearance: null, window: null };
  }
}

function saveEvents(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));
}

export function useEventStream() {
  const [artifacts, setArtifacts] = useState(() => loadEvents().artifacts);
  const [confirmations, setConfirmations] = useState(() => loadEvents().confirmations);
  const [appearance, setAppearance] = useState(() => loadEvents().appearance);
  const [windowCmd, setWindowCmd] = useState(null);
  const wsRef = useRef(null);

  const applyEvent = useCallback((event) => {
    const current = loadEvents();
    if (event.type === 'artifact') {
      current.artifacts.push(event.data);
      saveEvents(current);
      setArtifacts([...current.artifacts]);
    } else if (event.type === 'confirmation') {
      current.confirmations.push(event.data);
      saveEvents(current);
      setConfirmations([...current.confirmations]);
    } else if (event.type === 'appearance') {
      current.appearance = event.data;
      saveEvents(current);
      setAppearance({ ...event.data });
    } else if (event.type === 'window') {
      setWindowCmd({ ...event.data });
    }
  }, []);

  useEffect(() => {
    let closed = false;
    let socket;
    let retryTimer;

    const connectWs = () => {
      if (closed) return;
      socket = new WebSocket(WS_URL);
      wsRef.current = socket;
      socket.onmessage = (e) => {
        try {
          applyEvent(JSON.parse(e.data));
        } catch { /* ignore */ }
      };
      socket.onerror = () => {
        socket.close();
      };
      socket.onclose = () => {
        if (closed) return;
        retryTimer = setTimeout(connectWs, 1500);
      };
    };

    connectWs();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
    };
  }, [applyEvent]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        const data = loadEvents();
        setArtifacts(data.artifacts);
        setConfirmations(data.confirmations);
        if (data.appearance) setAppearance(data.appearance);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const clearArtifacts = useCallback(() => {
    const current = loadEvents();
    current.artifacts = [];
    saveEvents(current);
    setArtifacts([]);
  }, []);

  return { artifacts, confirmations, appearance, windowCmd, clearArtifacts };
}

export { SERVER };
