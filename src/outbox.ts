import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { OutboxRecord, OutboxStatus } from './types';

export interface EnqueueInput {
  botId: string;
  chatId: number | string;
  text: string;
  options?: Record<string, unknown> | null;
}

interface Row {
  id: number;
  bot_id: string;
  chat_id: string;
  text: string;
  options: string | null;
  status: OutboxStatus;
  attempts: number;
  error: string | null;
  created_at: string;
  next_try_at: number;
  updated_at: number;
}

function toRecord(row: Row): OutboxRecord {
  let options: Record<string, unknown> | null = null;
  if (row.options) {
    try {
      options = JSON.parse(row.options) as Record<string, unknown>;
    } catch {
      options = null;
    }
  }
  return {
    id: row.id,
    botId: row.bot_id,
    chatId: row.chat_id,
    text: row.text,
    options,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    createdAt: row.created_at,
    nextTryAt: row.next_try_at,
  };
}

/**
 * Durable send outbox backed by SQLite (same DB file as the bot registry).
 *
 * This is what makes outbound messages survive a redeploy: a send is written
 * here FIRST (durably) and only delivered later by the OutboxWorker, so an
 * in-flight message is never lost when the process is recycled. Writes are
 * the only state the client sees; the async ack goes over the outbox event.
 *
 * Single-writer by design (one open handle per process), matching BotStore.
 */
export class Outbox {
  private db: DatabaseSync;
  private now: () => number;

  constructor(path: string, now?: () => number) {
    this.now = now ?? Date.now;
    if (path !== ':memory:') {
      const dir = dirname(path);
      if (dir && dir !== '.' && dir !== '/') {
        mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outbox (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_id      TEXT NOT NULL,
        chat_id     TEXT NOT NULL,
        text        TEXT NOT NULL,
        options     TEXT,
        status      TEXT NOT NULL DEFAULT 'queued',
        attempts    INTEGER NOT NULL DEFAULT 0,
        error       TEXT,
        created_at  TEXT NOT NULL,
        next_try_at INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox (status, next_try_at);
    `);
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* idempotent */
    }
  }

  /** Durably enqueue a send. Returns the new message id. This is the ack to the caller. */
  enqueue(input: EnqueueInput): number {
    const nowMs = this.now();
    const res = this.db
      .prepare(
        `INSERT INTO outbox (bot_id, chat_id, text, options, status, attempts, error, created_at, next_try_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', 0, NULL, ?, ?, ?)`,
      )
      .run(
        input.botId,
        String(input.chatId),
        input.text,
        input.options ? JSON.stringify(input.options) : null,
        new Date(nowMs).toISOString(),
        nowMs,
        nowMs,
      );
    return Number(res.lastInsertRowid);
  }

  /** Atomically claim up to `limit` due messages, marking them `pending`. */
  claimDue(limit: number, nowMs: number = this.now()): OutboxRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id FROM outbox
         WHERE status = 'queued' AND next_try_at <= ?
         ORDER BY next_try_at ASC, id ASC
         LIMIT ?`,
      )
      .all(nowMs, limit) as Array<{ id: number }>;
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    const mark = this.db.prepare(
      `UPDATE outbox SET status = 'pending', updated_at = ? WHERE status = 'queued' AND id IN (${ids
        .map(() => '?')
        .join(',')})`,
    );
    mark.run(nowMs, ...ids);

    const fetch = this.db.prepare(
      `SELECT * FROM outbox WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY next_try_at ASC, id ASC`,
    );
    const fetched = fetch.all(...ids) as unknown as Row[];
    return fetched.map(toRecord);
  }

  /** Drop a `pending` claim without delivering (worker aborted / crashed before send). */
  release(id: number, nowMs: number = this.now()): void {
    this.db.prepare(`UPDATE outbox SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'pending'`).run(nowMs, id);
  }

  markSent(id: number, nowMs: number = this.now()): void {
    this.db.prepare(`UPDATE outbox SET status = 'sent', error = NULL, updated_at = ? WHERE id = ?`).run(nowMs, id);
  }

  /**
   * Re-queue a failed attempt with a backoff (status back to `queued`, bump attempts).
   * Returns the new attempt count.
   */
  reschedule(id: number, nextTryAt: number, error: string | null, nowMs: number = this.now()): number {
    this.db
      .prepare(
        `UPDATE outbox
         SET status = 'queued', attempts = attempts + 1, error = ?, next_try_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(error, nextTryAt, nowMs, id);
    const row = this.db.prepare('SELECT attempts FROM outbox WHERE id = ?').get(id) as
      | { attempts: number }
      | undefined;
    return row?.attempts ?? 1;
  }

  markFailed(id: number, error: string, nowMs: number = this.now()): void {
    this.db.prepare(`UPDATE outbox SET status = 'failed', error = ?, updated_at = ? WHERE id = ?`).run(error, nowMs, id);
  }

  get(id: number): OutboxRecord | undefined {
    const row = this.db.prepare('SELECT * FROM outbox WHERE id = ?').get(id) as Row | undefined;
    return row ? toRecord(row) : undefined;
  }

  /**
   * Reset rows left in `pending` by a crashed worker (claims that never
   * dispatched) back to `queued`, due now. Returns how many were reset.
   * Idempotent; safe to call on every boot.
   */
  resetPending(nowMs: number = this.now()): number {
    const res = this.db
      .prepare(`UPDATE outbox SET status = 'queued', next_try_at = ?, updated_at = ? WHERE status = 'pending'`)
      .run(nowMs, nowMs);
    return Number(res.changes);
  }

  statusCounts(nowMs: number = this.now()): Record<OutboxStatus, number> {
    const q = this.db.prepare('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status').all() as Array<{
      status: OutboxStatus;
      n: number;
    }>;
    const out: Record<OutboxStatus, number> = { queued: 0, pending: 0, sent: 0, failed: 0 };
    for (const r of q) out[r.status] = r.n;
    return out;
  }

  /** Delete terminal (sent/failed) rows older than the retention window. */
  pruneTerminal(olderThanMs: number, nowMs: number = this.now()): number {
    const res = this.db
      .prepare(`DELETE FROM outbox WHERE status IN ('sent','failed') AND created_at < ?`)
      .run(new Date(nowMs - olderThanMs).toISOString());
    return Number(res.changes);
  }
}
