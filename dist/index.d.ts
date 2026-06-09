import 'dotenv/config';
import { WebSocketGateway } from './gateway';
import { WebhookHandler } from './webhook';
import { AdminAPI } from './admin';
declare const gateway: WebSocketGateway;
declare const webhookHandler: WebhookHandler;
declare const adminAPI: AdminAPI;
declare const app: import("hono").Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
export { app, gateway, webhookHandler, adminAPI };
//# sourceMappingURL=index.d.ts.map