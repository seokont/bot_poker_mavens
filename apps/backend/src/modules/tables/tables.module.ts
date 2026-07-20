import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { PokerMavensApiService } from './poker-mavens-api.service';

@Module({
  controllers: [TablesController],
  providers: [TablesService, PokerMavensApiService],
  exports: [TablesService, PokerMavensApiService],
})
export class TablesModule {}
