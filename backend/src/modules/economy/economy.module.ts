import { Module } from '@nestjs/common';

import { EconomyController } from './economy.controller';
import { EconomyService } from './economy.service';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [EconomyController],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}