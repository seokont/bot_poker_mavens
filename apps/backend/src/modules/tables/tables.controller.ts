import {
  Controller,
  Get,
  Post,
  Patch,
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
import { TablesService } from './tables.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { SyncTablesDto } from './dto/sync-tables.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { DirectTableLinkDto } from './dto/direct-table-link.dto';

@ApiTags('Tables')
@Controller('tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of poker tables' })
  async findAll(@Query() pagination: PaginationQueryDto) {
    return this.tablesService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single table with connected bot sessions' })
  async findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Post('sync')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync tables from external API data (upsert)' })
  async sync(@Body() dto: SyncTablesDto) {
    return this.tablesService.sync(dto.tables);
  }

  @Post('sync-from-mavens')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync tables directly from Poker Mavens Admin API' })
  async syncFromMavens() {
    return this.tablesService.syncFromMavens();
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update table settings' })
  async update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tablesService.update(id, dto);
  }

  @Post('direct-link')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate a direct table link for auto-login' })
  async generateDirectLink(@Body() dto: DirectTableLinkDto) {
    return this.tablesService.generateDirectLink(dto.nickname, dto.tableName);
  }
}
