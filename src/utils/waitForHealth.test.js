import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { waitForHealth } from './waitForHealth.js';

describe('waitForHealth', () => {
  it('returns health JSON when the server answers', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ status: 'ok', bootId: 'boot-1' }),
    });
    try {
      const health = await waitForHealth('http://127.0.0.1:3847', { attempts: 1 });
      assert.equal(health.bootId, 'boot-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retries then returns null if the server never comes up', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('ECONNREFUSED');
    };
    try {
      const health = await waitForHealth('http://127.0.0.1:3847', { attempts: 3, delayMs: 1 });
      assert.equal(health, null);
      assert.equal(calls, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('stops immediately when aborted', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error('ECONNREFUSED');
    };
    const controller = new AbortController();
    controller.abort();
    try {
      const health = await waitForHealth('http://127.0.0.1:3847', {
        attempts: 5,
        delayMs: 1,
        signal: controller.signal,
      });
      assert.equal(health, null);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
