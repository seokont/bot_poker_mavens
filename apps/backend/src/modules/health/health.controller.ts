import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Basic health check' })
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness check' })
  async readiness() {
    const checks = {
      database: false,
      redis: false,
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      await this.redis.ping();
      checks.redis = true;
    } catch {
      checks.redis = false;
    }

    const allReady = Object.values(checks).every(Boolean);
    return {
      status: allReady ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Liveness check' })
  async liveness() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
