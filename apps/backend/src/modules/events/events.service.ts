import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export interface BotLiveState {
  botId: string;
  tableId?: string;
  handId?: string | null;
  street?: string;
  holeCards?: string[];
  boardCards?: string[];
  pot?: number;
  heroStack?: number;
  updatedAt: string;
}

@Injectable()
export class EventsService {
  constructor(private gateway: EventsGateway) {}

  private liveStates = new Map<string, BotLiveState>();

  emit(event: string, data: Record<string, unknown>) {
    this.gateway.emit(event, data);
  }

  emitBotLiveState(botId: string, state: Omit<BotLiveState, 'botId' | 'updatedAt'>) {
    const fullState: BotLiveState = { botId, ...state, updatedAt: new Date().toISOString() };
    this.liveStates.set(botId, fullState);
    this.emit('bot.live.state', fullState as unknown as Record<string, unknown>);
  }

  getBotLiveState(botId: string): BotLiveState | null {
    return this.liveStates.get(botId) ?? null;
  }

  emitBotStatusChanged(botId: string, oldStatus: string, newStatus: string) {
    this.emit('bot.status.changed', { botId, oldStatus, newStatus });
  }

  emitBotStarted(botId: string) {
    this.emit('bot.started', { botId });
  }

  emitBotStopped(botId: string) {
    this.emit('bot.stopped', { botId });
  }

  emitBotError(botId: string, errorCode: string, errorMessage: string) {
    this.emit('bot.error', { botId, errorCode, errorMessage });
  }

  emitBotReconnecting(botId: string) {
    this.emit('bot.reconnecting', { botId });
  }

  emitBotTableJoined(botId: string, tableId: string) {
    this.emit('bot.table.joined', { botId, tableId });
  }

  emitBotTableLeft(botId: string, tableId: string) {
    this.emit('bot.table.left', { botId, tableId });
  }

  emitBotHandStarted(botId: string, handId: string, tableId: string) {
    this.emit('bot.hand.started', { botId, handId, tableId });
  }

  emitBotHandFinished(botId: string, handId: string, result: string, profitLoss: number) {
    this.emit('bot.hand.finished', { botId, handId, result, profitLoss });
  }

  emitBotTurnStarted(botId: string, handId: string, turnId: string) {
    this.emit('bot.turn.started', { botId, handId, turnId });
  }

  emitBotDecisionCreated(botId: string, handId: string, decision: string) {
    this.emit('bot.decision.created', { botId, handId, decision });
  }

  emitBotActionExecuted(botId: string, handId: string, action: string, amount?: number) {
    this.emit('bot.action.executed', { botId, handId, action, amount });
  }

  emitBotActionFailed(botId: string, handId: string, errorMessage: string) {
    this.emit('bot.action.failed', { botId, handId, errorMessage });
  }

  emitLimitsTriggered(botId: string, limitType: string, currentValue: number, limitValue: number) {
    this.emit('limits.triggered', { botId, limitType, currentValue, limitValue });
  }

  emitWorkerHeartbeat(workerId: string, botId: string, status: string) {
    this.emit('worker.heartbeat', { workerId, botId, status });
  }
}
