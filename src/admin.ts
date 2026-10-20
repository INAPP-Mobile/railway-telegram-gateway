import { Context } from 'hono';
import { WebhookHandler } from './webhook';
import { BotStore } from './store';
import { BotRegistrationRequest, BotRegistrationResponse, BotDeregistrationResponse, BotConfig } from './types';

interface TelegramApiResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

interface BotInfo {
  id: number;
  is_bot: boolean;
  first_name: string;
  username: string;
}

/**
 * A caller-correctable registration failure (bad token, invalid bot id, Telegram
 * rejecting the webhook). Mapped to 4xx instead of a blanket 500 so the caller
 * knows to fix the request, while the raw upstream description stays in logs.
 */
class RegistrationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 422 = 400,
  ) {
    super(message);
    this.name = 'RegistrationError';
  }
}

export class AdminAPI {
  constructor(
    private webhookHandler: WebhookHandler,
    private baseUrl: string,
    private apiKey: string,
    private store: BotStore,
  ) {}

  /**
   * Re-attach a persisted bot after a restart: register its Telegraf instance and
   * re-point Telegram's webhook at this deployment. Never throws — boot must
   * survive per-bot webhook failures (a single flaky bot shouldn't stop delivery
   * for the others).
   */
  async restoreBot(bot: BotConfig): Promise<boolean> {
    try {
      await this.webhookHandler.registerBot(bot.botId, bot.token);
      await this.setWebhook(bot.botId, bot.token);
      this.store.setStatus(bot.botId, 'active');
      console.log(`[bootstrap] restored bot ${bot.botId} (${bot.name ?? 'unnamed'})`);
      return true;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'unknown error';
      console.error(`[bootstrap] failed to restore bot ${bot.botId}: ${message}`);
      this.store.setStatus(bot.botId, 'error');
      return false;
    }
  }

  /** Register every persisted bot. Resolves to { total, restored, failed }. */
  async restoreAllBots(): Promise<{ total: number; restored: number; failed: number }> {
    const bots = this.store.listBots();
    let restored = 0;
    for (const bot of bots) {
      const ok = await this.restoreBot(bot);
      if (ok) restored += 1;
    }
    return { total: bots.length, restored, failed: bots.length - restored };
  }

  private async setWebhook(botId: string, token: string): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Omitting allowed_updates means all event types are delivered.
      body: JSON.stringify({
        url: `${this.baseUrl}/webhook/bot/${botId}`,
        drop_pending_updates: true,
      }),
    });
    const data = (await res.json()) as TelegramApiResponse<boolean>;
    if (!data.ok) {
      // Log the upstream detail for operators; surface a generic, actionable one.
      console.error(`[admin] setWebhook rejected for bot ${botId}: ${data.description ?? 'no description'}`);
      if (res.status === 401 || /unauthorized/i.test(data.description ?? '')) {
        throw new RegistrationError('Invalid bot token', 400);
      }
      throw new RegistrationError('Telegram rejected the webhook URL', 422);
    }
  }

  async registerBot(c: Context): Promise<Response> {
    const headerKey = c.req.header('x-api-key');
    if (headerKey !== this.apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json() as BotRegistrationRequest;
    const { token, name } = body;

    if (!token) {
      return c.json({ error: 'Token is required' }, 400);
    }

    try {
      // 1. Validate bot via getMe (skip for local testing with SKIP_BOT_VALIDATION=true)
      const skipValidation = process.env.SKIP_BOT_VALIDATION === 'true';
      let botId: string;
      let userId: number;

      if (!skipValidation) {
        const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const getMeData = (await getMeRes.json().catch(() => null)) as TelegramApiResponse<BotInfo> | null;
        if (!getMeRes.ok || !getMeData?.ok) {
          console.error(
            `[admin] getMe rejected a registration: status=${getMeRes.status} desc=${getMeData?.description ?? 'unparseable body'}`,
          );
          throw new RegistrationError('Invalid bot token', 400);
        }
        botId = String(getMeData.result.id);
        userId = getMeData.result.id;
      } else {
        // For local testing: derive bot ID from token format <id>:<secret>
        const parts = token.split(':');
        const idStr = (parts.length >= 1) ? String(parts[0]) : '';
        if (!idStr) {
          throw new RegistrationError('Could not extract bot ID from token', 400);
        }
        botId = idStr;
        userId = parseInt(idStr, 10);
      }

      // 2. Attach the in-process Telegraf instance (registers if not already attached)
      await this.webhookHandler.registerBot(botId, token);

      // 3. (Re)point Telegram's webhook at this deployment — required after any
      //    restart/redeploy, and makes repeat-registration idempotent.
      await this.setWebhook(botId, token);

      // 4. Persist last, so a failed request never leaves a durable row Telegram
      //    won't actually deliver to.
      const existing = this.store.getBot(botId);
      this.store.upsertBot({
        botId,
        token,
        name: name || existing?.name || `bot-${botId}`,
        status: 'active',
        userId,
        registeredAt: existing?.registeredAt ?? new Date(),
      });

      return c.json({ botId, status: 'registered' } as BotRegistrationResponse);
    } catch (e: unknown) {
      if (e instanceof RegistrationError) {
        return c.json({ error: e.message }, e.status);
      }
      const message = e instanceof Error ? e.message : 'Failed to register bot';
      console.error(`[admin] registration failed unexpectedly: ${message}`);
      return c.json({ error: 'Failed to register bot' }, 500);
    }
  }

  async unregisterBot(c: Context): Promise<Response> {
    const headerKey = c.req.header('x-api-key');
    if (headerKey !== this.apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const botId = c.req.param('botId');
    if (!botId) {
      return c.json({ error: 'Bot ID is required' }, 400);
    }

    const bot = this.store.getBot(botId);
    if (!bot) {
      return c.json({ error: 'Bot not found' }, 404);
    }

    try {
      await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, {
        method: 'POST',
      });
      this.webhookHandler.unregisterBot(botId);
      this.store.deleteBot(botId);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to unregister bot';
      return c.json({ error: message }, 500);
    }

    return c.json({ status: 'unregistered' } as BotDeregistrationResponse);
  }

  async listBots(c: Context): Promise<Response> {
    const headerKey = c.req.header('x-api-key');
    if (headerKey !== this.apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return c.json(this.store.listBots());
  }
}