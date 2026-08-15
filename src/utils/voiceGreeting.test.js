import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickWittyGreeting, shouldPlayGreeting } from './voiceGreeting.js';

describe('shouldPlayGreeting', () => {
  it('plays on the first voice start of a session', () => {
    assert.equal(shouldPlayGreeting({
      bootId: 'a',
      lastBootId: 'a',
      isFirstVoiceStart: true,
      recoveringFromRateLimit: false,
    }), true);
  });

  it('plays after a server reboot', () => {
    assert.equal(shouldPlayGreeting({
      bootId: 'b',
      lastBootId: 'a',
      isFirstVoiceStart: false,
      recoveringFromRateLimit: false,
    }), true);
  });

  it('plays after recovering from a rate limit', () => {
    assert.equal(shouldPlayGreeting({
      bootId: 'a',
      lastBootId: 'a',
      isFirstVoiceStart: false,
      recoveringFromRateLimit: true,
    }), true);
  });

  it('stays quiet on a later start of the same boot', () => {
    assert.equal(shouldPlayGreeting({
      bootId: 'a',
      lastBootId: 'a',
      isFirstVoiceStart: false,
      recoveringFromRateLimit: false,
    }), false);
  });
});

describe('pickWittyGreeting', () => {
  it('returns one of the canned greetings', () => {
    const greeting = pickWittyGreeting();
    assert.equal(typeof greeting, 'string');
    assert.ok(greeting.length > 0);
  });
});
