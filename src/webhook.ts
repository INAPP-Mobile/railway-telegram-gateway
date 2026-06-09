import { Telegraf, Context } from 'telegraf';
import type { Update } from 'telegraf/typings/core/types/typegram';
import { WebSocketGateway } from './gateway';

export class WebhookHandler {
  private bots: Map<string, Telegraf<Context>> = new Map();
  private gateway: WebSocketGateway;

  constructor(gateway: WebSocketGateway) {
    this.gateway = gateway;
  }

  async registerBot(botId: string, token: string): Promise<void> {
    if (this.bots.has(botId)) {
      return; // Already registered
    }

    const bot = new Telegraf<Context>(token);
    this.bots.set(botId, bot);

    // Use the gateway handler for all updates
    bot.on('message', async (ctx: Context) => {
      const update: Update = ctx.update as Update;
      this.gateway.dispatchUpdate(botId, update);
    });

    bot.on('edited_message', async (ctx: Context) => {
      const update: Update = ctx.update as Update;
      this.gateway.dispatchUpdate(botId, update);
    });

    bot.on('channel_post', async (ctx: Context) => {
      const update: Update = ctx.update as Update;
      this.gateway.dispatchUpdate(botId, update);
    });

    bot.on('callback_query', async (ctx: Context) => {
      const update: Update = ctx.update as Update;
      this.gateway.dispatchUpdate(botId, update);
    });
  }

  async sendMessage(
    botId: string,
    chatId: number | string,
    text: string,
    options?: {
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      disable_web_page_preview?: boolean;
      disable_notification?: boolean;
      reply_to_message_id?: number;
    }
  ): Promise<{ ok: boolean; error?: string }> {
    const bot = this.bots.get(botId);
    if (!bot) {
      return { ok: false, error: 'Bot not registered' };
    }
    try {
      await bot.telegram.sendMessage(chatId, text, options || {});
      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send message';
      return { ok: false, error: message };
    }
  }

  unregisterBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (bot) {
      this.bots.delete(botId);
    }
  }

  getWebhookHandler(): (update: Update) => Promise<void> {
    return async (update: Update) => {
      for (const [, bot] of this.bots.entries()) {
        await bot.handleUpdate(update);
      }
    };
  }

  getBotWebhookHandler(botId: string): ((update: Update) => Promise<void>) | null {
    const bot = this.bots.get(botId);
    if (!bot) return null;
    return (update: Update) => bot.handleUpdate(update);
  }
}