import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('companion HUD chrome', () => {
  it('puts the status light immediately left of the close control', () => {
    const source = readFileSync(join(root, 'src/windows/CompanionWindow.jsx'), 'utf8');
    const headerRight = source.match(/className="companion-header-right"[\s\S]*?<\/div>/);
    assert.ok(headerRight, 'expected companion-header-right');
    const dotAt = headerRight[0].indexOf('status-dot');
    const closeAt = headerRight[0].indexOf('companion-close');
    assert.ok(dotAt >= 0 && closeAt >= 0, 'expected status-dot and companion-close');
    assert.ok(dotAt < closeAt, 'status light must sit to the left of the red X');
  });

  it('keeps the close control always red, not hover-only', () => {
    const css = readFileSync(join(root, 'src/styles/global.css'), 'utf8');
    const closeBlock = css.match(/\.companion-close \{[\s\S]*?\}/);
    assert.ok(closeBlock, 'expected .companion-close rule');
    assert.match(closeBlock[0], /background:\s*#e81123/i);
    assert.doesNotMatch(closeBlock[0], /background:\s*transparent/);
  });
});

describe('boot windows', () => {
  it('does not show the Artifacts window on load', () => {
    const main = readFileSync(join(root, 'electron/main.cjs'), 'utf8');
    assert.match(main, /title:\s*'Jarvis Artifacts'[\s\S]*?show:\s*false/);
    assert.match(main, /loadWithRetry\(artifactWindow, .*\{ showOnLoad: false \}/);
    assert.doesNotMatch(main, /artifactWindow\.show\(\)/);
  });
});
