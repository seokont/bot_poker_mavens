import { Module } from '@nestjs/common';
import { HandsService } from './hands.service';
import { HandsController } from './hands.controller';

@Module({
  controllers: [HandsController],
  providers: [HandsService],
  exports: [HandsService],
})
export class HandsModule {}
