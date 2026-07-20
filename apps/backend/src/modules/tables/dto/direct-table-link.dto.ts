import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DirectTableLinkDto {
  @ApiProperty({ description: 'Player nickname on the Poker Mavens server' })
  @IsString()
  @IsNotEmpty()
  nickname: string;

  @ApiProperty({ description: 'Table name on the Poker Mavens server' })
  @IsString()
  @IsNotEmpty()
  tableName: string;
}
