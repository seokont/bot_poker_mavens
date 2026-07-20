import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

class ExternalTableDto {
  @ApiProperty()
  @IsString()
  externalTableId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ default: 'NLH' })
  @IsOptional()
  @IsString()
  gameType?: string;

  @ApiProperty({ default: 'NL' })
  @IsOptional()
  @IsString()
  limitType?: string;

  @ApiProperty({ default: 1 })
  @IsOptional()
  @IsNumber()
  smallBlind?: number;

  @ApiProperty({ default: 2 })
  @IsOptional()
  @IsNumber()
  bigBlind?: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  ante?: number;

  @ApiProperty({ default: 200 })
  @IsOptional()
  @IsNumber()
  minBuyIn?: number;

  @ApiProperty({ default: 5000 })
  @IsOptional()
  @IsNumber()
  maxBuyIn?: number;

  @ApiProperty({ default: 9 })
  @IsOptional()
  @IsNumber()
  @Min(2)
  maxPlayers?: number;

  @ApiProperty({ default: true })
  @IsOptional()
  @IsBoolean()
  isAllowedForBots?: boolean;
}

export class SyncTablesDto {
  @ApiProperty({ type: [ExternalTableDto] })
  @IsArray()
  tables: ExternalTableDto[];
}
