import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listeningPidsFromNetstat } from './listeningPids.js';

describe('listeningPidsFromNetstat', () => {
  it('reads Windows netstat LISTENING PIDs for Jarvis ports', () => {
    const text = [
      'TCP    127.0.0.1:3847    0.0.0.0:0    LISTENING    4412',
      'TCP    127.0.0.1:5173    0.0.0.0:0    LISTENING    4413',
      'TCP    127.0.0.1:33847   0.0.0.0:0    LISTENING    9999',
      'TCP    127.0.0.1:3847    127.0.0.1:9  ESTABLISHED  4412',
    ].join('\n');
    assert.deepEqual(listeningPidsFromNetstat(text, [3847, 5173]).sort(), [4412, 4413]);
  });

  it('reads Linux ss LISTEN PIDs including pid/name', () => {
    const text = 'tcp  0  0  127.0.0.1:3847  0.0.0.0:*  LISTEN  3041/node';
    assert.deepEqual(listeningPidsFromNetstat(text, [3847]), [3041]);
  });
});
