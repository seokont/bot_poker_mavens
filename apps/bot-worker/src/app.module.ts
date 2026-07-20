import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WorkerService } from './worker/worker.service';
import { BotStateMachine } from './state-machine/bot-state-machine';
import { PlaywrightManager } from './playwright/playwright-manager';
import { ActionExecutorService } from './action-executor/action-executor.service';
import { GameStateReader } from './game-state-reader/game-state-reader';
import { HeartbeatService } from './heartbeat/heartbeat.service';
import { ResourceManager } from './resource-manager/resource-manager';
import { ErrorHandler } from './error-handler/error-handler';
import { DecisionEngineService } from './decision-engine/decision-engine.service';
import { GameLoopService } from './game-loop/game-loop.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [
    WorkerService,
    BotStateMachine,
    PlaywrightManager,
    ActionExecutorService,
    GameStateReader,
    HeartbeatService,
    ResourceManager,
    ErrorHandler,
    DecisionEngineService,
    GameLoopService,
  ],
})
export class AppModule {}
