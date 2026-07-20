import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { BotLimit } from '@prisma/client';

export interface LimitsCheckResult {
  passed: boolean;
  triggered: string[];
}

export interface UpdateLimitsDto {
  maxDailyLoss?: number;
  maxSessionLoss?: number;
  maxHandsPerSession?: number;
  maxSessionDurationMinutes?: number;
  maxBuyIn?: number;
  minBalance?: number;
  autoStopEnabled?: boolean;
}

@Injectable()
export class LimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async checkDailyLoss(botId: string, currentLoss: number): Promise<boolean> {
    const limits = await this.getLimits(botId);
    if (!limits) return false;

    const triggered = currentLoss <= limits.maxDailyLoss;
    if (triggered) {
      this.events.emitLimitsTriggered(botId, 'DAILY_LOSS', currentLoss, limits.maxDailyLoss);
    }

    return triggered;
  }

  async checkSessionLoss(
    botId: string,
    _sessionId: string,
    currentLoss: number,
  ): Promise<boolean> {
    const limits = await this.getLimits(botId);
    if (!limits) return false;

    const triggered = currentLoss <= limits.maxSessionLoss;
    if (triggered) {
      this.events.emitLimitsTriggered(botId, 'SESSION_LOSS', currentLoss, limits.maxSessionLoss);
    }

    return triggered;
  }

  async checkMinBalance(botId: string, currentBalance: number): Promise<boolean> {
    const limits = await this.getLimits(botId);
    if (!limits) return false;

    const triggered = currentBalance < limits.minBalance;
    if (triggered) {
      this.events.emitLimitsTriggered(botId, 'MIN_BALANCE', currentBalance, limits.minBalance);
    }

    return triggered;
  }

  async checkSessionDuration(botId: string, sessionId: string): Promise<boolean> {
    const limits = await this.getLimits(botId);
    if (!limits) return false;

    const session = await this.prisma.botSession.findUnique({
      where: { id: sessionId },
      select: { startedAt: true },
    });
    if (!session) return false;

    const elapsedMinutes =
      (Date.now() - session.startedAt.getTime()) / 60_000;
    const triggered = elapsedMinutes >= limits.maxSessionDurationMinutes;

    if (triggered) {
      this.events.emitLimitsTriggered(
        botId,
        'SESSION_DURATION',
        elapsedMinutes,
        limits.maxSessionDurationMinutes,
      );
    }

    return triggered;
  }

  async checkHandsPerSession(
    sessionId: string,
    currentHandCount: number,
  ): Promise<boolean> {
    const session = await this.prisma.botSession.findUnique({
      where: { id: sessionId },
      select: { botId: true },
    });
    if (!session) return false;

    const limits = await this.getLimits(session.botId);
    if (!limits) return false;

    const triggered = currentHandCount >= limits.maxHandsPerSession;
    if (triggered) {
      this.events.emitLimitsTriggered(
        session.botId,
        'HANDS_PER_SESSION',
        currentHandCount,
        limits.maxHandsPerSession,
      );
    }

    return triggered;
  }

  async checkAll(
    botId: string,
    sessionId: string,
    currentLoss: number,
    currentBalance: number,
    currentHandCount: number,
  ): Promise<LimitsCheckResult> {
    const triggered: string[] = [];

    if (await this.checkDailyLoss(botId, currentLoss)) {
      triggered.push('DAILY_LOSS');
    }
    if (await this.checkSessionLoss(botId, sessionId, currentLoss)) {
      triggered.push('SESSION_LOSS');
    }
    if (await this.checkMinBalance(botId, currentBalance)) {
      triggered.push('MIN_BALANCE');
    }
    if (await this.checkSessionDuration(botId, sessionId)) {
      triggered.push('SESSION_DURATION');
    }
    if (await this.checkHandsPerSession(sessionId, currentHandCount)) {
      triggered.push('HANDS_PER_SESSION');
    }

    if (triggered.length > 0) {
      this.events.emit('limitsTriggered', {
        botId,
        sessionId,
        triggered,
      });
    }

    return {
      passed: triggered.length === 0,
      triggered,
    };
  }

  async getLimits(botId: string): Promise<BotLimit | null> {
    return this.prisma.botLimit.findUnique({
      where: { botId },
    });
  }

  async updateLimits(
    botId: string,
    data: UpdateLimitsDto,
  ): Promise<BotLimit> {
    return this.prisma.botLimit.upsert({
      where: { botId },
      create: {
        botId,
        ...data,
      },
      update: data,
    });
  }
}
