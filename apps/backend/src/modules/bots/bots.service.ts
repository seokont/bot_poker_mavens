import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { EventsService } from '../events/events.service';
import { PokerMavensApiService } from '../tables/poker-mavens-api.service';
import { BotStatus, BotOperationMode } from '@poker-bot/shared-types';
import { Prisma } from '@prisma/client';

interface CreateBotInput {
  name: string;
  login: string;
  password: string;
  strategyProfileId?: string;
  defaultBuyIn?: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  dailyLossLimit?: number;
  sessionLossLimit?: number;
  maxTables?: number;
}

interface UpdateBotInput {
  name?: string;
  password?: string;
  strategyProfileId?: string;
  defaultBuyIn?: number;
  minBuyIn?: number;
  maxBuyIn?: number;
  dailyLossLimit?: number;
  sessionLossLimit?: number;
  maxTables?: number;
  isEnabled?: boolean;
  operationMode?: BotOperationMode;
}

interface FindAllQuery {
  page?: number;
  limit?: number;
  status?: string;
  isEnabled?: boolean;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const botInclude = {
  strategyProfile: true,
  limit: true,
  sessions: {
    where: { status: 'ACTIVE' },
    take: 1,
    orderBy: { startedAt: 'desc' },
  },
} satisfies Prisma.BotInclude;

@Injectable()
export class BotsService {
  private readonly logger = new Logger(BotsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly eventsService: EventsService,
    private readonly pokerMavensApi: PokerMavensApiService,
  ) {}

  async create(input: CreateBotInput) {
    const existingBot = await this.prisma.bot.findUnique({
      where: { login: input.login },
    });

    if (existingBot) {
      throw new ConflictException(`Bot with login "${input.login}" already exists`);
    }

    // Create the real player account on the Poker Mavens server first - a
    // bot record with no matching site account would never be able to log
    // in. "Already exists" is fine (the operator may have registered it
    // manually beforehand); any other failure aborts before we touch our DB.
    try {
      await this.pokerMavensApi.createPlayerAccount(
        input.login,
        input.password,
        `${input.login}@bots.local`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to create Poker Mavens account for "${input.login}": ${message}`);
      throw new BadRequestException(`Could not create player account on the poker server: ${message}`);
    }

    const encryptedPassword = this.encryptionService.encrypt(input.password);
    const defaultBuyIn = input.defaultBuyIn ?? 1000;
    const minBuyIn = input.minBuyIn ?? 200;
    const maxBuyIn = input.maxBuyIn ?? 5000;
    const dailyLossLimit = input.dailyLossLimit ?? -5000;
    const sessionLossLimit = input.sessionLossLimit ?? -2000;
    const maxTables = input.maxTables ?? 1;

    const bot = await this.prisma.bot.create({
      data: {
        name: input.name,
        login: input.login,
        encryptedPassword,
        status: BotStatus.OFFLINE,
        isEnabled: true,
        operationMode: BotOperationMode.AUTONOMOUS,
        strategyProfileId: input.strategyProfileId ?? null,
        defaultBuyIn,
        minBuyIn,
        maxBuyIn,
        dailyLossLimit,
        sessionLossLimit,
        maxTables,
        limit: {
          create: {
            maxDailyLoss: dailyLossLimit,
            maxSessionLoss: sessionLossLimit,
            maxBuyIn,
            maxHandsPerSession: 500,
            maxSessionDurationMinutes: 480,
            minBalance: 100,
            autoStopEnabled: true,
          },
        },
      },
      include: botInclude,
    });

    this.eventsService.emit('bot:created', {
      botId: bot.id,
      name: bot.name,
    } as Record<string, unknown>);

    return bot;
  }

  async findAll(query: FindAllQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.BotWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.isEnabled !== undefined) {
      where.isEnabled = query.isEnabled;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { login: { contains: query.search } },
      ];
    }

    const [bots, total] = await Promise.all([
      this.prisma.bot.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          strategyProfile: {
            select: { id: true, name: true, difficulty: true },
          },
          limit: true,
          sessions: {
            where: { status: 'ACTIVE' },
            select: { id: true, startedAt: true, workerId: true },
            take: 1,
          },
        },
      }),
      this.prisma.bot.count({ where }),
    ]);

    return {
      data: bots,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id },
      include: botInclude,
    });

    if (!bot) {
      throw new NotFoundException(`Bot with ID "${id}" not found`);
    }

    return bot;
  }

  async update(id: string, input: UpdateBotInput) {
    const bot = await this.prisma.bot.findUnique({ where: { id } });

    if (!bot) {
      throw new NotFoundException(`Bot with ID "${id}" not found`);
    }

    const data: Prisma.BotUpdateInput = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.password !== undefined) {
      data.encryptedPassword = this.encryptionService.encrypt(input.password);
    }

    if (input.strategyProfileId !== undefined) {
      data.strategyProfile =
        input.strategyProfileId === null
          ? { disconnect: true }
          : { connect: { id: input.strategyProfileId } };
    }

    if (input.defaultBuyIn !== undefined) {
      data.defaultBuyIn = input.defaultBuyIn;
    }

    if (input.minBuyIn !== undefined) {
      data.minBuyIn = input.minBuyIn;
    }

    if (input.maxBuyIn !== undefined) {
      data.maxBuyIn = input.maxBuyIn;
    }

    if (input.dailyLossLimit !== undefined) {
      data.dailyLossLimit = input.dailyLossLimit;
    }

    if (input.sessionLossLimit !== undefined) {
      data.sessionLossLimit = input.sessionLossLimit;
    }

    if (input.maxTables !== undefined) {
      data.maxTables = input.maxTables;
    }

    if (input.isEnabled !== undefined) {
      data.isEnabled = input.isEnabled;
    }

    if (input.operationMode !== undefined) {
      data.operationMode = input.operationMode;
    }

    const updatedBot = await this.prisma.bot.update({
      where: { id },
      data,
      include: botInclude,
    });

    this.eventsService.emit('bot:updated', {
      botId: updatedBot.id,
    } as Record<string, unknown>);

    return updatedBot;
  }

  async remove(id: string) {
    const bot = await this.prisma.bot.findUnique({ where: { id } });

    if (!bot) {
      throw new NotFoundException(`Bot with ID "${id}" not found`);
    }

    const updatedBot = await this.prisma.bot.update({
      where: { id },
      data: { isEnabled: false },
      include: botInclude,
    });

    this.eventsService.emit('bot:disabled', {
      botId: updatedBot.id,
    } as Record<string, unknown>);

    return updatedBot;
  }

  async addBalance(id: string, amount: number) {
    const bot = await this.prisma.bot.findUnique({ where: { id } });

    if (!bot) {
      throw new NotFoundException(`Bot with ID "${id}" not found`);
    }

    let newBalance: number;
    try {
      newBalance = await this.pokerMavensApi.incrementBalance(bot.login, amount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to add balance for bot "${bot.login}": ${message}`);
      throw new BadRequestException(`Could not add balance on the poker server: ${message}`);
    }

    this.eventsService.emit('bot:balance-added', {
      botId: bot.id,
      amount,
      newBalance,
    } as Record<string, unknown>);

    return { botId: bot.id, login: bot.login, amountAdded: amount, newBalance };
  }
}
