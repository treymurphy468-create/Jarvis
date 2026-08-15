export function sanitizeWindowsStartTarget(target) {
  const trimmed = String(target || '').trim();
  if (!trimmed) throw new Error('empty app name');
  if (/[\r\n&|<>^]/.test(trimmed)) throw new Error('invalid app name');
  return trimmed.replace(/"/g, '');
}

export function windowsStartCommand(target) {
  const escaped = sanitizeWindowsStartTarget(target);
  return `start "" /D "%SystemRoot%" "${escaped}"`;
}

export function isJarvisAppName(name) {
  return /jarvis/i.test(String(name || ''));
}
