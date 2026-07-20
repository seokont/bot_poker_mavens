import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HandsQueryDto } from './dto/hands-query.dto';
import { CreateHandDto, UpdateFinishedHandDto } from './dto/create-hand.dto';
import { PaginatedResult } from './dto/pagination-query.dto';

@Injectable()
export class HandsService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: HandsQueryDto): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 20,
      botId,
      tableId,
      gameType,
      dateFrom,
      dateTo,
      result,
      sortBy = 'startedAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (tableId) where.tableId = tableId;
    if (gameType) where.gameType = gameType;

    if (dateFrom || dateTo) {
      where.startedAt = {};
      if (dateFrom) where.startedAt.gte = new Date(dateFrom);
      if (dateTo) where.startedAt.lte = new Date(dateTo);
    }

    if (botId || result) {
      where.botHands = {};
      if (botId) where.botHands.some = { botId };
      if (result) where.botHands.some = { ...where.botHands.some, result };
    }

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [total, data] = await Promise.all([
      this.prisma.pokerHand.count({ where }),
      this.prisma.pokerHand.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          table: true,
          botHands: {
            include: {
              bot: {
                select: { id: true, name: true, login: true },
              },
            },
          },
          _count: {
            select: { actions: true },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const hand = await this.prisma.pokerHand.findUnique({
      where: { id },
      include: {
        table: true,
        botHands: {
          include: {
            bot: {
              select: { id: true, name: true, login: true },
            },
          },
        },
        actions: {
          orderBy: { sequence: 'asc' },
        },
        decisions: {
          include: {
            bot: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!hand) {
      throw new NotFoundException(`Hand with ID ${id} not found`);
    }

    return hand;
  }

  async getHandActions(handId: string) {
    const hand = await this.prisma.pokerHand.findUnique({
      where: { id: handId },
      select: { id: true },
    });

    if (!hand) {
      throw new NotFoundException(`Hand with ID ${handId} not found`);
    }

    return this.prisma.handAction.findMany({
      where: { handId },
      orderBy: { sequence: 'asc' },
      include: {
        bot: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async getHandDecisions(handId: string) {
    const hand = await this.prisma.pokerHand.findUnique({
      where: { id: handId },
      select: { id: true },
    });

    if (!hand) {
      throw new NotFoundException(`Hand with ID ${handId} not found`);
    }

    return this.prisma.botDecision.findMany({
      where: { handId },
      orderBy: { createdAt: 'asc' },
      include: {
        bot: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async create(data: CreateHandDto) {
    return this.prisma.pokerHand.create({
      data: {
        externalHandId: data.externalHandId,
        tableId: data.tableId,
        gameType: data.gameType ?? 'NLH',
        smallBlind: data.smallBlind,
        bigBlind: data.bigBlind,
        ante: data.ante ?? 0,
        buttonSeat: data.buttonSeat,
        boardJson: data.boardJson,
        pot: data.pot ?? 0,
        rake: data.rake ?? 0,
        rawStateJson: data.rawStateJson,
      },
      include: {
        table: true,
      },
    });
  }

  async updateFinished(id: string, finishedData: UpdateFinishedHandDto) {
    const hand = await this.prisma.pokerHand.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!hand) {
      throw new NotFoundException(`Hand with ID ${id} not found`);
    }

    return this.prisma.pokerHand.update({
      where: { id },
      data: {
        finishedAt: new Date(finishedData.finishedAt),
        pot: finishedData.pot,
        rake: finishedData.rake,
        boardJson: finishedData.boardJson,
        rawStateJson: finishedData.rawStateJson,
      },
      include: {
        table: true,
        botHands: {
          include: {
            bot: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }
}
