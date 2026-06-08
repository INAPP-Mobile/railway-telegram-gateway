import type { Update } from 'telegraf/typings/core/types/typegram';
import { WebSocketGateway } from './gateway';
export declare class WebhookHandler {
    private bots;
    private gateway;
    constructor(gateway: WebSocketGateway);
    registerBot(botId: string, token: string): Promise<void>;
    unregisterBot(botId: string): void;
    getWebhookHandler(): (update: Update) => Promise<void>;
    getBotWebhookHandler(botId: string): ((update: Update) => Promise<void>) | null;
}
//# sourceMappingURL=webhook.d.ts.map