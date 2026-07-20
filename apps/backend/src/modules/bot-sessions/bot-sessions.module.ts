import { Module } from '@nestjs/common';
import { BotSessionsService } from './bot-sessions.service';

@Module({
  providers: [BotSessionsService],
  exports: [BotSessionsService],
})
export class BotSessionsModule {}
