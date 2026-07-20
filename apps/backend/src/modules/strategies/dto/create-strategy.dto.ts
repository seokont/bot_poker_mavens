import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { BotDifficulty } from '@poker-bot/shared-types';

export class CreateStrategyDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: BotDifficulty, default: BotDifficulty.EASY })
  @IsEnum(BotDifficulty)
  difficulty: BotDifficulty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configurationJson?: Record<string, unknown>;
}
