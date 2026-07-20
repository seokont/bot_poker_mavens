import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHandDto {
  @ApiPropertyOptional({ description: 'External hand identifier from Poker Mavens' })
  externalHandId?: string;

  @ApiProperty({ description: 'Table ID the hand was played on' })
  tableId: string;

  @ApiPropertyOptional({ description: 'Game type', default: 'NLH' })
  gameType?: string = 'NLH';

  @ApiProperty({ description: 'Small blind amount' })
  smallBlind: number;

  @ApiProperty({ description: 'Big blind amount' })
  bigBlind: number;

  @ApiPropertyOptional({ description: 'Ante amount', default: 0 })
  ante?: number = 0;

  @ApiPropertyOptional({ description: 'Button seat position' })
  buttonSeat?: number;

  @ApiPropertyOptional({ description: 'Board cards in JSON format' })
  boardJson?: string;

  @ApiPropertyOptional({ description: 'Initial pot size', default: 0 })
  pot?: number = 0;

  @ApiPropertyOptional({ description: 'Rake amount', default: 0 })
  rake?: number = 0;

  @ApiPropertyOptional({ description: 'Raw game state in JSON format' })
  rawStateJson?: string;
}

export class UpdateFinishedHandDto {
  @ApiProperty({ description: 'Hand finished at timestamp' })
  finishedAt: string;

  @ApiProperty({ description: 'Final pot size' })
  pot: number;

  @ApiProperty({ description: 'Rake amount' })
  rake: number;

  @ApiPropertyOptional({ description: 'Final board cards in JSON format' })
  boardJson?: string;

  @ApiPropertyOptional({ description: 'Final raw state in JSON format' })
  rawStateJson?: string;
}
