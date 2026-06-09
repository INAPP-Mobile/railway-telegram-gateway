export interface TGUpdate {
    type: 'update';
    botId: string;
    payload: Record<string, unknown>;
}
export type TGMessageType = 'subscribe' | 'unsubscribe' | 'ping' | 'subscribed' | 'unsubscribed' | 'pong' | 'update' | 'sendMessage' | 'sent';
export interface TGMessage {
    type: TGMessageType;
    botId?: string;
    token?: string;
    payload?: Record<string, unknown>;
    chatId?: number | string;
    text?: string;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_web_page_preview?: boolean;
    disable_notification?: boolean;
    reply_to_message_id?: number;
    ok?: boolean;
    error?: string;
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
    sendMessage(botId: string, chatId: number | string, text: string, options?: {
        parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
        disable_web_page_preview?: boolean;
        disable_notification?: boolean;
        reply_to_message_id?: number;
    }): void;
    unsubscribe(botId: string): void;
    onUpdate(callback: UpdateCallback): void;
    connect(): void;
    close(): void;
    private send;
    private scheduleReconnect;
}
//# sourceMappingURL=index.d.ts.map