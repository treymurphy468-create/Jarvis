import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isJarvisAppName, sanitizeWindowsStartTarget, windowsStartCommand } from './windowsStart.js';

describe('windowsStartCommand', () => {
  it('uses SystemRoot as the working directory so Desktop files are not launched by name', () => {
    const cmd = windowsStartCommand('notepad');
    assert.equal(cmd, 'start "" /D "%SystemRoot%" "notepad"');
  });

  it('keeps a full shortcut path', () => {
    const shortcut = 'C:\\Users\\Trey\\Desktop\\Jarvis.lnk';
    assert.equal(
      windowsStartCommand(shortcut),
      'start "" /D "%SystemRoot%" "C:\\Users\\Trey\\Desktop\\Jarvis.lnk"',
    );
  });

  it('rejects empty or shell-meta names', () => {
    assert.throws(() => sanitizeWindowsStartTarget(''));
    assert.throws(() => sanitizeWindowsStartTarget('game & calc'));
  });

  it('detects Jarvis launch names', () => {
    assert.equal(isJarvisAppName('Jarvis'), true);
    assert.equal(isJarvisAppName('World of Tanks'), false);
  });
});
