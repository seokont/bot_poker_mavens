import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthOrInternalGuard } from '../../common/guards/auth-or-internal.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BotCommandsService } from './bot-commands.service';
import { AdminRole } from '@poker-bot/shared-types';

import { IsString, IsNumber, IsOptional, IsBoolean, IsArray } from 'class-validator';

class JoinTableBody {
  @IsString()
  tableId!: string;

  @IsNumber()
  buyIn!: number;

  @IsOptional()
  @IsNumber()
  preferredSeat?: number | null;

  @IsOptional()
  @IsBoolean()
  waitForBigBlind?: boolean;
}

class RebuyBody {
  @IsOptional()
  @IsNumber()
  amount?: number;
}

class BulkBotIdsBody {
  @IsArray()
  @IsString({ each: true })
  botIds!: string[];
}

class BulkJoinTableBody {
  @IsArray()
  @IsString({ each: true })
  botIds!: string[];

  @IsString()
  tableId!: string;

  @IsNumber()
  buyIn!: number;

  @IsOptional()
  @IsNumber()
  preferredSeat?: number | null;

  @IsOptional()
  @IsBoolean()
  waitForBigBlind?: boolean;
}

@ApiTags('Bot Commands')
@ApiBearerAuth()
@UseGuards(AuthOrInternalGuard, RolesGuard)
@Controller('bots')
export class BotCommandsController {
  constructor(private readonly botCommandsService: BotCommandsService) {}

  @Post(':id/start')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Start a bot' })
  @ApiParam({ name: 'id', type: String })
  async start(@Param('id') id: string) {
    return this.botCommandsService.start(id);
  }

  @Post(':id/stop')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Stop a bot' })
  @ApiParam({ name: 'id', type: String })
  async stop(@Param('id') id: string) {
    return this.botCommandsService.stop(id);
  }

  @Post(':id/restart')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Restart a bot' })
  @ApiParam({ name: 'id', type: String })
  async restart(@Param('id') id: string) {
    return this.botCommandsService.restart(id);
  }

  @Post(':id/join-table')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Make a bot join a table (supports JWT or Internal API Key)' })
  @ApiParam({ name: 'id', type: String })
  async joinTable(
    @Param('id') id: string,
    @Body() body: JoinTableBody & { login?: string; password?: string },
  ) {
    // Allow override of credentials via body when using Internal API Key
    return this.botCommandsService.joinTable(
      id,
      body.tableId,
      body.buyIn,
      body.preferredSeat,
      body.waitForBigBlind,
      body.login,
      body.password,
    );
  }

  @Post(':id/leave-table')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Make a bot leave the current table' })
  @ApiParam({ name: 'id', type: String })
  async leaveTable(@Param('id') id: string) {
    return this.botCommandsService.leaveTable(id);
  }

  @Post(':id/sit-out')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Make a bot sit out' })
  @ApiParam({ name: 'id', type: String })
  async sitOut(@Param('id') id: string) {
    return this.botCommandsService.sitOut(id);
  }

  @Post(':id/sit-in')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Make a bot sit back in' })
  @ApiParam({ name: 'id', type: String })
  async sitIn(@Param('id') id: string) {
    return this.botCommandsService.sitIn(id);
  }

  @Post(':id/rebuy')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Make a bot rebuy at the table' })
  @ApiParam({ name: 'id', type: String })
  async rebuy(
    @Param('id') id: string,
    @Body() body: RebuyBody,
  ) {
    return this.botCommandsService.rebuy(id, body.amount);
  }

  @Post('bulk/start')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Start multiple bots' })
  async bulkStart(@Body() body: BulkBotIdsBody) {
    return this.botCommandsService.bulkStart(body.botIds);
  }

  @Post('bulk/stop')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Stop multiple bots' })
  async bulkStop(@Body() body: BulkBotIdsBody) {
    return this.botCommandsService.bulkStop(body.botIds);
  }

  @Post('bulk/join-table')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Make multiple bots join a table' })
  async bulkJoinTable(@Body() body: BulkJoinTableBody) {
    return this.botCommandsService.bulkJoinTable(
      body.botIds,
      body.tableId,
      body.buyIn,
      body.preferredSeat,
      body.waitForBigBlind,
    );
  }

  @Post('bulk/leave-table')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Make multiple bots leave their tables' })
  async bulkLeaveTable(@Body() body: BulkBotIdsBody) {
    return this.botCommandsService.bulkLeaveTable(body.botIds);
  }
}
