import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ActionsService } from './actions.service';
import { ActionsQueryDto } from './dto/record-action.dto';

@ApiTags('Actions')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('actions')
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get()
  @ApiOperation({ summary: 'List all hand actions (admin use)' })
  async findAll(query: ActionsQueryDto) {
    return this.actionsService.findAll(query);
  }
}
