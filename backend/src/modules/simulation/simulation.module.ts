import { Module } from '@nestjs/common';

import { SimulationController } from './simulation.controller';
import { SimulationService } from './simulation.service';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [SimulationController],
  providers: [SimulationService],
  exports: [SimulationService],
})
export class SimulationModule {}