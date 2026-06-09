import { Hono } from 'hono';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';
export declare function createApp(gateway: WebSocketGateway, webhookHandler: WebhookHandler, adminAPI: AdminAPI): Hono;
//# sourceMappingURL=app.d.ts.map