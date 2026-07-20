import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordActionDto } from './dto/record-action.dto';

@Injectable()
export class ActionsService {
  constructor(private prisma: PrismaService) {}

  async recordAction(data: RecordActionDto) {
    const hand = await this.prisma.pokerHand.findUnique({
      where: { id: data.handId },
      select: { id: true },
    });

    if (!hand) {
      throw new NotFoundException(`Hand with ID ${data.handId} not found`);
    }

    return this.prisma.handAction.create({
      data: {
        handId: data.handId,
        botId: data.botId,
        externalPlayerId: data.externalPlayerId,
        street: data.street,
        sequence: data.sequence,
        action: data.action,
        amount: data.amount ?? 0,
        potBefore: data.potBefore,
        potAfter: data.potAfter,
        stackBefore: data.stackBefore,
        stackAfter: data.stackAfter,
        isBotAction: data.isBotAction ?? false,
      },
      include: {
        hand: {
          select: { id: true, gameType: true },
        },
        bot: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async getActionsByHand(handId: string) {
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

  async getActionsByBot(
    botId: string,
    pagination: { page?: number; limit?: number },
  ) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 50;
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.prisma.handAction.count({
        where: { botId },
      }),
      this.prisma.handAction.findMany({
        where: { botId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          hand: {
            select: { id: true, gameType: true, startedAt: true },
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

  async findAll(query: {
    page?: number;
    limit?: number;
    botId?: string;
    handId?: string;
    street?: string;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.botId) where.botId = query.botId;
    if (query.handId) where.handId = query.handId;
    if (query.street) where.street = query.street;

    const [total, data] = await Promise.all([
      this.prisma.handAction.count({ where }),
      this.prisma.handAction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          hand: {
            select: { id: true, gameType: true, startedAt: true },
          },
          bot: {
            select: { id: true, name: true },
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
}
