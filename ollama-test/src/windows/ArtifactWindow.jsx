import { useState } from 'react';
import ArtifactPanel from '../components/ArtifactPanel';
import { useEventStream } from '../hooks/useEventStream';

export default function ArtifactWindow() {
  const { artifacts, confirmations, clearArtifacts } = useEventStream();
  const [fullscreen, setFullscreen] = useState(false);

  const toggleFullscreen = async () => {
    if (window.jarvis?.toggleArtifactFullscreen) {
      const fs = await window.jarvis.toggleArtifactFullscreen();
      setFullscreen(fs);
    }
  };

  const handleConfirm = async (action_id, approved) => {
    await fetch('http://localhost:3847/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id, approved }),
    });
  };

  return (
    <div className="artifact-window">
      <header className="artifact-header">
        <h1>Artifacts</h1>
        <div className="artifact-toolbar">
          <button className="btn" onClick={clearArtifacts}>Clear</button>
          <button className="btn" onClick={toggleFullscreen}>
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </header>

      {confirmations.length > 0 && (
        <div className="confirm-panel">
          {confirmations.map((c) => (
            <div key={c.action_id} className="confirm-card">
              <p>{c.message}</p>
              <div className="confirm-actions">
                <button className="btn primary" onClick={() => handleConfirm(c.action_id, true)}>Confirm</button>
                <button className="btn" onClick={() => handleConfirm(c.action_id, false)}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ArtifactPanel artifacts={artifacts} />
    </div>
  );
}
