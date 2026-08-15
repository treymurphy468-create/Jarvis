import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOOPBACK_HOST, SERVER, WS_URL, VITE_URL } from './config.js';

describe('loopback boot URLs', () => {
  it('uses 127.0.0.1 so a new network DNS cannot hijack localhost', () => {
    assert.equal(LOOPBACK_HOST, '127.0.0.1');
    assert.equal(SERVER, 'http://127.0.0.1:3847');
    assert.equal(WS_URL, 'ws://127.0.0.1:3847/ws/events');
    assert.equal(VITE_URL, 'http://127.0.0.1:5173');
  });
});
