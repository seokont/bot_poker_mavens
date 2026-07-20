import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsObject, IsBoolean } from 'class-validator';
import { BotDifficulty } from '@poker-bot/shared-types';

export class UpdateStrategyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: BotDifficulty })
  @IsOptional()
  @IsEnum(BotDifficulty)
  difficulty?: BotDifficulty;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  configurationJson?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
