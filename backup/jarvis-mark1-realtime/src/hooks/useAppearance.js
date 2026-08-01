import { useEffect } from 'react';

const APPEARANCE_KEY = 'jarvis_appearance';

export function applyAppearance(settings) {
  const root = document.documentElement;
  if (settings.accentColor) {
    root.style.setProperty('--accent', settings.accentColor);
    root.style.setProperty('--accent-dim', settings.accentColor);
  }
  if (settings.backgroundColor) root.style.setProperty('--bg', settings.backgroundColor);
  if (settings.textColor) root.style.setProperty('--text', settings.textColor);
  if (settings.faceColor) root.style.setProperty('--face-color', settings.faceColor);

  const saved = { ...loadAppearance(), ...settings };
  localStorage.setItem(APPEARANCE_KEY, JSON.stringify(saved));
}

export function loadAppearance() {
  try {
    return JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function useAppearance(appearanceEvent, windowEvent) {
  useEffect(() => {
    const saved = loadAppearance();
    if (Object.keys(saved).length) applyAppearance(saved);
  }, []);

  useEffect(() => {
    if (appearanceEvent) {
      applyAppearance(appearanceEvent);
      if (appearanceEvent.title && window.jarvis?.setTitle) {
        window.jarvis.setTitle(appearanceEvent.title);
      }
    }
  }, [appearanceEvent]);

  useEffect(() => {
    if (windowEvent && window.jarvis?.windowControl) {
      window.jarvis.windowControl(windowEvent);
    }
  }, [windowEvent]);
}
