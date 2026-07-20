import { Injectable } from '@nestjs/common';

export enum BotState {
  OFFLINE = 'OFFLINE',
  STARTING = 'STARTING',
  BROWSER_CREATED = 'BROWSER_CREATED',
  AUTHORIZING = 'AUTHORIZING',
  IN_LOBBY = 'IN_LOBBY',
  OPENING_TABLE = 'OPENING_TABLE',
  WAITING_FOR_SEAT = 'WAITING_FOR_SEAT',
  BUYING_IN = 'BUYING_IN',
  SEATED = 'SEATED',
  WAITING_FOR_HAND = 'WAITING_FOR_HAND',
  IN_HAND = 'IN_HAND',
  WAITING_FOR_TURN = 'WAITING_FOR_TURN',
  DECIDING = 'DECIDING',
  EXECUTING_ACTION = 'EXECUTING_ACTION',
  WAITING_FOR_NEXT_STATE = 'WAITING_FOR_NEXT_STATE',
  SITTING_OUT = 'SITTING_OUT',
  LEAVING_TABLE = 'LEAVING_TABLE',
  RECONNECTING = 'RECONNECTING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
}

const VALID_TRANSITIONS: Record<BotState, BotState[]> = {
  [BotState.OFFLINE]: [BotState.STARTING],
  [BotState.STARTING]: [BotState.BROWSER_CREATED, BotState.ERROR],
  [BotState.BROWSER_CREATED]: [BotState.AUTHORIZING, BotState.ERROR],
  [BotState.AUTHORIZING]: [BotState.IN_LOBBY, BotState.STOPPING, BotState.ERROR],
  [BotState.IN_LOBBY]: [BotState.OPENING_TABLE, BotState.STOPPING, BotState.ERROR],
  [BotState.OPENING_TABLE]: [BotState.WAITING_FOR_SEAT, BotState.IN_LOBBY, BotState.ERROR],
  [BotState.WAITING_FOR_SEAT]: [BotState.BUYING_IN, BotState.IN_LOBBY, BotState.ERROR],
  [BotState.BUYING_IN]: [BotState.SEATED, BotState.IN_LOBBY, BotState.ERROR],
  [BotState.SEATED]: [BotState.WAITING_FOR_HAND, BotState.SITTING_OUT, BotState.LEAVING_TABLE, BotState.STOPPING, BotState.ERROR],
  [BotState.WAITING_FOR_HAND]: [BotState.IN_HAND, BotState.SITTING_OUT, BotState.LEAVING_TABLE, BotState.STOPPING, BotState.RECONNECTING, BotState.ERROR],
  [BotState.IN_HAND]: [BotState.WAITING_FOR_TURN, BotState.SITTING_OUT, BotState.STOPPING, BotState.RECONNECTING, BotState.ERROR],
  [BotState.WAITING_FOR_TURN]: [BotState.DECIDING, BotState.SITTING_OUT, BotState.RECONNECTING, BotState.ERROR],
  [BotState.DECIDING]: [BotState.EXECUTING_ACTION, BotState.WAITING_FOR_NEXT_STATE, BotState.RECONNECTING, BotState.ERROR],
  [BotState.EXECUTING_ACTION]: [BotState.WAITING_FOR_NEXT_STATE, BotState.ERROR],
  [BotState.WAITING_FOR_NEXT_STATE]: [BotState.IN_HAND, BotState.WAITING_FOR_HAND, BotState.WAITING_FOR_TURN, BotState.SEATED, BotState.LEAVING_TABLE, BotState.STOPPING, BotState.ERROR],
  [BotState.SITTING_OUT]: [BotState.SEATED, BotState.WAITING_FOR_HAND, BotState.LEAVING_TABLE, BotState.STOPPING, BotState.ERROR],
  [BotState.LEAVING_TABLE]: [BotState.IN_LOBBY, BotState.STOPPING, BotState.ERROR],
  [BotState.RECONNECTING]: [BotState.IN_LOBBY, BotState.SEATED, BotState.WAITING_FOR_HAND, BotState.IN_HAND, BotState.STOPPING, BotState.ERROR],
  [BotState.STOPPING]: [BotState.OFFLINE, BotState.ERROR],
  [BotState.ERROR]: [BotState.STARTING, BotState.STOPPING, BotState.OFFLINE, BotState.RECONNECTING],
};

@Injectable()
export class BotStateMachine {
  private states: Map<string, BotState> = new Map();

  getCurrentState(botId: string): BotState {
    return this.states.get(botId) ?? BotState.OFFLINE;
  }

  setState(botId: string, state: BotState): boolean {
    const current = this.getCurrentState(botId);
    if (!this.canTransitionTo(current, state)) {
      console.warn(
        `[BotStateMachine] Invalid transition: ${botId} from ${current} to ${state}`,
      );
      return false;
    }
    this.states.set(botId, state);
    return true;
  }

  canTransitionTo(from: BotState, to: BotState): boolean {
    if (from === to) return true;
    const allowed = VALID_TRANSITIONS[from];
    return allowed?.includes(to) ?? false;
  }

  isWaitingForTurn(botId: string): boolean {
    return this.getCurrentState(botId) === BotState.WAITING_FOR_TURN;
  }

  isDeciding(botId: string): boolean {
    return this.getCurrentState(botId) === BotState.DECIDING;
  }

  isExecutingAction(botId: string): boolean {
    return this.getCurrentState(botId) === BotState.EXECUTING_ACTION;
  }

  isInActionState(botId: string): boolean {
    const state = this.getCurrentState(botId);
    return (
      state === BotState.WAITING_FOR_TURN ||
      state === BotState.DECIDING ||
      state === BotState.EXECUTING_ACTION
    );
  }

  forceSetState(botId: string, state: BotState): void {
    this.states.set(botId, state);
  }

  removeBot(botId: string): void {
    this.states.delete(botId);
  }
}
