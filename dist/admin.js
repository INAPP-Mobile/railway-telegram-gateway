"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminAPI = void 0;
class AdminAPI {
    webhookHandler;
    baseUrl;
    apiKey;
    bots = new Map();
    constructor(webhookHandler, baseUrl, apiKey) {
        this.webhookHandler = webhookHandler;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
    }
    async registerBot(c) {
        const headerKey = c.req.header('x-api-key');
        if (headerKey !== this.apiKey) {
            return c.json({ error: 'Unauthorized' }, 401);
        }
        const body = await c.req.json();
        const { token, name } = body;
        if (!token) {
            return c.json({ error: 'Token is required' }, 400);
        }
        try {
            const skipValidation = process.env.SKIP_BOT_VALIDATION === 'true';
            let botId;
            let userId;
            if (!skipValidation) {
                const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
                if (!getMeRes.ok) {
                    throw new Error('Invalid bot token');
                }
                const getMeData = await getMeRes.json();
                if (!getMeData.ok) {
                    throw new Error(getMeData.description || 'Failed to get bot info');
                }
                botId = String(getMeData.result.id);
                userId = getMeData.result.id;
            }
            else {
                const parts = token.split(':');
                const idStr = (parts.length >= 1) ? String(parts[0]) : '';
                if (!idStr) {
                    throw new Error('Could not extract bot ID from token');
                }
                botId = idStr;
                userId = parseInt(idStr, 10);
            }
            const botConfig = {
                botId,
                token,
                name: name || `bot-${botId}`,
                status: 'active',
                userId,
                registeredAt: new Date(),
            };
            this.bots.set(botId, botConfig);
            const setWebhookRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: `${this.baseUrl}/webhook/bot/${botId}`,
                    drop_pending_updates: true,
                }),
            });
            const setWebhookData = await setWebhookRes.json();
            if (!setWebhookData.ok) {
                throw new Error(setWebhookData.description || 'Failed to set webhook');
            }
            await this.webhookHandler.registerBot(botId, token);
            return c.json({ botId, status: 'registered' });
        }
        catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to register bot';
            return c.json({ error: message }, 500);
        }
    }
    async unregisterBot(c) {
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
            await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, {
                method: 'POST',
            });
            this.webhookHandler.unregisterBot(botId);
            this.bots.delete(botId);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to unregister bot';
            return c.json({ error: message }, 500);
        }
        return c.json({ status: 'unregistered' });
    }
    async listBots(c) {
        const headerKey = c.req.header('x-api-key');
        if (headerKey !== this.apiKey) {
            return c.json({ error: 'Unauthorized' }, 401);
        }
        return c.json(Array.from(this.bots.values()));
    }
}
exports.AdminAPI = AdminAPI;
//# sourceMappingURL=admin.js.map