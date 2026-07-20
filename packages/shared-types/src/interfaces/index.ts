import {
  BotDifficulty,
  Street,
  GameType,
  LimitType,
  Position,
  ActionType,
  CardRank,
  CardSuit,
} from '../enums';

export interface Card {
  rank: CardRank;
  suit: CardSuit;
}

export interface AllowedAction {
  action: ActionType;
  minAmount?: number;
  maxAmount?: number;
}

export interface GameAction {
  playerId: string;
  playerName: string;
  action: ActionType;
  amount: number;
  street: Street;
  sequence: number;
  timestamp: string;
}

export interface TablePlayerState {
  playerId: string;
  playerName: string;
  seatNumber: number;
  stack: number;
  currentBet: number;
  isHero: boolean;
  isDealer: boolean;
  hasFolded: boolean;
  isAllIn: boolean;
  cards?: Card[];
}

export interface GameState {
  botId: string;
  tableId: string;
  handId: string;
  turnId: string;
  gameType: GameType;
  limitType: LimitType;
  street: Street;
  seatNumber: number;
  position: Position;
  playerCount: number;
  activePlayerCount: number;
  holeCards: Card[];
  boardCards: Card[];
  smallBlind: number;
  bigBlind: number;
  ante: number;
  heroStack: number;
  effectiveStack: number;
  pot: number;
  mainPot: number;
  sidePots: number[];
  amountToCall: number;
  minBet: number;
  minRaiseTo: number;
  maxRaiseTo: number;
  allowedActions: AllowedAction[];
  players: TablePlayerState[];
  actionHistory: GameAction[];
  actionDeadlineAt: string | null;
  capturedAt: string;
}

export interface BotCredentials {
  login: string;
  password: string;
}

export interface BotDecisionResult {
  action: ActionType;
  amount?: number;
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface StrategyConfig {
  id: string;
  name: string;
  difficulty: BotDifficulty;
  preflopRanges: Record<string, string>;
  aggression: number;
  bluffFrequency: number;
  cbetFrequency: number;
  betSizes: Record<string, number[]>;
  maxAllInThreshold: number;
  randomization: number;
  enabledGames: GameType[];
  configurationJson: Record<string, unknown>;
}

export interface BotHeartbeat {
  workerId: string;
  botId: string;
  status: string;
  tableId?: string;
  handId?: string;
  lastActionAt?: string;
  memoryUsage: number;
  browserConnected: boolean;
}

export interface WorkerRegistration {
  workerId: string;
  hostname: string;
  pid: number;
  maxBots: number;
  startedAt: string;
}

export interface AuditLogEntry {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: string;
  afterJson?: string;
  ipAddress: string;
  userAgent: string;
}

export interface WebSocketEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface LobbyTable {
  externalTableId: string;
  name: string;
  gameType: string;
  limitType: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers: number;
  currentPlayers: number;
  isAllowedForBots: boolean;
}

export interface BotSession {
  id: string;
  botId: string;
  workerId: string;
  browserSessionId?: string;
  startedAt: string;
  endedAt?: string;
  startBalance?: number;
  endBalance?: number;
  profitLoss?: number;
  handsPlayed: number;
  status: string;
  lastHeartbeatAt?: string;
  errorMessage?: string;
}

export interface BotLimit {
  id: string;
  botId: string;
  maxDailyLoss: number;
  maxSessionLoss: number;
  maxHandsPerSession: number;
  maxSessionDurationMinutes: number;
  maxBuyIn: number;
  minBalance: number;
  autoStopEnabled: boolean;
}
