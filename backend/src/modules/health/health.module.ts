import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { MetricsService } from './metrics.service';
import { SimulationModule } from '../simulation/simulation.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [TerminusModule, SimulationModule, GatewayModule],
  controllers: [HealthController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}