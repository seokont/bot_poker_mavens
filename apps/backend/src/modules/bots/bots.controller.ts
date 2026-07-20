import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { BotsService } from './bots.service';
import { EventsService } from '../events/events.service';
import { AdminRole, BotOperationMode } from '@poker-bot/shared-types';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  Min,
} from 'class-validator';

class AddBalanceBody {
  @IsNumber()
  @Min(1)
  amount!: number;
}

class CreateBotBody {
  @IsString()
  name!: string;

  @IsString()
  login!: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  strategyProfileId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultBuyIn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBuyIn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxBuyIn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyLossLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sessionLossLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTables?: number;
}

class UpdateBotBody {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  strategyProfileId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultBuyIn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBuyIn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxBuyIn?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyLossLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sessionLossLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxTables?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsEnum(BotOperationMode)
  operationMode?: BotOperationMode;
}

@ApiTags('Bots')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('bots')
export class BotsController {
  constructor(
    private readonly botsService: BotsService,
    private readonly eventsService: EventsService,
  ) {}

  @Post()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Create a new bot' })
  async create(@Body() body: CreateBotBody) {
    return this.botsService.create(body);
  }

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  @ApiOperation({ summary: 'Get paginated list of bots' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sortBy', required: false, type: String })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'isEnabled', required: false, type: Boolean })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('isEnabled') isEnabled?: string,
  ) {
    return this.botsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
      search,
      sortBy,
      sortOrder,
      isEnabled: isEnabled === undefined ? undefined : isEnabled === 'true',
    });
  }

  @Get(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  @ApiOperation({ summary: 'Get a bot by ID with relations' })
  @ApiParam({ name: 'id', type: String })
  async findOne(@Param('id') id: string) {
    return this.botsService.findOne(id);
  }

  @Get(':id/live-state')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.VIEWER)
  @ApiOperation({ summary: 'Get the bot\'s current live table state (hole cards, board, pot)' })
  @ApiParam({ name: 'id', type: String })
  async getLiveState(@Param('id') id: string) {
    return this.eventsService.getBotLiveState(id) ?? {};
  }

  @Patch(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: 'Update a bot' })
  @ApiParam({ name: 'id', type: String })
  async update(@Param('id') id: string, @Body() body: UpdateBotBody) {
    return this.botsService.update(id, body);
  }

  @Delete(':id')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete a bot (sets isEnabled=false)' })
  @ApiParam({ name: 'id', type: String })
  async remove(@Param('id') id: string) {
    return this.botsService.remove(id);
  }

  @Post(':id/balance')
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.OPERATOR)
  @ApiOperation({ summary: "Add chips to the bot's Poker Mavens account balance" })
  @ApiParam({ name: 'id', type: String })
  async addBalance(@Param('id') id: string, @Body() body: AddBalanceBody) {
    return this.botsService.addBalance(id, body.amount);
  }
}
