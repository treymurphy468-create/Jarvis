import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseApiError, clearVoiceLimited } from './parseApiError.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

beforeEach(() => {
  globalThis.sessionStorage = new MemoryStorage();
  clearVoiceLimited();
});

describe('parseApiError', () => {
  it('maps fetch failures after a network change', () => {
    const info = parseApiError('Failed to fetch');
    assert.equal(info.code, 'offline');
    assert.equal(info.retryable, true);
  });

  it('maps ERR_NETWORK_CHANGED', () => {
    const info = parseApiError('net::ERR_NETWORK_CHANGED');
    assert.equal(info.code, 'offline');
  });

  it('still detects rate limits', () => {
    const info = parseApiError(JSON.stringify({
      error: { message: 'Rate limit exceeded', code: 'rate_limit_exceeded' },
    }));
    assert.equal(info.code, 'rate_limit');
  });
});
