import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService, QueueName, JobType } from '../queue/queue.service';
import { DashboardDto, BotStatsDto, ProfitLossPointDto, TimeRangeQueryDto } from './dto/dashboard.dto';

@Injectable()
export class StatisticsService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  async getDashboard(): Promise<DashboardDto> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);

    const [
      totalBots,
      activeBots,
      playingBots,
      offlineBots,
      errorBots,
      currentTables,
      handsToday,
      todayBotSums,
      totalBotSums,
      errorCount,
    ] = await Promise.all([
      // Every count below is scoped to isEnabled:true (soft-deleted bots
      // shouldn't count) and the 4 status buckets are a mutually exclusive,
      // exhaustive partition of BotStatus, so Active+Playing+Offline+Error
      // always sums back to Total - a bot mid-login/lobby/reconnect isn't
      // "playing" or "offline" but must land in exactly one bucket (Active).
      this.prisma.bot.count({ where: { isEnabled: true } }),
      this.prisma.bot.count({
        where: { isEnabled: true, status: { notIn: ['OFFLINE', 'ERROR', 'SEATED', 'PLAYING'] } },
      }),
      this.prisma.bot.count({ where: { isEnabled: true, status: { in: ['SEATED', 'PLAYING'] } } }),
      this.prisma.bot.count({ where: { isEnabled: true, status: 'OFFLINE' } }),
      this.prisma.bot.count({ where: { isEnabled: true, status: 'ERROR' } }),
      this.prisma.pokerTable.count({ where: { isAllowedForBots: true } }),
      // hands started today
      this.prisma.pokerHand.count({
        where: { startedAt: { gte: todayStart, lt: todayEnd } },
      }),
      // today's PL from bot table sessions
      this.prisma.botTableSession.aggregate({
        _sum: { profitLoss: true },
        where: { joinedAt: { gte: todayStart, lt: todayEnd } },
      }),
      // total PL from bot hands
      this.prisma.botHand.aggregate({
        _sum: { profitLoss: true },
      }),
      // total errors (from bot sessions with error)
      this.prisma.botSession.count({
        where: {
          status: 'ERROR',
          startedAt: { gte: todayStart, lt: todayEnd },
        },
      }),
    ]);

    const totalPL = totalBotSums._sum.profitLoss ?? 0;
    const todayPL = todayBotSums._sum.profitLoss ?? 0;

    // Average win rate: aggregate of completed bot hand results where profitLoss > 0
    const wonHands = await this.prisma.botHand.count({
      where: {
        profitLoss: { gt: 0 },
        hand: { finishedAt: { not: null } },
      },
    });
    const totalFinishedHands = await this.prisma.botHand.count({
      where: { hand: { finishedAt: { not: null } } },
    });
    const avgWinRate = totalFinishedHands > 0 ? (wonHands / totalFinishedHands) * 100 : 0;

    return {
      totalBots,
      activeBots,
      playingBots,
      offlineBots,
      errorBots,
      currentTables,
      handsToday,
      totalPL,
      todayPL,
      avgWinRate: Math.round(avgWinRate * 100) / 100,
      errorCount,
    };
  }

  async getBotStats(botId: string): Promise<BotStatsDto> {
    const bot = await this.prisma.bot.findUnique({
      where: { id: botId },
      select: { id: true, name: true },
    });

    if (!bot) {
      return {
        botId,
        botName: 'Unknown',
        handsPlayed: 0,
        profitLoss: 0,
        bbWon: 0,
        bbPer100: 0,
        VPIP: 0,
        PFR: 0,
        threeBet: 0,
        foldToThreeBet: 0,
        cBetFlop: 0,
        cBetTurn: 0,
        wentToShowdown: 0,
        wonAtShowdown: 0,
        aggressionFactor: 0,
        averagePot: 0,
        averageDecisionTime: 0,
        errorRate: 0,
        reconnectCount: 0,
      };
    }

    // Aggregate hand results
    const [botHandsAgg, botDecisionsAgg, sessions] = await Promise.all([
      this.prisma.botHand.aggregate({
        where: { botId, hand: { finishedAt: { not: null } } },
        _count: { id: true },
        _sum: { profitLoss: true },
        _avg: { profitLoss: true },
      }),
      this.prisma.botDecision.aggregate({
        where: { botId },
        _avg: { processingTimeMs: true },
        _count: { id: true },
      }),
      this.prisma.botSession.findMany({
        where: { botId },
        select: { status: true, errorMessage: true },
      }),
    ]);

    const handsPlayed = botHandsAgg._count.id;
    const profitLoss = botHandsAgg._sum.profitLoss ?? 0;

    // BB/100: assumes big blind of 2 (default), adjust per actual hand data
    const avgBB = 2;
    const bbWon = avgBB > 0 ? profitLoss / avgBB : 0;
    const bbPer100 = handsPlayed > 0 ? (bbWon / handsPlayed) * 100 : 0;

    // VPIP: count hands where bot made a voluntary put-in (preflop action that's not a blind)
    const vpipCount = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        street: 'preflop',
        action: { in: ['call', 'bet', 'raise'] },
      },
    });
    const vpipHands = await this.prisma.botHand.count({
      where: { botId, hand: { finishedAt: { not: null } } },
    });
    const VPIP = vpipHands > 0 ? (vpipCount / vpipHands) * 100 : 0;

    // PFR: count hands where bot raised preflop
    const pfrCount = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        street: 'preflop',
        action: { in: ['raise'] },
      },
    });
    const PFR = vpipHands > 0 ? (pfrCount / vpipHands) * 100 : 0;

    // Three-bet count
    const threeBetCount = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        action: 'raise',
        // Three-bet in preflop: raise after an initial raise — approximated by sequence > 2 on preflop
        street: 'preflop',
        sequence: { gte: 3 },
      },
    });
    const threeBet = vpipHands > 0 ? (threeBetCount / vpipHands) * 100 : 0;

    // Fold to three-bet: actions where bot folds preflop at sequence >= 3
    const foldToThreeBetCount = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        street: 'preflop',
        action: 'fold',
        sequence: { gte: 3 },
      },
    });
    const foldToThreeBet = threeBetCount > 0 ? (foldToThreeBetCount / threeBetCount) * 100 : 0;

    // C-bet flop
    const cBetFlopCount = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        street: 'flop',
        action: { in: ['bet', 'raise'] },
      },
    });
    const flopActions = await this.prisma.handAction.count({
      where: { botId, isBotAction: true, street: 'flop' },
    });
    const cBetFlop = flopActions > 0 ? (cBetFlopCount / flopActions) * 100 : 0;

    // C-bet turn
    const cBetTurnCount = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        street: 'turn',
        action: { in: ['bet', 'raise'] },
      },
    });
    const turnActions = await this.prisma.handAction.count({
      where: { botId, isBotAction: true, street: 'turn' },
    });
    const cBetTurn = turnActions > 0 ? (cBetTurnCount / turnActions) * 100 : 0;

    // Showdown stats
    const showdownHands = await this.prisma.botHand.count({
      where: { botId, showdown: true, hand: { finishedAt: { not: null } } },
    });
    const wentToShowdown = vpipHands > 0 ? (showdownHands / vpipHands) * 100 : 0;
    const wonShowdownHands = await this.prisma.botHand.count({
      where: { botId, showdown: true, profitLoss: { gt: 0 }, hand: { finishedAt: { not: null } } },
    });
    const wonAtShowdown = showdownHands > 0 ? (wonShowdownHands / showdownHands) * 100 : 0;

    // Aggression factor: (bets + raises) / calls
    const aggressiveActions = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        action: { in: ['bet', 'raise'] },
      },
    });
    const callActions = await this.prisma.handAction.count({
      where: {
        botId,
        isBotAction: true,
        action: 'call',
      },
    });
    const aggressionFactor = callActions > 0 ? aggressiveActions / callActions : aggressiveActions;

    // Average pot from bot hands
    const avgPotData = await this.prisma.pokerHand.aggregate({
      where: {
        botHands: { some: { botId } },
        finishedAt: { not: null },
      },
      _avg: { pot: true },
    });
    const averagePot = avgPotData._avg.pot ?? 0;

    // Average decision time
    const averageDecisionTime = botDecisionsAgg._avg.processingTimeMs ?? 0;

    // Error rate
    const errorSessions = sessions.filter((s) => s.status === 'ERROR').length;
    const totalSessions = sessions.length;
    const errorRate = totalSessions > 0 ? (errorSessions / totalSessions) * 100 : 0;

    // Reconnect count from bot sessions
    const reconnectCount = await this.prisma.botSession.count({
      where: { botId, status: 'RECONNECTED' },
    });

    return {
      botId: bot.id,
      botName: bot.name,
      handsPlayed,
      profitLoss,
      bbWon: Math.round(bbWon * 100) / 100,
      bbPer100: Math.round(bbPer100 * 100) / 100,
      VPIP: Math.round(VPIP * 100) / 100,
      PFR: Math.round(PFR * 100) / 100,
      threeBet: Math.round(threeBet * 100) / 100,
      foldToThreeBet: Math.round(foldToThreeBet * 100) / 100,
      cBetFlop: Math.round(cBetFlop * 100) / 100,
      cBetTurn: Math.round(cBetTurn * 100) / 100,
      wentToShowdown: Math.round(wentToShowdown * 100) / 100,
      wonAtShowdown: Math.round(wonAtShowdown * 100) / 100,
      aggressionFactor: Math.round(aggressionFactor * 100) / 100,
      averagePot: Math.round(averagePot * 100) / 100,
      averageDecisionTime: Math.round(averageDecisionTime * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      reconnectCount,
    };
  }

  async getAllBotsStats(): Promise<BotStatsDto[]> {
    const bots = await this.prisma.bot.findMany({
      where: { isEnabled: true },
      select: { id: true },
    });
    return Promise.all(bots.map((bot) => this.getBotStats(bot.id)));
  }

  async getTableStats(tableId: string) {
    const table = await this.prisma.pokerTable.findUnique({
      where: { id: tableId },
      select: { id: true, name: true, gameType: true },
    });

    if (!table) {
      return null;
    }

    const [totalHands, botHands, totalRake, sessions] = await Promise.all([
      this.prisma.pokerHand.count({
        where: { tableId },
      }),
      this.prisma.botHand.count({
        where: {
          hand: { tableId, finishedAt: { not: null } },
        },
      }),
      this.prisma.pokerHand.aggregate({
        where: { tableId },
        _sum: { rake: true },
      }),
      this.prisma.botTableSession.findMany({
        where: { tableId },
        select: {
          status: true,
          profitLoss: true,
          currentStack: true,
          bot: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      tableId: table.id,
      tableName: table.name,
      gameType: table.gameType,
      totalHands,
      botHandsPlayed: botHands,
      totalRake: totalRake._sum.rake ?? 0,
      activeSessions: sessions.filter((s) => s.status === 'ACTIVE').length,
      sessions: sessions.map((s) => ({
        botId: s.bot.id,
        botName: s.bot.name,
        status: s.status,
        profitLoss: s.profitLoss ?? 0,
        currentStack: s.currentStack ?? 0,
      })),
    };
  }

  async getProfitLoss(query: TimeRangeQueryDto): Promise<ProfitLossPointDto[]> {
    const { dateFrom, dateTo, groupBy = 'day' } = query;

    const now = new Date();
    const fromDate = dateFrom ? new Date(dateFrom) : new Date(now.getTime() - 30 * 86400000);
    const toDate = dateTo ? new Date(dateTo) : now;

    // Prisma doesn't have groupBy date truncation, so we fetch raw data and aggregate in-memory
    const hands = await this.prisma.botHand.findMany({
      where: {
        hand: {
          finishedAt: { gte: fromDate, lte: toDate },
        },
      },
      select: {
        profitLoss: true,
        hand: {
          select: { finishedAt: true },
        },
      },
      orderBy: {
        hand: { finishedAt: 'asc' },
      },
    });

    const grouped = new Map<string, number>();
    let runningTotal = 0;

    for (const h of hands) {
      if (!h.hand.finishedAt) continue;
      const date = new Date(h.hand.finishedAt);
      let key: string;

      if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().slice(0, 10);
      } else if (groupBy === 'month') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = date.toISOString().slice(0, 10);
      }

      grouped.set(key, (grouped.get(key) ?? 0) + (h.profitLoss ?? 0));
    }

    const result: ProfitLossPointDto[] = [];
    for (const [date, pl] of grouped) {
      runningTotal += pl;
      result.push({ date, profitLoss: Math.round(pl * 100) / 100, cumulativePL: Math.round(runningTotal * 100) / 100 });
    }

    return result;
  }

  async calculateBotStats(botId: string): Promise<{ success: boolean; botId: string }> {
    await this.queueService.addJob(
      QueueName.BOT_STATISTICS,
      JobType.CALCULATE_STATISTICS,
      { botId },
      `stats-${botId}-${Date.now()}`,
    );
    return { success: true, botId };
  }
}
