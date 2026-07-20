import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordActionDto {
  @ApiProperty({ description: 'Hand ID this action belongs to' })
  handId: string;

  @ApiPropertyOptional({ description: 'Bot ID if this is a bot action' })
  botId?: string;

  @ApiPropertyOptional({ description: 'External player ID from Poker Mavens' })
  externalPlayerId?: string;

  @ApiProperty({ description: 'Street (preflop, flop, turn, river)' })
  street: string;

  @ApiProperty({ description: 'Sequence number within the hand' })
  sequence: number;

  @ApiProperty({ description: 'Action type (fold, check, call, bet, raise, allin)' })
  action: string;

  @ApiPropertyOptional({ description: 'Action amount', default: 0 })
  amount?: number = 0;

  @ApiPropertyOptional({ description: 'Pot size before this action' })
  potBefore?: number;

  @ApiPropertyOptional({ description: 'Pot size after this action' })
  potAfter?: number;

  @ApiPropertyOptional({ description: 'Player stack before this action' })
  stackBefore?: number;

  @ApiPropertyOptional({ description: 'Player stack after this action' })
  stackAfter?: number;

  @ApiPropertyOptional({ description: 'Whether this action was taken by a bot', default: false })
  isBotAction?: boolean = false;
}

export class ActionsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1 })
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Filter by bot ID' })
  botId?: string;

  @ApiPropertyOptional({ description: 'Filter by hand ID' })
  handId?: string;

  @ApiPropertyOptional({ description: 'Filter by street' })
  street?: string;
}
