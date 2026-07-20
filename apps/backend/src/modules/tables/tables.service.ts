import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PokerMavensApiService } from './poker-mavens-api.service';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import type { SyncTablesDto } from './dto/sync-tables.dto';
import type { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    private prisma: PrismaService,
    private pokerMavensApi: PokerMavensApiService,
  ) {}

  async findAll(pagination: PaginationQueryDto) {
    const { page = 1, limit = 20, search, gameType, isAllowedForBots } = pagination;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { externalTableId: { contains: search } },
      ];
    }

    if (gameType) {
      where.gameType = gameType;
    }

    if (isAllowedForBots !== undefined) {
      where.isAllowedForBots = isAllowedForBots === 'true';
    }

    const [items, total] = await Promise.all([
      this.prisma.pokerTable.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { tableSessions: true },
          },
        },
      }),
      this.prisma.pokerTable.count({ where }),
    ]);

    return {
      data: items.map((table) => ({
        ...table,
        botCount: table._count.tableSessions,
        _count: undefined,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const table = await this.prisma.pokerTable.findUnique({
      where: { id },
      include: {
        tableSessions: {
          include: {
            bot: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
          orderBy: { joinedAt: 'desc' },
        },
      },
    });

    if (!table) {
      throw new NotFoundException(`Table with id "${id}" not found`);
    }

    return table;
  }

  async sync(externalTables: SyncTablesDto['tables']) {
    const results: Array<{ externalTableId: string; action: 'created' | 'updated' }> = [];

    for (const table of externalTables) {
      const existing = await this.prisma.pokerTable.findUnique({
        where: { externalTableId: table.externalTableId },
      });

      if (existing) {
        await this.prisma.pokerTable.update({
          where: { externalTableId: table.externalTableId },
          data: {
            name: table.name,
            gameType: table.gameType ?? existing.gameType,
            limitType: table.limitType ?? existing.limitType,
            smallBlind: table.smallBlind ?? existing.smallBlind,
            bigBlind: table.bigBlind ?? existing.bigBlind,
            ante: table.ante ?? existing.ante,
            minBuyIn: table.minBuyIn ?? existing.minBuyIn,
            maxBuyIn: table.maxBuyIn ?? existing.maxBuyIn,
            maxPlayers: table.maxPlayers ?? existing.maxPlayers,
            isAllowedForBots: table.isAllowedForBots ?? existing.isAllowedForBots,
          },
        });
        results.push({ externalTableId: table.externalTableId, action: 'updated' });
      } else {
        await this.prisma.pokerTable.create({
          data: {
            externalTableId: table.externalTableId,
            name: table.name,
            gameType: table.gameType ?? 'NLH',
            limitType: table.limitType ?? 'NL',
            smallBlind: table.smallBlind ?? 1,
            bigBlind: table.bigBlind ?? 2,
            ante: table.ante ?? 0,
            minBuyIn: table.minBuyIn ?? 200,
            maxBuyIn: table.maxBuyIn ?? 5000,
            maxPlayers: table.maxPlayers ?? 9,
            isAllowedForBots: table.isAllowedForBots ?? true,
          },
        });
        results.push({ externalTableId: table.externalTableId, action: 'created' });
      }
    }

    return { synced: results.length, results };
  }

  async syncFromMavens() {
    const tables = await this.pokerMavensApi.fetchTables();
    if (tables.length === 0) {
      this.logger.warn('No tables fetched from Poker Mavens API');
      return { synced: 0, results: [], message: 'No tables returned from Poker Mavens. Check API credentials.' };
    }

    return this.sync(tables);
  }

  async update(id: string, data: UpdateTableDto) {
    const existing = await this.prisma.pokerTable.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`Table with id "${id}" not found`);
    }

    return this.prisma.pokerTable.update({
      where: { id },
      data,
    });
  }

  async findByExternalId(externalTableId: string) {
    return this.prisma.pokerTable.findUnique({
      where: { externalTableId },
    });
  }

  async generateDirectLink(nickname: string, tableName: string) {
    const { url, params } = await this.pokerMavensApi.generateDirectTableLink(
      nickname,
      tableName,
    );

    // Log the action
    this.logger.log(`Generated direct link: nickname="${nickname}" table="${tableName}"`);

    return {
      url,
      params: {
        LoginName: params.nickname,
        SessionKey: params.sessionKey,
        TableName: params.encodedName,
        TableType: params.tableType,
      },
    };
  }
}
