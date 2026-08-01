import { broadcast } from '../events.js';

export function setAppearance(settings) {
  broadcast({ type: 'appearance', data: settings });
  return { applied: settings };
}

export function windowControl(settings) {
  broadcast({ type: 'window', data: settings });
  return { applied: settings };
}
