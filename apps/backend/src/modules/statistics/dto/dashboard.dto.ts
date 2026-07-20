import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardDto {
  @ApiProperty({ description: 'Total number of bots' })
  totalBots: number;

  @ApiProperty({ description: 'Active bots (enabled)' })
  activeBots: number;

  @ApiProperty({ description: 'Bots currently playing' })
  playingBots: number;

  @ApiProperty({ description: 'Offline bots' })
  offlineBots: number;

  @ApiProperty({ description: 'Bots in error state' })
  errorBots: number;

  @ApiProperty({ description: 'Current active tables' })
  currentTables: number;

  @ApiProperty({ description: 'Hands played today' })
  handsToday: number;

  @ApiProperty({ description: 'Total profit/loss across all bots' })
  totalPL: number;

  @ApiProperty({ description: "Today's profit/loss" })
  todayPL: number;

  @ApiProperty({ description: 'Average win rate across all bots' })
  avgWinRate: number;

  @ApiProperty({ description: 'Total error count' })
  errorCount: number;
}

export class BotStatsDto {
  @ApiProperty({ description: 'Bot ID' })
  botId: string;

  @ApiProperty({ description: 'Bot name' })
  botName: string;

  @ApiProperty({ description: 'Number of hands played' })
  handsPlayed: number;

  @ApiProperty({ description: 'Total profit/loss' })
  profitLoss: number;

  @ApiProperty({ description: 'Big blinds won' })
  bbWon: number;

  @ApiProperty({ description: 'Big blinds per 100 hands' })
  bbPer100: number;

  @ApiProperty({ description: 'Voluntarily Put In Pot %' })
  VPIP: number;

  @ApiProperty({ description: 'Pre-flop Raise %' })
  PFR: number;

  @ApiProperty({ description: 'Three-bet %' })
  threeBet: number;

  @ApiProperty({ description: 'Fold to three-bet %' })
  foldToThreeBet: number;

  @ApiProperty({ description: 'Continuation bet on flop %' })
  cBetFlop: number;

  @ApiProperty({ description: 'Continuation bet on turn %' })
  cBetTurn: number;

  @ApiProperty({ description: 'Went to showdown %' })
  wentToShowdown: number;

  @ApiProperty({ description: 'Won at showdown %' })
  wonAtShowdown: number;

  @ApiProperty({ description: 'Aggression factor' })
  aggressionFactor: number;

  @ApiProperty({ description: 'Average pot size' })
  averagePot: number;

  @ApiProperty({ description: 'Average decision time in ms' })
  averageDecisionTime: number;

  @ApiProperty({ description: 'Error rate' })
  errorRate: number;

  @ApiProperty({ description: 'Number of reconnects' })
  reconnectCount: number;
}

export class ProfitLossPointDto {
  @ApiProperty({ description: 'Date label' })
  date: string;

  @ApiProperty({ description: 'Profit/loss amount for that day' })
  profitLoss: number;

  @ApiProperty({ description: 'Cumulative profit/loss' })
  cumulativePL: number;
}

export class TimeRangeQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO string)' })
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO string)' })
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Aggregation period: day, week, month', default: 'day' })
  groupBy?: 'day' | 'week' | 'month' = 'day';
}
