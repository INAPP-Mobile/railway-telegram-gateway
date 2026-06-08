import { Context } from 'hono';
import { WebhookHandler } from './webhook';
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

export class AdminAPI {
  private bots: Map<string, BotConfig> = new Map();

  constructor(
    private webhookHandler: WebhookHandler,
    private baseUrl: string,
    private apiKey: string
  ) {}

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
      // 1. Validate bot via getMe
      const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      if (!getMeRes.ok) {
        throw new Error('Invalid bot token');
      }
      const getMeData = await getMeRes.json() as TelegramApiResponse<BotInfo>;
      if (!getMeData.ok) {
        throw new Error(getMeData.description || 'Failed to get bot info');
      }
      const botId = String(getMeData.result.id);

      // 2. Register in memory
      const botConfig: BotConfig = {
        botId,
        token,
        name: name || `bot-${botId}`,
        status: 'active',
        userId: getMeData.result.id,
        registeredAt: new Date(),
      };
      this.bots.set(botId, botConfig);

      // 3. Register webhook with Telegram
      const setWebhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `${this.baseUrl}/webhook/bot/${botId}`,
          drop_pending_updates: true,
          allowed_updates: ['message', 'channel_post', 'my_chat_member'],
        }),
      });
      const setWebhookData = await setWebhookRes.json() as TelegramApiResponse<boolean>;
      if (!setWebhookData.ok) {
        throw new Error(setWebhookData.description || 'Failed to set webhook');
      }

      // 4. Register in WebhookHandler
      await this.webhookHandler.registerBot(botId, token);

      return c.json({ botId, status: 'registered' } as BotRegistrationResponse);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to register bot';
      return c.json({ error: message }, 500);
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

    const bot = this.bots.get(botId);
    if (!bot) {
      return c.json({ error: 'Bot not found' }, 404);
    }

    try {
      // 1. Delete webhook from Telegram
      await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, {
        method: 'POST',
      });

      // 2. Unregister from handler
      this.webhookHandler.unregisterBot(botId);

      // 3. Remove from memory
      this.bots.delete(botId);

      return c.json({ status: 'unregistered' } as BotDeregistrationResponse);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to unregister bot';
      return c.json({ error: message }, 500);
    }
  }

  async listBots(c: Context): Promise<Response> {
    const headerKey = c.req.header('x-api-key');
    if (headerKey !== this.apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    return c.json(Array.from(this.bots.values()));
  }
}