import { Telegraf } from 'telegraf';
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

export interface SendMessagePayload {
  chatId: number | string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
}

export interface WSMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'sendMessage';
  botId?: string;
  token?: string;
  chatId?: number | string;
  text?: string;
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_to_message_id?: number;
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

export type TelegramUpdate = any; // Use Telegraf's Update type if needed