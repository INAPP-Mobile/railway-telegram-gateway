import { describe, it, expect } from 'vitest';
import { TelegramError } from 'telegraf';
import { BotSendRateLimiter } from '../src/rate-limiter';

/** Fake clock driver: advance the simulated clock when the limiter waits. */
function makeClock() {
  let t = 1_000_000; // arbitrary non-zero epoch
  const now = () => t;
  const sleep = (ms: number) => {
    t += ms;
    return Promise.resolve();
  };
  const advance = (ms: number) => {
    t += ms;
  };
  return { now, sleep, advance, get: now };
}

const err429 = (retryAfterSec: number) =>
  new TelegramError(
    { error_code: 429, description: 'Too Many Requests: retry later', parameters: { retry_after: retryAfterSec } },
    {} as never,
  );

describe('BotSendRateLimiter', () => {
  it('sends immediately when budgets are free', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({ now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const result = await limiter.sendOnce('bot1', 1, async () => {
      calls += 1;
      return 'sent';
    });
    expect(result).toBe('sent');
    expect(calls).toBe(1);
  });

  it('paces a second same-chat send at ~1/s', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      chatRatePerSec: 1,
      globalRatePerSec: 100,
    });
    await limiter.sendOnce('bot1', 1, async () => 'a');
    // first token consumed → second send must wait ~1000ms before it goes out
    const t0 = clock.get();
    const p2 = limiter.sendOnce('bot1', 1, async () => 'b');
    // drive the loop: wait() yields; fake sleep advanced the clock inside sleep()
    const sentAt = clock.get();
    expect(sentAt - t0).toBeGreaterThanOrEqual(900);
    expect(await p2).toBe('b');
  });

  it('enforces the per-chat sliding window cap (20 per window)', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1000,
      chatWindowCap: 20,
      chatWindowMs: 120_000,
    });
    // burn 20 chat-window slots (bucket stays ahead by using a high chat rate)
    for (let i = 0; i < 20; i++) {
      // give each send a 11ms gap so the 1000/s bucket always has room
      clock.advance(11);
      await limiter.sendOnce('bot1', 1, async () => 'msg');
    }
    // slot 21: window full → sendOnce must hold until the oldest slot expires at t0+120s
    const t0 = clock.get();
    await limiter.sendOnce('bot1', 1, async () => 'blocked');
    expect(clock.get() - t0).toBeGreaterThanOrEqual(119_000);
  });

  it('honors retry_after on 429, freezes the bot, then retries', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1000,
      maxRetries: 2,
      maxRetryAfterMs: 60_000,
    });
    let attempts = 0;
    const fn = async () => {
      attempts += 1;
      if (attempts === 1) throw err429(30);
      return 'ok';
    };
    const t0 = clock.get();
    const result = await limiter.sendOnce('bot1', 1, fn);
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
    // ~retry_after(30s) + at least one wait-loop tick
    expect(clock.get() - t0).toBeGreaterThanOrEqual(30_000);
  });

  it('caps the retry_after freeze at maxRetryAfterMs', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1000,
      maxRetries: 1,
      maxRetryAfterMs: 5_000,
    });
    let attempts = 0;
    const fn = async () => {
      attempts += 1;
      if (attempts === 1) throw err429(300); // Telegram asks for 5 minutes
      return 'ok';
    };
    const t0 = clock.get();
    await limiter.sendOnce('bot1', 1, fn);
    // must NOT wait 300s; capped at 5s + tick
    expect(clock.get() - t0).toBeLessThan(6_000);
    expect(attempts).toBe(2);
  });

  it('gives up after maxRetries on repeated 429 and throws the last one', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1000,
      maxRetries: 2,
    });
    const last = err429(1);
    const fn = async () => {
      throw last;
    };
    await expect(limiter.sendOnce('bot1', 1, fn)).rejects.toBe(last);
  });

  it('does not retry non-429 Telegram errors', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1000,
      maxRetries: 3,
    });
    let attempts = 0;
    const bad = new TelegramError({ error_code: 403, description: 'chat not found' }, {} as never);
    const fn = async () => {
      attempts += 1;
      throw bad;
    };
    await expect(limiter.sendOnce('bot1', -1001, fn)).rejects.toBe(bad);
    expect(attempts).toBe(1);
  });

  it('times out instead of waiting forever when the budget is exhausted', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1, // 1 token/s chat bucket
    });
    await limiter.sendOnce('bot1', 1, async () => 'first');
    // second send needs ~1000ms of refill, but the caller only gave 500ms
    await expect(
      limiter.sendOnce('bot1', 1, async () => 'never', { timeoutMs: 500 }),
    ).rejects.toThrow(/timed out/);
  });

  it('queues concurrent sends for one chat at ~1/s each', async () => {
    const clock = makeClock();
    const limiter = new BotSendRateLimiter({
      now: clock.now,
      sleep: clock.sleep,
      globalRatePerSec: 1000,
      chatRatePerSec: 1,
      chatWindowCap: 100,
    });
    const tasks = [1, 2, 3, 4, 5].map((n) => limiter.sendOnce('bot1', 42, async () => n));
    const results = await Promise.all(tasks);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    // 5 sends at 1/s cap (capacity 1): at least 1s of waiting must be consumed (2 waves)
    expect(clock.get()).toBeGreaterThanOrEqual(1_000_000 + 1_500);
  });
});
