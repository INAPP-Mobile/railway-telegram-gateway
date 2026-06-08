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

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

export class TelegramGatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private authToken: string;
  private callback: UpdateCallback | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private subscriptions = new Set<string>();

  constructor(url: string, authToken: string) {
    this.url = url;
    this.authToken = authToken;
  }

  subscribe(botId: string): void {
    this.subscriptions.add(botId);
    this.send({ type: 'subscribe', botId });
  }

  unsubscribe(botId: string): void {
    this.subscriptions.delete(botId);
    this.send({ type: 'unsubscribe', botId });
  }

  onUpdate(callback: UpdateCallback): void {
    this.callback = callback;
  }

  connect(): void {
    this.shouldReconnect = true;
    const wsUrl = `${this.url}?token=${this.authToken}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      // Re-subscribe to all active subscriptions
      for (const botId of this.subscriptions) {
        this.send({ type: 'subscribe', botId });
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: TGMessage = JSON.parse(event.data as string);
        if (msg.type === 'update' && msg.botId && msg.payload) {
          this.callback?.(msg.botId, msg.payload);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private send(msg: TGMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
}