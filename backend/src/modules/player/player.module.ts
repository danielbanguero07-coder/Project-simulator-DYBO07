import { Module } from '@nestjs/common';

import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}