"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookHandler = void 0;
const telegraf_1 = require("telegraf");
class WebhookHandler {
    bots = new Map();
    gateway;
    constructor(gateway) {
        this.gateway = gateway;
    }
    async registerBot(botId, token) {
        if (this.bots.has(botId)) {
            return;
        }
        const bot = new telegraf_1.Telegraf(token);
        this.bots.set(botId, bot);
        bot.on('message', async (ctx) => {
            const update = ctx.update;
            this.gateway.dispatchUpdate(botId, update);
        });
        bot.on('edited_message', async (ctx) => {
            const update = ctx.update;
            this.gateway.dispatchUpdate(botId, update);
        });
        bot.on('channel_post', async (ctx) => {
            const update = ctx.update;
            this.gateway.dispatchUpdate(botId, update);
        });
        bot.on('callback_query', async (ctx) => {
            const update = ctx.update;
            this.gateway.dispatchUpdate(botId, update);
        });
    }
    unregisterBot(botId) {
        const bot = this.bots.get(botId);
        if (bot) {
            this.bots.delete(botId);
        }
    }
    getWebhookHandler() {
        return async (update) => {
            for (const [, bot] of this.bots.entries()) {
                await bot.handleUpdate(update);
            }
        };
    }
    getBotWebhookHandler(botId) {
        const bot = this.bots.get(botId);
        if (!bot)
            return null;
        return (update) => bot.handleUpdate(update);
    }
}
exports.WebhookHandler = WebhookHandler;
//# sourceMappingURL=webhook.js.map