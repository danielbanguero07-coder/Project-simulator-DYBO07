import { Module } from '@nestjs/common';

import { GameGateway } from './game.gateway';
import { SimulationModule } from '../simulation/simulation.module';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../../shared/shared.module';

@Module({
  imports: [SharedModule, SimulationModule, AuthModule],
  providers: [GameGateway],
  exports: [GameGateway],
})
export class GatewayModule {}