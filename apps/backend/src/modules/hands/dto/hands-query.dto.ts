import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class HandsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by bot ID' })
  @IsOptional()
  @IsString()
  botId?: string;

  @ApiPropertyOptional({ description: 'Filter by table ID' })
  @IsOptional()
  @IsString()
  tableId?: string;

  @ApiPropertyOptional({ description: 'Filter by game type (e.g. NLH, PLO)' })
  @IsOptional()
  @IsString()
  gameType?: string;

  @ApiPropertyOptional({ description: 'Filter by start date (ISO string)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter by end date (ISO string)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Filter by hand result' })
  @IsOptional()
  @IsString()
  result?: string;
}
