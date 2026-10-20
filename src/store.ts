import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BotConfig } from './types';

/**
 * SQLite persistence layer for the bot registry. Node 22 ships `node:sqlite`
 * as a core module (unflagged since 22.5) so we don't need native deps in the
 * alpine image.
 *
 * Single-writer by design — the process has exactly one open handle.
 * WAL mode is safe on a Railway volume (real filesystem, no overlayfs copy-up).
 */
export class BotStore {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      const dir = dirname(path);
      if (dir && dir !== '.' && dir !== '/') {
        mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bots (
        bot_id        TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        token         TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'active',
        user_id       INTEGER NOT NULL,
        registered_at TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
    `);
  }

  close(): void {
    try { this.db.close(); } catch { /* idempotent; DatabaseSync.close tolerates already-closed */ }
  }

  upsertBot(bot: BotConfig): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO bots (bot_id, name, token, status, user_id, registered_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (bot_id) DO UPDATE
         SET name = excluded.name,
             token = excluded.token,
             status = excluded.status,
             user_id = excluded.user_id,
             updated_at = excluded.updated_at`,
      )
      .run(
        bot.botId,
        bot.name ?? `bot-${bot.botId}`,
        bot.token,
        bot.status,
        bot.userId,
        bot.registeredAt.toISOString(),
        now,
      );
  }

  getBot(botId: string): BotConfig | undefined {
    const row = this.db.prepare('SELECT * FROM bots WHERE bot_id = ?').get(botId) as
      | {
          bot_id: string;
          name: string;
          token: string;
          status: BotConfig['status'];
          user_id: number;
          registered_at: string;
          updated_at: string;
        }
      | undefined;
    if (!row) return undefined;
    return {
      botId: row.bot_id,
      token: row.token,
      name: row.name,
      status: row.status,
      userId: row.user_id,
      registeredAt: new Date(row.registered_at),
    };
  }

  listBots(): BotConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM bots ORDER BY registered_at ASC')
      .all() as Array<{
      bot_id: string;
      name: string;
      token: string;
      status: BotConfig['status'];
      user_id: number;
      registered_at: string;
    }>;
    return rows.map((r) => ({
      botId: r.bot_id,
      token: r.token,
      name: r.name,
      status: r.status,
      userId: r.user_id,
      registeredAt: new Date(r.registered_at),
    }));
  }

  deleteBot(botId: string): boolean {
    const result = this.db.prepare('DELETE FROM bots WHERE bot_id = ?').run(botId);
    return result.changes > 0;
  }

  setStatus(botId: string, status: BotConfig['status']): void {
    this.db
      .prepare('UPDATE bots SET status = ?, updated_at = ? WHERE bot_id = ?')
      .run(status, new Date().toISOString(), botId);
  }
}
