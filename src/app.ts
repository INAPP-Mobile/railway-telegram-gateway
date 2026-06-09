import { Hono } from 'hono';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';

export function createApp(
  gateway: WebSocketGateway,
  webhookHandler: WebhookHandler,
  adminAPI: AdminAPI
): Hono {
  const app = new Hono();

  // Webhook route: Telegram sends updates here
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

  // Health check (used by Railway for deployment health)
  app.get('/health', (c) => c.json({ status: 'healthy' }));

  // Admin API: bot management
  app.post('/admin/bots', async (c) => adminAPI.registerBot(c));
  app.delete('/admin/bots/:botId', async (c) => adminAPI.unregisterBot(c));
  app.get('/admin/bots', async (c) => adminAPI.listBots(c));

  return app;
}