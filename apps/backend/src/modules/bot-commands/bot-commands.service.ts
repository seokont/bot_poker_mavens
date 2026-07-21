import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService, QueueName, JobType } from '../queue/queue.service';
import { EventsService } from '../events/events.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { BotStatus } from '@poker-bot/shared-types';

@Injectable()
export class BotCommandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly eventsService: EventsService,
    private readonly encryptionService: EncryptionService,
  ) {}

  private async getValidBot(botId: string) {
    const bot = await this.prisma.bot.findUnique({ where: { id: botId } });
    if (!bot) {
      throw new NotFoundException(`Bot with ID "${botId}" not found`);
    }
    if (!bot.isEnabled) {
      throw new BadRequestException(`Bot "${botId}" is disabled`);
    }
    return bot;
  }

  private getBotCredentials(bot: { login: string; encryptedPassword: string }): { login: string; password: string } {
    try {
      return {
        login: bot.login,
        password: this.encryptionService.decrypt(bot.encryptedPassword),
      };
    } catch {
      return { login: bot.login, password: '' };
    }
  }

  async start(botId: string) {
    const bot = await this.getValidBot(botId);

    if (bot.status !== BotStatus.OFFLINE && bot.status !== BotStatus.ERROR) {
      throw new BadRequestException(
        `Bot "${botId}" cannot be started from status "${bot.status}"`,
      );
    }

    const credentials = this.getBotCredentials(bot);

    await this.queueService.addJob(
      QueueName.BOT_LIFECYCLE,
      JobType.START_BOT,
      { botId, login: credentials.login, password: credentials.password },
      `start-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:start', {
      botId,
    } as Record<string, unknown>);

    return { success: true, message: `Start command enqueued for bot "${botId}"` };
  }

  async stop(botId: string) {
    const bot = await this.getValidBot(botId);

    if (
      bot.status === BotStatus.OFFLINE ||
      bot.status === BotStatus.ERROR
    ) {
      throw new BadRequestException(
        `Bot "${botId}" is already offline or in error state`,
      );
    }

    await this.queueService.addJob(
      QueueName.BOT_LIFECYCLE,
      JobType.STOP_BOT,
      { botId },
      `stop-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:stop', {
      botId,
    } as Record<string, unknown>);

    return { success: true, message: `Stop command enqueued for bot "${botId}"` };
  }

  async restart(botId: string) {
    await this.getValidBot(botId);

    await this.queueService.addJob(
      QueueName.BOT_LIFECYCLE,
      JobType.RESTART_BOT,
      { botId },
      `restart-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:restart', {
      botId,
    } as Record<string, unknown>);

    return { success: true, message: `Restart command enqueued for bot "${botId}"` };
  }

  async joinTable(
    botId: string,
    tableId: string,
    buyIn: number,
    preferredSeat?: number | null,
    waitForBigBlind?: boolean,
    overrideLogin?: string,
    overridePassword?: string,
  ) {
    const bot = await this.getValidBot(botId);

    if (buyIn < bot.minBuyIn || buyIn > bot.maxBuyIn) {
      throw new BadRequestException(
        `Buy-in amount ${buyIn} is outside allowed range [${bot.minBuyIn}, ${bot.maxBuyIn}]`,
      );
    }

    // Use override credentials if provided (e.g., from Internal API), otherwise from DB
    let login: string;
    let password: string;
    if (overrideLogin && overridePassword) {
      login = overrideLogin;
      password = overridePassword;
    } else {
      const credentials = this.getBotCredentials(bot);
      login = credentials.login;
      password = credentials.password;
    }

    await this.queueService.addJob(
      QueueName.BOT_TABLE,
      JobType.JOIN_TABLE,
      {
        botId,
        tableId,
        buyIn,
        login,
        password,
        preferredSeat: preferredSeat ?? null,
        waitForBigBlind: waitForBigBlind ?? true,
      },
      `join-table-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:join-table', {
      botId,
      tableId,
      buyIn,
    } as Record<string, unknown>);

    return {
      success: true,
      message: `Join table command enqueued for bot "${botId}"`,
    };
  }

  async leaveTable(botId: string) {
    await this.getValidBot(botId);

    await this.queueService.addJob(
      QueueName.BOT_TABLE,
      JobType.LEAVE_TABLE,
      { botId },
      `leave-table-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:leave-table', {
      botId,
    } as Record<string, unknown>);

    return {
      success: true,
      message: `Leave table command enqueued for bot "${botId}"`,
    };
  }

  async sitOut(botId: string) {
    await this.getValidBot(botId);

    await this.queueService.addJob(
      QueueName.BOT_TABLE,
      JobType.SIT_OUT,
      { botId },
      `sit-out-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:sit-out', {
      botId,
    } as Record<string, unknown>);

    return { success: true, message: `Sit out command enqueued for bot "${botId}"` };
  }

  async sitIn(botId: string) {
    await this.getValidBot(botId);

    await this.queueService.addJob(
      QueueName.BOT_TABLE,
      JobType.SIT_IN,
      { botId },
      `sit-in-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:sit-in', {
      botId,
    } as Record<string, unknown>);

    return { success: true, message: `Sit in command enqueued for bot "${botId}"` };
  }

  async rebuy(botId: string, amount?: number) {
    await this.getValidBot(botId);

    await this.queueService.addJob(
      QueueName.BOT_TABLE,
      JobType.REBUY,
      { botId, amount: amount ?? null },
      `rebuy-${botId}-${Date.now()}`,
    );

    this.eventsService.emit('bot-command:rebuy', {
      botId,
      amount,
    } as Record<string, unknown>);

    return { success: true, message: `Rebuy command enqueued for bot "${botId}"` };
  }

  async bulkStart(botIds: string[]) {
    const results = [];

    for (const botId of botIds) {
      try {
        const result = await this.start(botId);
        results.push({ botId, success: true, message: result.message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({ botId, success: false, message });
      }
    }

    return { success: true, results };
  }

  async bulkStop(botIds: string[]) {
    const results = [];

    for (const botId of botIds) {
      try {
        const result = await this.stop(botId);
        results.push({ botId, success: true, message: result.message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({ botId, success: false, message });
      }
    }

    return { success: true, results };
  }

  async bulkJoinTable(
    botIds: string[],
    tableId: string,
    buyIn: number,
    preferredSeat?: number | null,
    waitForBigBlind?: boolean,
  ) {
    const results = [];

    for (const botId of botIds) {
      try {
        const result = await this.joinTable(
          botId,
          tableId,
          buyIn,
          preferredSeat,
          waitForBigBlind,
        );
        results.push({ botId, success: true, message: result.message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({ botId, success: false, message });
      }
    }

    return { success: true, results };
  }

  async bulkLeaveTable(botIds: string[]) {
    const results = [];

    for (const botId of botIds) {
      try {
        const result = await this.leaveTable(botId);
        results.push({ botId, success: true, message: result.message });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.push({ botId, success: false, message });
      }
    }

    return { success: true, results };
  }

  /**
   * Emergency "kill switch": tells every bot-worker process to stop and
   * close every browser it has open, then immediately marks every bot
   * OFFLINE in the DB regardless of its previous status (including ERROR/
   * already-OFFLINE ones the normal per-bot `stop()` guard would reject) -
   * this is meant for "something is wrong, get every real-money session
   * closed right now", not a routine per-bot stop.
   */
  async emergencyStopAll() {
    await this.queueService.addJob(
      QueueName.BOT_LIFECYCLE,
      JobType.EMERGENCY_STOP_ALL,
      {},
      `emergency-stop-all-${Date.now()}`,
    );

    const { count } = await this.prisma.bot.updateMany({
      data: { status: BotStatus.OFFLINE },
    });

    this.eventsService.emit('bot-command:emergency-stop-all', {} as Record<string, unknown>);

    return {
      success: true,
      message: `Emergency stop broadcast to worker(s); ${count} bot(s) marked OFFLINE`,
    };
  }
}
