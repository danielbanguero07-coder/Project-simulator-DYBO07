import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './services/prisma.service';
import { RedisService } from './services/redis.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { RolesGuard } from './guards/roles.guard';
import { ThrottlerBehindProxyGuard } from './guards/throttler-behind-proxy.guard';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    PrismaService,
    RedisService,
    JwtStrategy,
    JwtRefreshStrategy,
    RolesGuard,
    ThrottlerBehindProxyGuard,
  ],
  exports: [
    PrismaService,
    RedisService,
    JwtStrategy,
    JwtRefreshStrategy,
    RolesGuard,
    ThrottlerBehindProxyGuard,
  ],
})
export class SharedModule {}