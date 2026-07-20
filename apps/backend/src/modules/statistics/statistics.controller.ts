import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { StatisticsService } from './statistics.service';
import { TimeRangeQueryDto } from './dto/dashboard.dto';

@ApiTags('Statistics')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Get aggregate dashboard statistics' })
  async getDashboard() {
    return this.statisticsService.getDashboard();
  }

  @Get('bots')
  @ApiOperation({ summary: 'Get statistics for all bots' })
  async getAllBotsStats() {
    return this.statisticsService.getAllBotsStats();
  }

  @Get('bots/:id')
  @ApiOperation({ summary: 'Get statistics for a single bot' })
  @ApiParam({ name: 'id', description: 'Bot ID' })
  async getBotStats(@Param('id') id: string) {
    return this.statisticsService.getBotStats(id);
  }

  @Get('tables/:id')
  @ApiOperation({ summary: 'Get statistics for a specific table' })
  @ApiParam({ name: 'id', description: 'Table ID' })
  async getTableStats(@Param('id') id: string) {
    return this.statisticsService.getTableStats(id);
  }

  @Get('profit-loss')
  @ApiOperation({ summary: 'Get profit/loss data grouped by time range' })
  async getProfitLoss(@Query() query: TimeRangeQueryDto) {
    return this.statisticsService.getProfitLoss(query);
  }
}
