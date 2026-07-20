import { Module } from '@nestjs/common';
import { BotCommandsService } from './bot-commands.service';
import { BotCommandsController } from './bot-commands.controller';
import { BotSessionsModule } from '../bot-sessions/bot-sessions.module';

@Module({
  imports: [BotSessionsModule],
  controllers: [BotCommandsController],
  providers: [BotCommandsService],
  exports: [BotCommandsService],
})
export class BotCommandsModule {}
