import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { HandsService } from './hands.service';
import { HandsQueryDto } from './dto/hands-query.dto';
import { CreateHandDto, UpdateFinishedHandDto } from './dto/create-hand.dto';

@ApiTags('Hands')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('hands')
export class HandsController {
  constructor(private readonly handsService: HandsService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated list of poker hands with filters' })
  async findAll(@Query() query: HandsQueryDto) {
    return this.handsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single hand with all relations' })
  @ApiParam({ name: 'id', description: 'Hand ID' })
  async findOne(@Param('id') id: string) {
    return this.handsService.findOne(id);
  }

  @Get(':id/actions')
  @ApiOperation({ summary: 'Get actions for a specific hand' })
  @ApiParam({ name: 'id', description: 'Hand ID' })
  async getHandActions(@Param('id') id: string) {
    return this.handsService.getHandActions(id);
  }

  @Get(':id/decisions')
  @ApiOperation({ summary: 'Get bot decisions for a specific hand' })
  @ApiParam({ name: 'id', description: 'Hand ID' })
  async getHandDecisions(@Param('id') id: string) {
    return this.handsService.getHandDecisions(id);
  }

  @Post()
  @ApiOperation({ summary: 'Record a new poker hand' })
  async create(@Body() createHandDto: CreateHandDto) {
    return this.handsService.create(createHandDto);
  }

  @Patch(':id/finished')
  @ApiOperation({ summary: 'Mark a hand as finished with results' })
  @ApiParam({ name: 'id', description: 'Hand ID' })
  async updateFinished(
    @Param('id') id: string,
    @Body() updateFinishedHandDto: UpdateFinishedHandDto,
  ) {
    return this.handsService.updateFinished(id, updateFinishedHandDto);
  }
}
