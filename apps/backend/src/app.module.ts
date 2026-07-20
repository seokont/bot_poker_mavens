import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { EventsModule } from './modules/events/events.module';
import { QueueModule } from './modules/queue/queue.module';
import { HandsModule } from './modules/hands/hands.module';
import { ActionsModule } from './modules/actions/actions.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { TablesModule } from './modules/tables/tables.module';
import { StrategiesModule } from './modules/strategies/strategies.module';
import { BotsModule } from './modules/bots/bots.module';
import { BotSessionsModule } from './modules/bot-sessions/bot-sessions.module';
import { BotCommandsModule } from './modules/bot-commands/bot-commands.module';
import { CommonModule } from './common/common.module';
import { LimitsModule } from './modules/limits/limits.module';
import { AuditModule } from './modules/audit/audit.module';
import { InternalModule } from './modules/internal/internal.module';
import config from './config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [config],
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    HealthModule,
    EventsModule,
    QueueModule,
    HandsModule,
    ActionsModule,
    StatisticsModule,
    TablesModule,
    StrategiesModule,
    CommonModule,
    BotsModule,
    BotSessionsModule,
    BotCommandsModule,
    LimitsModule,
    AuditModule,
    InternalModule,
  ],
})
export class AppModule {}
