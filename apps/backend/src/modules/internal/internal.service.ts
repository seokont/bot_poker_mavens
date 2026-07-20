import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PokerMavensApiService } from '../tables/poker-mavens-api.service';

@Injectable()
export class InternalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly pokerMavensApi: PokerMavensApiService,
  ) {}

  async registerWorker(
    workerId: string,
    _hostname: string,
    _pid: number,
    _maxBots: number,
  ) {
    return this.prisma.botSession.updateMany({
      where: { workerId },
      data: { status: 'DISCONNECTED' },
    });
  }

  async processHeartbeat(
    workerId: string,
    botId: string,
    status: string,
    _tableId?: string,
    _handId?: string,
    _memoryUsage?: number,
    _browserConnected?: boolean,
  ) {
    const now = new Date();
    await this.prisma.botSession.updateMany({
      where: { botId, status: 'ACTIVE' },
      data: {
        lastHeartbeatAt: now,
        workerId,
      },
    });

    this.events.emitWorkerHeartbeat(workerId, botId, status);

    return { received: true, timestamp: now.toISOString() };
  }

  async updateBotStatus(
    botId: string,
    status: string,
    _workerId?: string,
    _tableId?: string,
    _handId?: string,
    errorMessage?: string,
  ) {
    const previousBot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { status: true },
    });

    const updatedBot = await this.prisma.bot.update({
      where: { id: botId },
      data: { status },
    });

    if (previousBot) {
      this.events.emitBotStatusChanged(
        botId,
        previousBot.status,
        status,
      );
    }

    if (status === 'RUNNING') {
      this.events.emitBotStarted(botId);
    } else if (status === 'STOPPED') {
      this.events.emitBotStopped(botId);
    }

    if (errorMessage) {
      this.events.emitBotError(botId, status, errorMessage);
    }

    return updatedBot;
  }

  async processBotEvent(
    botId: string,
    eventType: string,
    eventData: Record<string, unknown>,
  ) {
    await this.prisma.botSession.updateMany({
      where: { botId, status: 'ACTIVE' },
      data: { lastHeartbeatAt: new Date() },
    });

    // Emit the event through the gateway for admin UI visibility
    this.events.emit('botEvent', {
      botId,
      eventType,
      eventData,
      timestamp: new Date().toISOString(),
    });

    return { received: true };
  }

  reportLiveState(
    botId: string,
    data: {
      tableId?: string;
      handId?: string | null;
      street?: string;
      holeCards?: string[];
      boardCards?: string[];
      pot?: number;
      heroStack?: number;
    },
  ) {
    this.events.emitBotLiveState(botId, data);
    return { success: true };
  }

  /**
   * Get-or-create the real PokerHand row for a hand the worker just detected
   * starting. Idempotent by (tableId, externalHandId) so multiple bots at
   * the same table independently noticing the same hand converge on one
   * row instead of creating duplicates.
   */
  async startHand(
    tableName: string,
    externalHandId: string,
    stakes: { smallBlind: number; bigBlind: number; ante?: number; gameType?: string },
  ) {
    const table = await this.prisma.pokerTable.findFirst({
      where: { OR: [{ id: tableName }, { name: tableName }, { externalTableId: tableName }] },
    });

    if (!table) {
      throw new NotFoundException(`Table "${tableName}" not found`);
    }

    try {
      return await this.prisma.pokerHand.upsert({
        where: { tableId_externalHandId: { tableId: table.id, externalHandId } },
        create: {
          tableId: table.id,
          externalHandId,
          smallBlind: stakes.smallBlind,
          bigBlind: stakes.bigBlind,
          ante: stakes.ante ?? 0,
          gameType: stakes.gameType ?? 'NLH',
        },
        update: {},
      });
    } catch (err) {
      // Two bots at the same table can both notice a new hand within the
      // same tick and race to upsert it - upsert isn't atomic against a
      // true concurrent insert, so the loser hits the unique constraint.
      // The winner's row already exists at that point; just fetch it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.pokerHand.findUnique({
          where: { tableId_externalHandId: { tableId: table.id, externalHandId } },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  /**
   * Records (or updates) a bot's own result for a hand once that bot's
   * participation in it has ended (folded, or the hand concluded). Also
   * opportunistically marks the hand itself as finished and updates its
   * final pot - the first bot to report closes it out for stats purposes,
   * which is an acceptable approximation given we don't track the whole
   * table's action stream centrally.
   */
  async recordBotHand(
    botId: string,
    handId: string,
    data: { position?: string; startStack: number; endStack: number; showdown?: boolean; finalPot?: number },
  ) {
    const profitLoss = data.endStack - data.startStack;

    const [botHand] = await Promise.all([
      this.prisma.botHand.upsert({
        where: { botId_handId: { botId, handId } },
        create: {
          botId,
          handId,
          position: data.position,
          startStack: data.startStack,
          endStack: data.endStack,
          profitLoss,
          showdown: data.showdown ?? false,
          result: profitLoss >= 0 ? 'WIN' : 'LOSS',
        },
        update: {
          endStack: data.endStack,
          profitLoss,
          showdown: data.showdown ?? false,
          result: profitLoss >= 0 ? 'WIN' : 'LOSS',
        },
      }),
      this.prisma.pokerHand.updateMany({
        where: { id: handId, finishedAt: null },
        data: { finishedAt: new Date(), pot: data.finalPot ?? undefined },
      }),
    ]);

    this.events.emitBotHandFinished(botId, handId, botHand.result ?? 'UNKNOWN', profitLoss);

    return botHand;
  }

  async saveGameState(
    botId: string,
    _tableId: string,
    handId: string,
    turnId: string,
    stateJson: string,
  ) {
    return this.prisma.botDecision.create({
      data: {
        botId,
        handId,
        turnId,
        stateJson,
        decision: 'PENDING',
        executed: false,
      },
    });
  }

  async reportActionResult(
    botId: string,
    _tableId: string,
    handId: string,
    turnId: string,
    action: string,
    amount: number,
    success: boolean,
    errorMessage?: string,
    street?: string,
  ) {
    const decision = await this.prisma.botDecision.findFirst({
      where: { botId, handId, turnId },
      orderBy: { createdAt: 'desc' },
    });

    if (decision) {
      await this.prisma.botDecision.update({
        where: { id: decision.id },
        data: {
          executed: success,
          executionError: errorMessage,
        },
      });
    }

    const normalizedStreet = (street ?? '').toLowerCase();
    const sequence = await this.prisma.handAction.count({
      where: { handId, street: normalizedStreet },
    });

    await this.prisma.handAction.create({
      data: {
        handId,
        botId,
        street: normalizedStreet,
        sequence,
        action,
        amount,
        isBotAction: true,
      },
    });

    if (success) {
      this.events.emitBotActionExecuted(botId, handId, action, amount);
    } else {
      this.events.emitBotActionFailed(
        botId,
        handId,
        errorMessage || 'Unknown error',
      );
    }

    return { recorded: true };
  }

  async recordInternalAction(
    botId: string,
    _tableId: string,
    handId: string,
    _turnId: string,
    action: string,
    amount: number,
  ) {
    return this.prisma.handAction.create({
      data: {
        handId,
        botId,
        street: '',
        sequence: 0,
        action,
        amount,
        isBotAction: true,
      },
    });
  }

  async generateDirectLink(botIdOrLogin: string, tableName: string) {
    // Find the bot by ID or by login
    let bot = await this.prisma.bot.findUnique({
      where: { id: botIdOrLogin },
      select: { login: true },
    });

    if (!bot) {
      bot = await this.prisma.bot.findUnique({
        where: { login: botIdOrLogin },
        select: { login: true },
      });
    }

    if (!bot) {
      throw new NotFoundException(`Bot with ID or login "${botIdOrLogin}" not found`);
    }

    return this.pokerMavensApi.generateDirectTableLink(bot.login, tableName);
  }

  async getPmTableNames() {
    const tables = await this.pokerMavensApi.fetchTables();
    return tables.map(t => ({ name: t.name, gameType: t.gameType, limitType: t.limitType }));
  }

  async getPlayConfig(botId: string, tableId?: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      include: { strategyProfile: true },
    });

    if (!bot) {
      throw new NotFoundException(`Bot with ID "${botId}" not found`);
    }

    const profile = bot.strategyProfile;
    const cfg = (profile?.configurationJson as Record<string, unknown>) ?? {};

    const strategyConfig = {
      id: profile?.id ?? 'default-easy',
      name: profile?.name ?? 'EASY',
      difficulty: profile?.difficulty ?? 'EASY',
      preflopRanges: (cfg.preflopRanges as Record<string, string>) ?? {},
      aggression: typeof cfg.aggression === 'number' ? cfg.aggression : 0.2,
      bluffFrequency: typeof cfg.bluffFrequency === 'number' ? cfg.bluffFrequency : 0,
      cbetFrequency: typeof cfg.cbetFrequency === 'number' ? cfg.cbetFrequency : 0.3,
      betSizes: (cfg.betSizes as Record<string, number[]>) ?? {
        flop: [33, 50],
        turn: [50],
        river: [50],
      },
      maxAllInThreshold: typeof cfg.maxAllInThreshold === 'number' ? cfg.maxAllInThreshold : 0.8,
      randomization: typeof cfg.randomization === 'number' ? cfg.randomization : 0.1,
      enabledGames: (cfg.enabledGames as string[]) ?? ['NLH'],
      configurationJson: cfg,
    };

    let table: {
      smallBlind: number;
      bigBlind: number;
      ante: number;
      gameType: string;
      limitType: string;
    } | null = null;

    if (tableId) {
      // tableId here is actually the real Poker Mavens table name (e.g.
      // "game_1"), not the DB row id - callers only ever know the site's
      // table name, so look it up by name/externalTableId instead.
      const pokerTable = await this.prisma.pokerTable.findFirst({
        where: { OR: [{ id: tableId }, { name: tableId }, { externalTableId: tableId }] },
      });
      if (pokerTable) {
        table = {
          smallBlind: pokerTable.smallBlind,
          bigBlind: pokerTable.bigBlind,
          ante: pokerTable.ante,
          gameType: pokerTable.gameType,
          limitType: pokerTable.limitType,
        };
      }
    }

    return {
      operationMode: bot.operationMode,
      strategyConfig,
      table,
      defaultBuyIn: bot.defaultBuyIn,
      minBuyIn: bot.minBuyIn,
      maxBuyIn: bot.maxBuyIn,
    };
  }
}
