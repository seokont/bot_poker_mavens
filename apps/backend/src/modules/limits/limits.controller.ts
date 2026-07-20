import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LimitsService, UpdateLimitsDto } from './limits.service';
import { AdminRole } from '@poker-bot/shared-types';

@Controller('bots/:id/limits')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class LimitsController {
  constructor(private readonly limitsService: LimitsService) {}

  @Get()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.VIEWER)
  async getLimits(@Param('id') botId: string) {
    return this.limitsService.getLimits(botId);
  }

  @Patch()
  @Roles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  async updateLimits(
    @Param('id') botId: string,
    @Body() data: UpdateLimitsDto,
  ) {
    return this.limitsService.updateLimits(botId, data);
  }
}
