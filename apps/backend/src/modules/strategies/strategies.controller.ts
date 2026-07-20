import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminRole } from '@poker-bot/shared-types';
import { StrategiesService } from './strategies.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

@ApiTags('Strategies')
@Controller('strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of strategy profiles' })
  async findAll(@Query() pagination: PaginationQueryDto) {
    return this.strategiesService.findAll(pagination);
  }

  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new strategy profile' })
  async create(@Body() dto: CreateStrategyDto) {
    return this.strategiesService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single strategy profile' })
  async findOne(@Param('id') id: string) {
    return this.strategiesService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a strategy profile' })
  async update(@Param('id') id: string, @Body() dto: UpdateStrategyDto) {
    return this.strategiesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete a strategy profile (set isActive=false)' })
  async remove(@Param('id') id: string) {
    return this.strategiesService.remove(id);
  }

  @Post(':id/clone')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deep clone a strategy profile with "(Copy)" suffix' })
  async clone(@Param('id') id: string) {
    return this.strategiesService.clone(id);
  }
}
