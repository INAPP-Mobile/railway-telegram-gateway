import { WebSocketServer, WebSocket } from 'ws';
import { WSMessage } from './types';
export declare class WebSocketGateway {
    private subscriptions;
    private clients;
    private apiKeys;
    private heartbeatInterval;
    constructor(apiKeysEnv: string);
    verifyClient(token?: string): boolean;
    subscribe(ws: WebSocket, botId: string): void;
    unsubscribe(ws: WebSocket, botId: string): void;
    dispatchUpdate(botId: string, payload: unknown): void;
    handleMessage(ws: WebSocket, message: WSMessage): void;
    registerClient(ws: WebSocket, token?: string): void;
    unregisterClient(ws: WebSocket): void;
    startHeartbeat(intervalMs?: number): void;
    stopHeartbeat(): void;
    createWSServer(server: any): WebSocketServer;
}
//# sourceMappingURL=gateway.d.ts.map