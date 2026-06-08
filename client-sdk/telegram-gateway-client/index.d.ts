export interface TGUpdate {
    type: 'update';
    botId: string;
    payload: Record<string, unknown>;
}
export type TGMessageType = 'subscribe' | 'unsubscribe' | 'ping' | 'subscribed' | 'unsubscribed' | 'pong' | 'update';
export interface TGMessage {
    type: TGMessageType;
    botId?: string;
    token?: string;
    payload?: Record<string, unknown>;
}
export type UpdateCallback = (botId: string, update: Record<string, unknown>) => void;
export declare class TelegramGatewayClient {
    private ws;
    private url;
    private authToken;
    private callback;
    private reconnectAttempt;
    private reconnectTimer;
    private shouldReconnect;
    private subscriptions;
    constructor(url: string, authToken: string);
    subscribe(botId: string): void;
    unsubscribe(botId: string): void;
    onUpdate(callback: UpdateCallback): void;
    connect(): void;
    close(): void;
    private send;
    private scheduleReconnect;
}
//# sourceMappingURL=index.d.ts.map