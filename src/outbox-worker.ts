import { Outbox } from './outbox';
import { BotGoneError } from './errors';
import type { OutboxStatusEvent, OutboxRecord } from './types';

export interface OutboxWorkerOptions {
  pollIntervalMs?: number;
  batchLimit?: number;
  /** Give up after this many total delivery attempts. */
  maxAttempts?: number;
  /** Backoff for non-429 failures: baseDelayMs * baseFactor^attemptsSoFar. */
  baseDelayMs?: number;
  baseFactor?: number;
  maxDelayMs?: number;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

/** Telegram 429 "retry_after" (seconds) carried in Telegraf's error.parameters. */
function parseRetryAfterMs(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const params = e.parameters as Record<string, unknown> | undefined;
    if (params && typeof params.retry_after === 'number') {
      return (params.retry_after as number) * 1000;
    }
  }
  return undefined;
}

function messageOf(err: unknown): string {
  return err && (err as { message?: string }).message ? (err as Error).message : 'send failed';
}

/**
 * Single-drain background worker for the durable outbox.
 *
 * Per the Railway-redeploy insight, sends are written to the durable outbox
 * FIRST (survives a redeploy) and delivered here by a background worker that
 * paces them:
 *  - claim due messages in FIFO order and deliver them one at a time,
 *  - dispatch each through a `send(rec)` callback the caller supplies —
 *    in production that callback routes through
 *    `BotSendRateLimiter.sendOnce` (which enforces the global ~29/s and
 *    per-chat ~1/s budgets and freezes the bot on 429 using retry_after),
 *  - success → `sent`; failure → re-queue with backoff; give up after
 *    `maxAttempts` → `failed`,
 *  - a message whose bot has been deregistered is dead-lettered immediately
 *    (`failed`) rather than burning the retry budget,
 *  - publish an `outbox` event to any WS subscribers of the bot so senders get
 *    the async outcome.
 */
export class OutboxWorker {
  private outbox: Outbox;
  private send: (rec: OutboxRecord) => Promise<unknown>;
  private notify: (event: OutboxStatusEvent) => void;
  private pollIntervalMs: number;
  private batchLimit: number;
  private maxAttempts: number;
  private baseDelayMs: number;
  private baseFactor: number;
  private maxDelayMs: number;
  private now: () => number;
  private sleep: (ms: number) => Promise<void>;
  private log: (msg: string) => void;
  private stopped = true;
  private active = false;

  constructor(
    outbox: Outbox,
    send: (rec: OutboxRecord) => Promise<unknown>,
    notify: (event: OutboxStatusEvent) => void,
    options: OutboxWorkerOptions = {},
  ) {
    this.outbox = outbox;
    this.send = send;
    this.notify = notify;
    this.pollIntervalMs = options.pollIntervalMs ?? 250;
    this.batchLimit = options.batchLimit ?? 32;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 30_000;
    this.baseFactor = options.baseFactor ?? 1.5;
    this.maxDelayMs = options.maxDelayMs ?? 300_000;
    this.now = options.clock ?? Date.now;
    this.sleep = options.sleep ?? ((ms: number) => new Promise((res) => setTimeout(res, ms)));
    this.log = options.log ?? (() => {});
  }

  /**
   * Call at boot (before start()): put rows left in `pending` by a crashed
   * worker back into `queued`, due now. Returns the number recovered.
   */
  recoverOrphans(nowMs: number = this.now()): number {
    const n = this.outbox.resetPending(nowMs);
    if (n > 0) this.log(`[outbox] recovered ${n} pending message(s) from a prior crash`);
    return n;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.loop();
  }

  /** Stop the poll loop. Resolves once the current drain (if any) finishes. */
  async stop(): Promise<void> {
    this.stopped = true;
    while (this.active) {
      await this.sleep(5);
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      let due = 0;
      this.active = true;
      try {
        due = await this.drainBatch();
      } catch (err) {
        this.log(`[outbox] drain error: ${messageOf(err)}`);
      } finally {
        this.active = false;
      }
      if (!this.stopped) await this.sleep(due > 0 ? 0 : this.pollIntervalMs);
    }
  }

  /** One drain cycle: claim due, deliver in FIFO order, persist outcomes. */
  async drainBatch(): Promise<number> {
    const nowMs = this.now();
    const batch = this.outbox.claimDue(this.batchLimit, nowMs);
    if (batch.length === 0) return 0;

    let delivered = 0;
    for (const rec of batch) {
      try {
        await this.send(rec);
        this.outbox.markSent(rec.id);
        this.emit(rec.botId, rec.id, 'sent');
        delivered += 1;
      } catch (err) {
        const attemptsSoFar = rec.attempts + 1; // include the attempt that just failed
        const msg = messageOf(err);

        // Bot explicitly deregistered — permanent, don't waste the retry budget.
        if (err instanceof BotGoneError) {
          const reason = `bot ${err.botId} is no longer registered`;
          this.outbox.markFailed(rec.id, reason);
          this.emit(rec.botId, rec.id, 'failed', reason);
          this.log(`[outbox] dead-lettered ${rec.id}: ${reason}`);
          continue;
        }

        if (attemptsSoFar >= this.maxAttempts) {
          this.outbox.markFailed(rec.id, msg);
          this.emit(rec.botId, rec.id, 'failed', msg);
          this.log(`[outbox] gave up on ${rec.id} after ${attemptsSoFar} attempts: ${msg}`);
          continue;
        }

        const retryAfter = parseRetryAfterMs(err);
        const backoff = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(this.baseFactor, rec.attempts));
        const delay = Math.max(retryAfter ?? 0, backoff);
        this.outbox.reschedule(rec.id, this.now() + delay, msg);
        const when = delay >= 1000 ? `${Math.round(delay / 1000)}s` : `${Math.round(delay)}ms`;
        this.log(
          `[outbox] rescheduling ${rec.id} (attempt ${attemptsSoFar}/${this.maxAttempts}) for +${when} — ${msg}`,
        );
      }
    }
    return delivered;
  }

  private emit(botId: string, messageId: number, status: 'sent' | 'failed' | 'queued', error?: string): void {
    const event: OutboxStatusEvent = { botId, messageId, status, ...(error ? { error } : {}) };
    try {
      this.notify(event);
    } catch {
      // notify must never crash the worker
    }
  }
}
