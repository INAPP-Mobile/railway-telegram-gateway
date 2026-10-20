import { TelegramError } from 'telegraf';

export interface RateLimiterOptions {
  /** Global sustained sends/second per bot (Telegram hard cap is 30/s; 29 keeps headroom). */
  globalRatePerSec?: number;
  /** Sustained sends/second per (bot, chat). Telegram sustained cap is 1/s for most chats. */
  chatRatePerSec?: number;
  /** Cap on sends per chat inside the sliding window (Telegram resets a 20–30 message window). */
  chatWindowCap?: number;
  /** Sliding window length applied by chatWindowCap, in ms. */
  chatWindowMs?: number;
  /** Retry budget after a 429. */
  maxRetries?: number;
  /** Cap on a single retry_after sleep, in ms (Telegram may advertise up to 300s+ for long bans). */
  maxRetryAfterMs?: number;
  /** Optional clock override for tests. */
  now?: () => number;
  /** Optional sleep override (tests drive it together with a fake `now`). */
  sleep?: (ms: number) => Promise<void>;
}

export interface RateLimitedSendOptions {
  /** Give up waiting for capacity after this long. */
  timeoutMs?: number;
}

const isTelegramError = (e: unknown): e is TelegramError => e instanceof TelegramError;

/**
 * Token bucket: at most `rate` requests start per second on average.
 * Capacity 1 means at most one outstanding request — no stacking in flight beyond the cap.
 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private rate: number,
    private capacity: number,
    private now: () => number,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  private refill(): void {
    const nowValue = this.now();
    const elapsed = (nowValue - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
      this.lastRefill = nowValue;
    }
  }

  /** How long until a token is available, in ms (0 if available now). */
  waitMs(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return ((1 - this.tokens) / this.rate) * 1000;
  }

  take(): void {
    this.refill();
    this.tokens -= 1;
  }
}

/**
 * Telegram send limiter, single-process (matches the single-replica + sticky-sessions target):
 *  - global per-bot token bucket (~29/s sustained)
 *  - per-(bot,chat) token bucket (~1/s sustained)
 *  - sliding window: at most `chatWindowCap` sends per chat in `chatWindowMs`
 *  - 429-aware: on HTTP 429 freezes that bot's pipeline for `retry_after` (capped at maxRetryAfterMs)
 *    and retries, up to `maxRetries`
 *
 * Waiting is cooperative: sendOnce() yields while a budget is unavailable, so concurrent sends
 * queue instead of hammering the API. If we scale beyond one replica this state must move to a
 * shared store — see doc/multi-replica.md.
 */
export class BotSendRateLimiter {
  private opts: {
    globalRatePerSec: number;
    chatRatePerSec: number;
    chatWindowCap: number;
    chatWindowMs: number;
    maxRetries: number;
    maxRetryAfterMs: number;
  };
  private now: () => number;
  private wait: (ms: number) => Promise<void>;

  private globalBuckets = new Map<string, TokenBucket>();
  private chatBuckets = new Map<string, TokenBucket>();
  private chatWindows = new Map<string, number[]>();
  private frozenUntil = new Map<string, number>();

  constructor(options: RateLimiterOptions = {}) {
    this.opts = {
      globalRatePerSec: options.globalRatePerSec ?? 29,
      chatRatePerSec: options.chatRatePerSec ?? 1,
      chatWindowCap: options.chatWindowCap ?? 20,
      chatWindowMs: options.chatWindowMs ?? 120_000,
      maxRetries: options.maxRetries ?? 3,
      maxRetryAfterMs: options.maxRetryAfterMs ?? 60_000,
    };
    this.now = options.now ?? Date.now;
    this.wait = options.sleep
      ? (ms: number) => options.sleep!(ms)
      : (ms: number) =>
          new Promise((resolve) => {
            if (ms <= 0) return resolve();
            return setTimeout(resolve, ms);
          });
  }

  private chatKey(botId: string, chatId: number | string): string {
    return `${botId}:${chatId}`;
  }

  private makeGlobalBucket(botId: string): TokenBucket {
    const bucket = new TokenBucket(this.opts.globalRatePerSec, 1, this.now);
    this.globalBuckets.set(botId, bucket);
    return bucket;
  }

  private makeChatBucket(key: string): TokenBucket {
    const bucket = new TokenBucket(this.opts.chatRatePerSec, 1, this.now);
    this.chatBuckets.set(key, bucket);
    return bucket;
  }

  /** How long until the chat's sliding window has room, in ms (0 if room now). */
  private chatWindowWaitMs(key: string): number {
    const nowValue = this.now();
    const cutoff = nowValue - this.opts.chatWindowMs;
    let window = this.chatWindows.get(key);
    if (window) {
      while (window.length > 0 && (window[0] as number) <= cutoff) window.shift();
    } else {
      window = [];
    }
    this.chatWindows.set(key, window);
    if (window.length >= this.opts.chatWindowCap) {
      const oldest = window[0] as number;
      return Math.max(0, oldest + this.opts.chatWindowMs - nowValue);
    }
    return 0;
  }

  private recordChatSend(key: string): void {
    const window = this.chatWindows.get(key) ?? [];
    window.push(this.now());
    this.chatWindows.set(key, window);
  }

  /**
   * Serialize one send for (botId, chatId) behind the global and chat budgets, then send it.
   * - Waits (not rejects) while budgets are unavailable, up to `timeoutMs`
   * - On 429: honors `retry_after` (capped) for the whole bot and retries, up to `maxRetries`
   * - Non-429 Telegram errors and throws from `fn` propagate unchanged
   */
  async sendOnce<S>(
    botId: string,
    chatId: number | string | undefined,
    fn: () => Promise<S>,
    options: RateLimitedSendOptions = {},
  ): Promise<S> {
    const timeoutMs = options.timeoutMs ?? 300_000; // default queue budget: a 300-chat batch drains in ~300s at 1/s/chat
    const startedAt = this.now();
    const key = chatId !== undefined && chatId !== null ? this.chatKey(botId, chatId) : undefined;

    let retriesRemaining = this.opts.maxRetries;
    for (;;) {
      if (this.now() - startedAt > timeoutMs) {
        throw new Error(`send timed out waiting for Telegram rate budget (bot=${botId})`);
      }

      const globalBucket = this.globalBuckets.get(botId) ?? this.makeGlobalBucket(botId);
      const freezeWait = Math.max(0, (this.frozenUntil.get(botId) ?? 0) - this.now());
      const globalWait = Math.max(globalBucket.waitMs(), freezeWait);
      const chatBucket = key ? this.chatBuckets.get(key) ?? this.makeChatBucket(key) : undefined;
      const chatWindowWait = key ? this.chatWindowWaitMs(key) : 0;

      const waitMs = Math.max(globalWait, chatWindowWait, chatBucket ? chatBucket.waitMs() : 0);
      if (waitMs > 0) {
        // yield while waiting; a 429 freeze may extend the wait while other send tasks queue
        await this.wait(Math.max(10, waitMs));
        continue;
      }

      globalBucket.take();
      chatBucket?.take();
      if (key) this.recordChatSend(key);

      try {
        return await fn();
      } catch (e) {
        if (!isTelegramError(e) || e.code !== 429) throw e;
        if (retriesRemaining <= 0) throw e;
        retriesRemaining -= 1;
        const retryAfterSec = (e.parameters?.retry_after as number | undefined) ?? 5;
        const freezeMs = Math.min(Math.max(retryAfterSec, 0) * 1000, this.opts.maxRetryAfterMs);
        this.frozenUntil.set(botId, Math.max(this.frozenUntil.get(botId) ?? 0, this.now() + freezeMs));
        await this.wait(freezeMs);
      }
    }
  }
}
