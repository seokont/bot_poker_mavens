import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { BotStatus } from '@poker-bot/shared-types';
import { QueueService, QueueName, JobType } from '../queue/queue.service';

@Injectable()
export class BotSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly queueService: QueueService,
  ) {}

  async create(
    botId: string,
    workerId: string,
    browserSessionId?: string,
    startBalance?: number,
  ) {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      throw new NotFoundException(`Bot with ID "${botId}" not found`);
    }

    if (bot.status !== BotStatus.OFFLINE && bot.status !== BotStatus.ERROR) {
      throw new Error(
        `Cannot create session for bot "${botId}" in status "${bot.status}"`,
      );
    }

    const [session] = await Promise.all([
      this.prisma.botSession.create({
        data: {
          botId,
          workerId,
          browserSessionId: browserSessionId ?? null,
          startBalance: startBalance ?? null,
          status: 'ACTIVE',
          lastHeartbeatAt: new Date(),
        },
      }),
      this.prisma.bot.update({
        where: { id: botId },
        data: { status: BotStatus.STARTING },
      }),
    ]);

    this.eventsService.emit('bot-session:created', {
      botId,
      sessionId: session.id,
      workerId,
    } as Record<string, unknown>);

    return session;
  }

  async endSession(
    sessionId: string,
    endBalance: number,
    errorMessage?: string,
  ) {
    const session = await this.prisma.botSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found`);
    }

    const startBalance = session.startBalance ?? endBalance;
    const profitLoss = endBalance - startBalance;

    const [updatedSession] = await Promise.all([
      this.prisma.botSession.update({
        where: { id: sessionId },
        data: {
          endedAt: new Date(),
          endBalance,
          profitLoss,
          status: 'ENDED',
          errorMessage: errorMessage ?? null,
        },
      }),
      this.prisma.bot.update({
        where: { id: session.botId },
        data: { status: BotStatus.OFFLINE },
      }),
    ]);

    this.eventsService.emit('bot-session:ended', {
      botId: session.botId,
      sessionId,
      profitLoss,
      errorMessage,
    } as Record<string, unknown>);

    return updatedSession;
  }

  async updateHeartbeat(sessionId: string) {
    const session = await this.prisma.botSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found`);
    }

    return this.prisma.botSession.update({
      where: { id: sessionId },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  async findActiveByBot(botId: string) {
    return this.prisma.botSession.findFirst({
      where: {
        botId,
        status: 'ACTIVE',
      },
    });
  }

  async findLostSessions(timeoutMs: number) {
    const cutoff = new Date(Date.now() - timeoutMs);

    return this.prisma.botSession.findMany({
      where: {
        status: 'ACTIVE',
        lastHeartbeatAt: {
          lt: cutoff,
        },
      },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
            login: true,
          },
        },
      },
    });
  }

  async markLost(sessionId: string) {
    const session = await this.prisma.botSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID "${sessionId}" not found`);
    }

    const [updatedSession] = await Promise.all([
      this.prisma.botSession.update({
        where: { id: sessionId },
        data: {
          status: 'LOST',
          endedAt: new Date(),
          errorMessage: 'Session lost due to heartbeat timeout',
        },
      }),
      this.prisma.bot.update({
        where: { id: session.botId },
        data: { status: BotStatus.ERROR },
      }),
    ]);

    this.eventsService.emit('bot-session:lost', {
      botId: session.botId,
      sessionId,
    } as Record<string, unknown>);

    await this.queueService.addJob(
      QueueName.BOT_RECONNECT,
      JobType.RECONNECT_BOT,
      { botId: session.botId, sessionId },
      `reconnect-${session.botId}-${Date.now()}`,
    );

    return updatedSession;
  }
}
