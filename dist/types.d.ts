import { WebSocket } from 'ws';
export interface BotConfig {
    botId: string;
    token: string;
    name?: string;
    status: 'active' | 'inactive' | 'error';
    userId: number;
    registeredAt: Date;
}
export interface Subscription {
    botId: string;
    userId: string;
    ws: WebSocket;
    subscribedAt: Date;
}
export interface WSMessage {
    type: 'subscribe' | 'unsubscribe' | 'ping';
    botId?: string;
    token?: string;
}
export interface BotRegistrationRequest {
    token: string;
    name?: string;
}
export interface BotRegistrationResponse {
    botId: string;
    status: 'registered' | 'already_exists';
}
export interface BotDeregistrationResponse {
    status: 'unregistered';
}
export interface BotListResponse {
    bots: BotConfig[];
}
export type TelegramUpdate = any;
//# sourceMappingURL=types.d.ts.map