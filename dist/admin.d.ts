import { Context } from 'hono';
import { WebhookHandler } from './webhook';
export declare class AdminAPI {
    private webhookHandler;
    private baseUrl;
    private apiKey;
    private bots;
    constructor(webhookHandler: WebhookHandler, baseUrl: string, apiKey: string);
    registerBot(c: Context): Promise<Response>;
    unregisterBot(c: Context): Promise<Response>;
    listBots(c: Context): Promise<Response>;
}
//# sourceMappingURL=admin.d.ts.map