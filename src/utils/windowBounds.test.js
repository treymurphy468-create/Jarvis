import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { bottomRightBounds, placeJarvisWindows } = require('../../electron/windowBounds.cjs');

describe('placeJarvisWindows', () => {
  it('pins the companion to the bottom-right of the work area, including a non-zero origin', () => {
    const workArea = { x: 1920, y: 0, width: 1920, height: 1080 };
    const companion = bottomRightBounds(workArea, 320, 420, 20);
    assert.equal(companion.x, 1920 + 1920 - 320 - 20);
    assert.equal(companion.y, 1080 - 420 - 20);
  });

  it('sits artifacts to the left of the companion, still bottom-aligned', () => {
    const workArea = { x: 0, y: 0, width: 1920, height: 1080 };
    const { companion, artifact } = placeJarvisWindows(workArea);
    assert.equal(companion.x, 1920 - 320 - 20);
    assert.equal(companion.y, 1080 - 420 - 20);
    assert.equal(artifact.x, companion.x - 520 - 20);
    assert.equal(artifact.y, 1080 - 640 - 20);
    assert.ok(artifact.x + artifact.width <= companion.x);
  });
});
