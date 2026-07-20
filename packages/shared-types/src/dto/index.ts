import {
  BotDifficulty,
  AdminRole,
  ActionType,
} from '../enums';

export interface CreateBotDto {
  name: string;
  login: string;
  password: string;
  strategyProfileId?: string;
  defaultBuyIn?: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  dailyLossLimit?: number;
  sessionLossLimit?: number;
  maxTables?: number;
}

export interface UpdateBotDto {
  name?: string;
  password?: string;
  strategyProfileId?: string;
  defaultBuyIn?: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  dailyLossLimit?: number;
  sessionLossLimit?: number;
  maxTables?: number;
  isEnabled?: boolean;
}

export interface JoinTableDto {
  tableId: string;
  buyIn: number;
  preferredSeat?: number | null;
  waitForBigBlind?: boolean;
}

export interface BulkJoinTableDto {
  botIds: string[];
  tableId: string;
  buyIn: number;
  preferredSeat?: number | null;
  waitForBigBlind?: boolean;
}

export interface BulkCommandDto {
  botIds: string[];
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface LoginResponseDto {
  accessToken: string;
  refreshToken: string;
  admin: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface CreateStrategyDto {
  name: string;
  description?: string;
  difficulty: BotDifficulty;
  configurationJson?: Record<string, unknown>;
  isActive?: boolean;
}

export interface UpdateStrategyDto {
  name?: string;
  description?: string;
  difficulty?: BotDifficulty;
  configurationJson?: Record<string, unknown>;
  isActive?: boolean;
}

export interface CreateTableDto {
  externalTableId: string;
  name: string;
  gameType: string;
  limitType: string;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxPlayers: number;
  isAllowedForBots: boolean;
}

export interface UpdateTableDto {
  name?: string;
  isAllowedForBots?: boolean;
  minBuyIn?: number;
  maxBuyIn?: number;
}

export interface BotActionRequestDto {
  botId: string;
  tableId: string;
  handId: string;
  turnId: string;
  action: ActionType;
  amount?: number;
}

export interface InternalBotStatusDto {
  botId: string;
  status: string;
  workerId: string;
  tableId?: string;
  handId?: string;
  errorMessage?: string;
}

export interface InternalGameStateDto {
  botId: string;
  tableId: string;
  handId: string;
  turnId: string;
  stateJson: string;
}

export interface InternalActionResultDto {
  botId: string;
  tableId: string;
  handId: string;
  turnId: string;
  action: ActionType;
  amount?: number;
  success: boolean;
  errorMessage?: string;
}

export interface PaginationQueryDto {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filter?: Record<string, string>;
}
