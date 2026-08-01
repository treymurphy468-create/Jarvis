import { useEffect, useState } from 'react';
import CompanionWindow from './windows/CompanionWindow';
import ArtifactWindow from './windows/ArtifactWindow';
import { useAppearance } from './hooks/useAppearance';
import { useEventStream } from './hooks/useEventStream';

export default function App() {
  const [windowType, setWindowType] = useState(
    () => new URLSearchParams(window.location.search).get('window') || 'companion'
  );
  const { appearance, windowCmd } = useEventStream();
  useAppearance(appearance, windowCmd);

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
