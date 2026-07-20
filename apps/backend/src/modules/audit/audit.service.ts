import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLog } from '@prisma/client';

export interface AuditLogFilters {
  adminUserId?: string;
  action?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginatedAuditLogs {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    action: string,
    entityType: string,
    entityId: string,
    beforeJson?: string,
    afterJson?: string,
    adminUserId?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        beforeJson,
        afterJson,
        adminUserId,
        ipAddress,
        userAgent,
      },
    });
  }

  async findAll(
    pagination: PaginationParams,
    filters?: AuditLogFilters,
  ): Promise<PaginatedAuditLogs> {
    const { page, limit } = pagination;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (filters?.adminUserId) {
      where.adminUserId = filters.adminUserId;
    }
    if (filters?.action) {
      where.action = filters.action;
    }
    if (filters?.entityType) {
      where.entityType = filters.entityType;
    }
    if (filters?.dateFrom || filters?.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (filters.dateFrom) {
        createdAt.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        createdAt.lte = new Date(filters.dateTo);
      }
      where.createdAt = createdAt;
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          adminUser: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByEntity(
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        adminUser: {
          select: { id: true, email: true, name: true },
        },
      },
    });
  }
}
