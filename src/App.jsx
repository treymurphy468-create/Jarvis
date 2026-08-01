import { useEffect, useState } from 'react';
import CompanionWindow from './windows/CompanionWindow';
import ArtifactWindow from './windows/ArtifactWindow';

export default function App() {
  const [windowType, setWindowType] = useState(
    () => new URLSearchParams(window.location.search).get('window') || 'companion'
  );

  useEffect(() => {
    if (window.jarvis?.getWindowType) {
      window.jarvis.getWindowType().then(setWindowType);
    }
  }, []);

  if (windowType === 'artifact') {
    return <ArtifactWindow />;
  }

  return <CompanionWindow />;
}
