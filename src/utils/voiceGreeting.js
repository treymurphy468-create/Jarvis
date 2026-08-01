const WITTY_GREETINGS = [
  'Online and ready, sir. Try to keep up.',
  'Systems live. What shall we tackle?',
  'Back in action. At your service.',
  'All systems nominal. Do go on.',
  'Powered up and listening. How may I help?',
  'Operational again. What do you need?',
  'Good — I\'m awake. Shall we begin?',
  'Ready when you are. Don\'t keep me waiting.',
  'Up and running. Try not to break anything.',
  'Voice online. I\'m all ears.',
];

export function pickWittyGreeting() {
  return WITTY_GREETINGS[Math.floor(Math.random() * WITTY_GREETINGS.length)];
}

export function shouldPlayGreeting({ bootId, lastBootId, isFirstVoiceStart, recoveringFromRateLimit }) {
  const freshReboot = Boolean(bootId && bootId !== lastBootId);
  return isFirstVoiceStart || freshReboot || recoveringFromRateLimit;
}

export function markBootSeen(bootId) {
  if (bootId) sessionStorage.setItem('jarvis_last_boot', bootId);
}

export function getLastBootId() {
  return sessionStorage.getItem('jarvis_last_boot');
}
