import { useCallback, useEffect, useRef, useState } from 'react';

const SERVER = 'http://localhost:3848';

// Shared state across companion + artifact windows via localStorage events
const STORAGE_KEY = 'jarvis_events';

function loadEvents() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{"artifacts":[],"confirmations":[],"appearance":null,"window":null}');
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
  const [windowCmd, setWindowCmd] = useState(() => loadEvents().window);
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
      current.window = event.data;
      saveEvents(current);
      setWindowCmd({ ...event.data });
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3848/ws/events');
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        applyEvent(JSON.parse(e.data));
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      setTimeout(() => {
        if (wsRef.current === ws) {
          wsRef.current = new WebSocket('ws://localhost:3848/ws/events');
        }
      }, 2000);
    };
    return () => ws.close();
  }, [applyEvent]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        const data = loadEvents();
        setArtifacts(data.artifacts);
        setConfirmations(data.confirmations);
        if (data.appearance) setAppearance(data.appearance);
        if (data.window) setWindowCmd(data.window);
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
