import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Outbox } from './outbox';
import { OutboxWorker } from './outbox-worker';
import { BotGoneError } from './errors';
import type { OutboxRecord, OutboxStatusEvent } from './types';

/** Deterministic clock shared by the Outbox and the worker in worker tests. */
function makeClock(startMs: number = 1_000_000) {
  let t = startMs;
  const now = () => t;
  const sleep = (ms: number) => {
    t += Math.max(0, ms);
    return Promise.resolve();
  };
  const advance = (ms: number) => {
    t += ms;
  };
  return { now, sleep, advance };
}

describe('Outbox durable persistence', () => {
  let box: Outbox;
  beforeEach(() => {
    box = new Outbox(':memory:');
  });
  afterEach(() => {
    box.close();
  });

  it('enqueue returns a new id and stores the row as queued', () => {
    const id = box.enqueue({ botId: 'b1', chatId: 42, text: 'hello' });
    expect(id).toBeGreaterThan(0);
    const rec = box.get(id);
    expect(rec).toBeDefined();
    expect(rec!.botId).toBe('b1');
    expect(rec!.chatId).toBe('42'); // stored as TEXT
    expect(rec!.text).toBe('hello');
    expect(rec!.status).toBe('queued');
    expect(rec!.attempts).toBe(0);
  });

  it('claimDue marks picked rows pending and returns them FIFO, honoring the limit', () => {
    const now = Date.now();
    box.enqueue({ botId: 'b1', chatId: 1, text: 'a' });
    box.enqueue({ botId: 'b1', chatId: 1, text: 'b' });
    box.enqueue({ botId: 'b1', chatId: 1, text: 'c' });
    const due = box.claimDue(2, now + 60_000);
    expect(due).toHaveLength(2);
    expect(box.get(due[0].id)!.status).toBe('pending');
    expect(box.get(due[1].id)!.status).toBe('pending');
  });

  it('release drops a pending row back to queued', () => {
    const id = box.enqueue({ botId: 'b1', chatId: 1, text: 'x' });
    box.claimDue(1, Date.now() + 60_000);
    expect(box.get(id)!.status).toBe('pending');
    box.release(id);
    expect(box.get(id)!.status).toBe('queued');
  });

  it('reschedule bumps attempt count, sets next_try_at, and records the error', () => {
    const now = Date.now();
    const id = box.enqueue({ botId: 'b1', chatId: 1, text: 'x' });
    box.claimDue(1, now + 60_000);
    box.reschedule(id, now + 61_000, 'oops');
    const rec = box.get(id)!;
    expect(rec.attempts).toBe(1);
    expect(rec.status).toBe('queued');
    expect(rec.nextTryAt).toBe(now + 61_000);
    expect(rec.error).toBe('oops');
  });

  it('markSent clears error and sets status', () => {
    const id = box.enqueue({ botId: 'b1', chatId: 1, text: 'x' });
    box.claimDue(1, Date.now() + 60_000);
    box.markSent(id);
    const rec = box.get(id)!;
    expect(rec.status).toBe('sent');
    expect(rec.error).toBeNull();
  });

  it('markFailed sets status and records error', () => {
    const id = box.enqueue({ botId: 'b1', chatId: 1, text: 'x' });
    box.claimDue(1, Date.now() + 60_000);
    box.markFailed(id, 'boom');
    const rec = box.get(id)!;
    expect(rec.status).toBe('failed');
    expect(rec.error).toBe('boom');
  });

  it('resetPending recovers rows left over from a crash', () => {
    const id = box.enqueue({ botId: 'b1', chatId: 1, text: 'x' });
    box.claimDue(1, Date.now() + 60_000);
    expect(box.get(id)!.status).toBe('pending');
    const n = box.resetPending();
    expect(n).toBe(1);
    expect(box.get(id)!.status).toBe('queued');
  });

  it('statusCounts reflects current DB state', () => {
    const a = box.enqueue({ botId: 'b1', chatId: 1, text: 'a' });
    const b = box.enqueue({ botId: 'b1', chatId: 1, text: 'b' });
    box.claimDue(2, Date.now() + 60_000);
    box.markSent(a);
    box.markFailed(b, 'err');
    const c = box.statusCounts();
    expect(c.sent).toBeGreaterThanOrEqual(1);
    expect(c.failed).toBeGreaterThanOrEqual(1);
  });
});

describe('OutboxWorker delivery', () => {
  let box: Outbox;
  let events: OutboxStatusEvent[];
  let clock: ReturnType<typeof makeClock>;

  beforeEach(() => {
    clock = makeClock();
    box = new Outbox(':memory:', clock.now);
    events = [];
  });
  afterEach(() => {
    box.close();
  });

  it('sends a message once and marks it sent', async () => {
    const wid = box.enqueue({ botId: 'b1', chatId: 7, text: 'hi' });
    const sentChats: Array<number | string> = [];
    const worker = new OutboxWorker(
      box,
      async (rec) => {
        sentChats.push(rec.chatId);
        return true;
      },
      (e) => events.push(e),
      {
        clock: clock.now,
        sleep: clock.sleep,
        pollIntervalMs: 0,
        maxAttempts: 5,
        baseDelayMs: 1000,
      },
    );
    await worker.drainBatch();
    expect(sentChats).toEqual(['7']);
    expect(box.get(wid)!.status).toBe('sent');
    expect(events).toContainEqual({ botId: 'b1', messageId: wid, status: 'sent' });
  });

  it('retries on transient failure with backoff, then succeeds', async () => {
    const wid = box.enqueue({ botId: 'b1', chatId: 7, text: 'hi' });
    let attempts = 0;
    const worker = new OutboxWorker(
      box,
      async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return true;
      },
      (e) => events.push(e),
      {
        clock: clock.now,
        sleep: clock.sleep,
        maxAttempts: 5,
        baseDelayMs: 1000,
        baseFactor: 2,
      },
    );
    await worker.drainBatch();
    const afterFirst = box.get(wid)!;
    expect(afterFirst.status).toBe('queued');
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.nextTryAt).toBeGreaterThanOrEqual(clock.now());

    clock.advance(5000); // past the first backoff (2^1 * 1000ms = 2000ms)
    await worker.drainBatch();
    expect(box.get(wid)!.status).toBe('sent');
    expect(attempts).toBe(2);
  });

  it('gives up after maxAttempts and marks failed', async () => {
    const wid = box.enqueue({ botId: 'b1', chatId: 7, text: 'hi' });
    let attempts = 0;
    const worker = new OutboxWorker(
      box,
      async () => {
        attempts += 1;
        throw new Error('always fails');
      },
      (e) => events.push(e),
      {
        clock: clock.now,
        sleep: clock.sleep,
        maxAttempts: 3,
        baseDelayMs: 10,
        baseFactor: 1,
      },
    );
    for (let i = 0; i < 3; i++) {
      clock.advance(50); // ensure next_try_at is in the past
      await worker.drainBatch();
      if (box.get(wid)!.status === 'failed') break;
    }
    expect(attempts).toBe(3);
    expect(box.get(wid)!.status).toBe('failed');
    const failed = events.find((e) => e.messageId === wid && e.status === 'failed');
    expect(failed).toBeDefined();
    expect(failed!.error).toMatch(/always fails/);
  });

  it('dead-letters immediately when the bot has been deregistered', async () => {
    const wid = box.enqueue({ botId: 'b1', chatId: 7, text: 'hi' });
    let attempts = 0;
    const worker = new OutboxWorker(
      box,
      async () => {
        attempts += 1;
        throw new BotGoneError('b1');
      },
      (e) => events.push(e),
      {
        clock: clock.now,
        sleep: clock.sleep,
        maxAttempts: 5,
        baseDelayMs: 1000,
      },
    );
    await worker.drainBatch();
    expect(attempts).toBe(1);
    const rec = box.get(wid)!;
    expect(rec.status).toBe('failed');
    expect(rec.error).toMatch(/no longer registered/);
    const failed = events.find((e) => e.messageId === wid && e.status === 'failed');
    expect(failed).toBeDefined();
    // And it must NOT be rescheduled: a fresh claim should find nothing.
    clock.advance(10_000);
    expect(box.claimDue(1, clock.now())).toHaveLength(0);
  });

  it('retries (does not dead-letter) when the bot is merely not attached yet', async () => {
    const wid = box.enqueue({ botId: 'b1', chatId: 7, text: 'hi' });
    const worker = new OutboxWorker(
      box,
      async () => {
        throw new Error('Bot b1 not attached yet');
      },
      (e) => events.push(e),
      {
        clock: clock.now,
        sleep: clock.sleep,
        maxAttempts: 5,
        baseDelayMs: 1000,
      },
    );
    await worker.drainBatch();
    const rec = box.get(wid)!;
    expect(rec.status).toBe('queued');
    expect(rec.attempts).toBe(1);
    expect(events.some((e) => e.status === 'failed')).toBe(false);
  });

  it('does not claim before next_try_at', async () => {
    const wid = box.enqueue({ botId: 'b1', chatId: 7, text: 'hi' });
    const worker = new OutboxWorker(
      box,
      async () => {
        throw new Error('first attempt only');
      },
      () => void 0,
      {
        clock: clock.now,
        sleep: clock.sleep,
        maxAttempts: 5,
        baseDelayMs: 60_000,
      },
    );
    await worker.drainBatch();
    expect(box.get(wid)!.attempts).toBe(1);
    expect(box.get(wid)!.status).toBe('queued');
    expect(box.claimDue(10, clock.now())).toHaveLength(0);
  });
});
