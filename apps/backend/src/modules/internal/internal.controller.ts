import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';
import { InternalService } from './internal.service';

@Controller('internal')
@UseGuards(InternalApiGuard)
export class InternalController {
  constructor(private readonly internalService: InternalService) {}

  @Post('workers/register')
  async registerWorker(
    @Body() body: { workerId: string; hostname: string; pid: number; maxBots: number },
  ) {
    return this.internalService.registerWorker(
      body.workerId,
      body.hostname,
      body.pid,
      body.maxBots,
    );
  }

  @Post('workers/heartbeat')
  async processHeartbeat(
    @Body()
    body: {
      workerId: string;
      botId: string;
      status: string;
      tableId?: string;
      handId?: string;
      lastActionAt?: string;
      memoryUsage?: number;
      browserConnected?: boolean;
    },
  ) {
    return this.internalService.processHeartbeat(
      body.workerId,
      body.botId,
      body.status,
      body.tableId,
      body.handId,
      body.memoryUsage,
      body.browserConnected,
    );
  }

  @Post('bots/status')
  async updateBotStatus(
    @Body()
    body: {
      botId: string;
      status: string;
      workerId?: string;
      tableId?: string;
      handId?: string;
      errorMessage?: string;
    },
  ) {
    return this.internalService.updateBotStatus(
      body.botId,
      body.status,
      body.workerId,
      body.tableId,
      body.handId,
      body.errorMessage,
    );
  }

  @Post('bots/event')
  async processBotEvent(
    @Body()
    body: {
      botId: string;
      eventType: string;
      eventData: Record<string, unknown>;
    },
  ) {
    return this.internalService.processBotEvent(
      body.botId,
      body.eventType,
      body.eventData,
    );
  }

  @Post('bots/game-state')
  async saveGameState(
    @Body()
    body: {
      botId: string;
      tableId: string;
      handId: string;
      turnId: string;
      stateJson: string;
    },
  ) {
    return this.internalService.saveGameState(
      body.botId,
      body.tableId,
      body.handId,
      body.turnId,
      body.stateJson,
    );
  }

  @Post('bots/live-state')
  async reportLiveState(
    @Body()
    body: {
      botId: string;
      tableId?: string;
      handId?: string | null;
      street?: string;
      holeCards?: string[];
      boardCards?: string[];
      pot?: number;
      heroStack?: number;
    },
  ) {
    return this.internalService.reportLiveState(body.botId, body);
  }

  @Post('bots/action-result')
  async reportActionResult(
    @Body()
    body: {
      botId: string;
      tableId: string;
      handId: string;
      turnId: string;
      action: string;
      amount?: number;
      success: boolean;
      errorMessage?: string;
      street?: string;
    },
  ) {
    return this.internalService.reportActionResult(
      body.botId,
      body.tableId,
      body.handId,
      body.turnId,
      body.action,
      body.amount ?? 0,
      body.success,
      body.errorMessage,
      body.street,
    );
  }

  @Post('hands/start')
  async startHand(
    @Body()
    body: {
      tableId: string;
      externalHandId: string;
      smallBlind: number;
      bigBlind: number;
      ante?: number;
      gameType?: string;
    },
  ) {
    return this.internalService.startHand(body.tableId, body.externalHandId, {
      smallBlind: body.smallBlind,
      bigBlind: body.bigBlind,
      ante: body.ante,
      gameType: body.gameType,
    });
  }

  @Post('bots/hand-result')
  async recordBotHand(
    @Body()
    body: {
      botId: string;
      handId: string;
      position?: string;
      startStack: number;
      endStack: number;
      showdown?: boolean;
      finalPot?: number;
    },
  ) {
    return this.internalService.recordBotHand(body.botId, body.handId, {
      position: body.position,
      startStack: body.startStack,
      endStack: body.endStack,
      showdown: body.showdown,
      finalPot: body.finalPot,
    });
  }

  @Post('bot-action')
  async recordInternalAction(
    @Body()
    body: {
      botId: string;
      tableId: string;
      handId: string;
      turnId: string;
      action: string;
      amount?: number;
    },
  ) {
    return this.internalService.recordInternalAction(
      body.botId,
      body.tableId,
      body.handId,
      body.turnId,
      body.action,
      body.amount ?? 0,
    );
  }

  @Post('bots/direct-link')
  async generateDirectLink(
    @Body()
    body: {
      botId: string;
      tableName: string;
    },
  ) {
    return this.internalService.generateDirectLink(body.botId, body.tableName);
  }

  @Post('pm-table-names')
  async getTableNames() {
    return this.internalService.getPmTableNames();
  }

  @Get('bots/:botId/play-config')
  async getPlayConfig(
    @Param('botId') botId: string,
    @Query('tableId') tableId?: string,
  ) {
    return this.internalService.getPlayConfig(botId, tableId);
  }
}
