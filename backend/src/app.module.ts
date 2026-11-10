import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlayerModule } from './modules/player/player.module';
import { SimulationModule } from './modules/simulation/simulation.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { EconomyModule } from './modules/economy/economy.module';
import { SocialModule } from './modules/social/social.module';
import { HealthModule } from './modules/health/health.module';

import { configuration } from './config/configuration';
import { validationSchema } from './config/validation';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: true,
        allowUnknown: true,
      },
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [SharedModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.get<number>('THROTTLE_TTL') || 60000,
            limit: configService.get<number>('THROTTLE_LIMIT') || 100,
          },
        ],
      }),
      inject: [ConfigService],
    }),

    // Core modules
    SharedModule,
    AuthModule,
    PlayerModule,
    SimulationModule,
    GatewayModule,
    EconomyModule,
    SocialModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}