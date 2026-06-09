"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const hono_1 = require("hono");
function createApp(gateway, webhookHandler, adminAPI) {
    const app = new hono_1.Hono();
    app.post('/webhook/bot/:botId', async (c) => {
        const botId = c.req.param('botId');
        const handler = webhookHandler.getBotWebhookHandler(botId);
        if (!handler) {
            return c.json({ error: 'Bot not registered' }, 404);
        }
        const update = await c.req.json();
        await handler(update);
        return c.text('OK');
    });
    app.post('/admin/bots', async (c) => adminAPI.registerBot(c));
    app.delete('/admin/bots/:botId', async (c) => adminAPI.unregisterBot(c));
    app.get('/admin/bots', async (c) => adminAPI.listBots(c));
    return app;
}
//# sourceMappingURL=app.js.map