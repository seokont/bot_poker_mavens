import { Module } from '@nestjs/common';
import { InternalService } from './internal.service';
import { InternalController } from './internal.controller';
import { PokerMavensApiService } from '../tables/poker-mavens-api.service';

@Module({
  controllers: [InternalController],
  providers: [InternalService, PokerMavensApiService],
  exports: [InternalService],
})
export class InternalModule {}
