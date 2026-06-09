import { WebSocketServer, WebSocket } from 'ws';
import { WSMessage } from './types';

type SendMessageFn = (botId: string, chatId: number | string, text: string, options?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;

export class WebSocketGateway {
  private subscriptions: Map<string, Set<WebSocket>> = new Map();
  private clients: Map<WebSocket, { token?: string | undefined; subscriptions: Set<string> }> = new Map();
  private apiKeys: Set<string>;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private sendMessageHandler: SendMessageFn | null = null;

  constructor(apiKeysEnv: string) {
    this.apiKeys = new Set(apiKeysEnv.split(',').map(k => k.trim()).filter(Boolean));
  }

  verifyClient(token?: string): boolean {
    if (!token) return false;
    return this.apiKeys.has(token);
  }

  setSendMessageHandler(handler: SendMessageFn): void {
    this.sendMessageHandler = handler;
  }

  subscribe(ws: WebSocket, botId: string): void {
    if (!this.subscriptions.has(botId)) {
      this.subscriptions.set(botId, new Set());
    }
    this.subscriptions.get(botId)!.add(ws);

    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.add(botId);
    }
  }

  unsubscribe(ws: WebSocket, botId: string): void {
    const subs = this.subscriptions.get(botId);
    if (subs) {
      subs.delete(ws);
    }

    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.delete(botId);
    }
  }

  dispatchUpdate(botId: string, payload: unknown): void {
    const subscribers = this.subscriptions.get(botId);
    if (!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify({ type: 'update', botId, payload });
    subscribers.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  handleMessage(ws: WebSocket, message: WSMessage): void {
    switch (message.type) {
      case 'subscribe':
        if (message.botId) {
          this.subscribe(ws, message.botId);
          ws.send(JSON.stringify({ type: 'subscribed', botId: message.botId }));
        }
        break;
      case 'unsubscribe':
        if (message.botId) {
          this.unsubscribe(ws, message.botId);
          ws.send(JSON.stringify({ type: 'unsubscribed', botId: message.botId }));
        }
        break;
      case 'sendMessage':
        if (message.botId && message.chatId && message.text) {
          if (!this.sendMessageHandler) {
            ws.send(JSON.stringify({ type: 'error', message: 'Send message handler not configured' }));
            break;
          }
          this.sendMessageHandler(
            message.botId,
            message.chatId,
            message.text,
            {
              parse_mode: message.parse_mode,
              disable_web_page_preview: message.disable_web_page_preview,
              disable_notification: message.disable_notification,
              reply_to_message_id: message.reply_to_message_id,
            }
          ).then(result => {
            ws.send(JSON.stringify({ type: 'sent', botId: message.botId, ok: result.ok, error: result.error }));
          });
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'sendMessage requires botId, chatId, and text' }));
        }
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  registerClient(ws: WebSocket, token?: string): void {
    this.clients.set(ws, { token, subscriptions: new Set() });
  }

  unregisterClient(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.forEach(botId => {
        this.unsubscribe(ws, botId);
      });
      this.clients.delete(ws);
    }
  }

  startHeartbeat(intervalMs: number = 30000): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((_, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, intervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  createWSServer(server: any): WebSocketServer {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws: WebSocket, request) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token') || undefined;

      // Register client with query param token (if provided)
      this.registerClient(ws, token);

      ws.on('message', (data) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());

          // Auth via subscribe message when no token in URL
          if (message.type === 'subscribe' && message.token && !token) {
            const existing = this.clients.get(ws);
            if (existing && !existing.token) {
              if (!this.apiKeys.has(message.token)) {
                ws.send(JSON.stringify({ type: 'error', message: 'Invalid auth token' }));
                return;
              }
              existing.token = message.token;
            }
          }

          this.handleMessage(ws, message);
        } catch (e) {
          // Ignore non-JSON messages
        }
      });

      ws.on('close', () => {
        this.unregisterClient(ws);
      });
    });

    return wss;
  }
}