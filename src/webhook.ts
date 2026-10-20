import { Telegraf, Context } from 'telegraf';
import type { Update } from 'telegraf/typings/core/types/typegram';
import { WebSocketGateway } from './gateway';
import { BotSendRateLimiter } from './rate-limiter';
import { Outbox } from './outbox';
import { BotGoneError } from './errors';
import { SendResult } from './types';

export class WebhookHandler {
  private bots: Map<string, Telegraf<Context>> = new Map();
  /** Bots explicitly removed via Admin API — a permanent condition for the outbox. */
  private deregistered: Set<string> = new Set();
  private gateway: WebSocketGateway;
  private rateLimiter: BotSendRateLimiter;
  private outbox: Outbox | null = null;

  constructor(gateway: WebSocketGateway, rateLimiter?: BotSendRateLimiter) {
    this.gateway = gateway;
    this.rateLimiter = rateLimiter ?? new BotSendRateLimiter();
  }

  /**
   * When set, sends are durably enqueued here and delivered by the OutboxWorker
   * (survives redeploy). When null, sends are dispatched synchronously through
   * the rate limiter (legacy/in-process behavior).
   */
  setOutbox(outbox: Outbox): void {
    this.outbox = outbox;
  }

  getRateLimiter(): BotSendRateLimiter {
    return this.rateLimiter;
  }

  async registerBot(botId: string, token: string): Promise<void> {
    if (this.bots.has(botId)) {
      return; // Already registered
    }

    this.deregistered.delete(botId);
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
  ): Promise<SendResult> {
    const bot = this.bots.get(botId);
    if (!bot) {
      return { ok: false, error: 'Bot not registered' };
    }

    // Durable outbox path (default on Railway): persist the send first, return a
    // "queued" ack immediately, and let the OutboxWorker pace delivery. This is
    // what keeps outbound messages alive across redeploys. The async final
    // result arrives over the WS `outbox` event for the bot.
    if (this.outbox) {
      const messageId = this.outbox.enqueue({
        botId,
        chatId,
        text,
        options: options ?? null,
      });
      return { ok: true, queued: true, messageId };
    }

    // In-process fallback (tests / single-process setups without the worker):
    // route through the rate limiter synchronously.
    try {
      // Route through the rate limiter: paces sends to Telegram's per-bot (~30/s global)
      // and per-chat (~20/2min window) caps, and honors retry_after on 429.
      await this.rateLimiter.sendOnce(botId, chatId, () =>
        bot.telegram.sendMessage(chatId, text, options || {}),
      );
      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to send message';
      return { ok: false, error: message };
    }
  }

  unregisterBot(botId: string): void {
    this.bots.delete(botId);
    this.deregistered.add(botId);
  }

  /** True once Admin API has explicitly removed this bot from the deployment. */
  isDeregistered(botId: string): boolean {
    return this.deregistered.has(botId);
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

  /**
   * Dispatch one message directly to Telegram through the rate limiter.
   * This is the delivery primitive the OutboxWorker uses; it does NOT enqueue.
   * If the bot isn't attached (e.g. mid-restart before restore), it throws —
   * the worker treats that as a retriable attempt.
   */
  async dispatch(botId: string, chatId: number | string, text: string, options?: Record<string, unknown>): Promise<unknown> {
    const bot = this.bots.get(botId);
    if (!bot) {
      // Explicitly deregistered → permanent for this queued message.
      // Merely not-yet-attached (mid-restart) → retriable.
      if (this.deregistered.has(botId)) {
        throw new BotGoneError(botId);
      }
      throw new Error(`Bot ${botId} not attached yet`);
    }
    await this.rateLimiter.sendOnce(botId, chatId, () =>
      bot.telegram.sendMessage(chatId, text, (options as object) || {}),
    );
    return true;
  }
}