import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStrategyDto } from './dto/create-strategy.dto';
import type { PaginationQueryDto } from './dto/pagination-query.dto';
import type { UpdateStrategyDto } from './dto/update-strategy.dto';

@Injectable()
export class StrategiesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateStrategyDto) {
    const existing = await this.prisma.strategyProfile.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `Strategy profile with name "${dto.name}" already exists`,
      );
    }

    return this.prisma.strategyProfile.create({
      data: {
        name: dto.name,
        description: dto.description,
        difficulty: dto.difficulty,
        configurationJson: (dto.configurationJson ?? undefined) as any,
      },
    });
  }

  async findAll(pagination: PaginationQueryDto) {
    const { page = 1, limit = 20, search, difficulty, isActive } = pagination;

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (difficulty) {
      where.difficulty = difficulty;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [items, total] = await Promise.all([
      this.prisma.strategyProfile.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { bots: true },
          },
        },
      }),
      this.prisma.strategyProfile.count({ where }),
    ]);

    return {
      data: items.map((strategy) => ({
        ...strategy,
        botCount: strategy._count.bots,
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
    const strategy = await this.prisma.strategyProfile.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bots: true },
        },
      },
    });

    if (!strategy) {
      throw new NotFoundException(
        `Strategy profile with id "${id}" not found`,
      );
    }

    return {
      ...strategy,
      botCount: strategy._count.bots,
      _count: undefined,
    };
  }

  async update(id: string, dto: UpdateStrategyDto) {
    const existing = await this.prisma.strategyProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(
        `Strategy profile with id "${id}" not found`,
      );
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.prisma.strategyProfile.findUnique({
        where: { name: dto.name },
      });
      if (nameConflict) {
        throw new ConflictException(
          `Strategy profile with name "${dto.name}" already exists`,
        );
      }
    }

    return this.prisma.strategyProfile.update({
      where: { id },
      data: dto as any,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.strategyProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(
        `Strategy profile with id "${id}" not found`,
      );
    }

    return this.prisma.strategyProfile.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async clone(id: string) {
    const existing = await this.prisma.strategyProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(
        `Strategy profile with id "${id}" not found`,
      );
    }

    const clonedName = `${existing.name} (Copy)`;

    return this.prisma.strategyProfile.create({
      data: {
        name: clonedName,
        description: existing.description,
        difficulty: existing.difficulty,
        configurationJson: (existing.configurationJson ?? undefined) as any,
        isActive: existing.isActive,
      },
    });
  }
}
