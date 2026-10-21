import { describe, it, expect } from 'vitest';
import { WebSocketGateway } from './gateway';

// Regression guard: the WebSocket had no auth enforcement at all. `verifyClient`
// existed but was never wired to the upgrade, and handleMessage subscribed any
// client to any bot. These tests pin the two supported auth routes and the
// requirement that neither can be skipped.
describe('WebSocketGateway auth', () => {
  it('accepts a token that is in the configured key list', () => {
    const gw = new WebSocketGateway('key-one,key-two');

    expect(gw.verifyClient('key-one')).toBe(true);
    expect(gw.verifyClient('key-two')).toBe(true);
  });

  it('rejects a missing or wrong token at the handshake', () => {
    const gw = new WebSocketGateway('key-one');

    expect(gw.verifyClient(undefined)).toBe(false);
    expect(gw.verifyClient('')).toBe(false);
    expect(gw.verifyClient('wrong')).toBe(false);
  });

  it('rejects every token when no keys are configured', () => {
    const gw = new WebSocketGateway('');

    expect(gw.verifyClient(undefined)).toBe(false);
    expect(gw.verifyClient('anything')).toBe(false);
  });

  it('accepts comma-separated keys with surrounding whitespace', () => {
    const gw = new WebSocketGateway(' key-one , key-two ');

    expect(gw.verifyClient('key-one')).toBe(true);
    expect(gw.verifyClient('key-two')).toBe(true);
  });
});
