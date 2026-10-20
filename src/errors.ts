/**
 * Thrown when a send targets a bot that has been explicitly deregistered from
 * this deployment (Admin API DELETE /admin/bots/:botId). This is a permanent
 * condition for the queued message, so the outbox worker dead-letters it
 * immediately instead of burning its retry budget.
 *
 * Distinct from a plain Error for "bot not attached yet" (e.g. mid-restart
 * before restoreAllBots), which IS retriable.
 */
export class BotGoneError extends Error {
  constructor(readonly botId: string) {
    super(`Bot ${botId} is no longer registered`);
    this.name = 'BotGoneError';
  }
}
