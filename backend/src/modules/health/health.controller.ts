import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthCheckResult, HealthIndicatorResult } from '@nestjs/terminus';
import { Response } from 'express';

import { PrismaService } from '../../shared/services/prisma.service';
import { RedisService } from '../../shared/services/redis.service';
import { MetricsService } from './metrics.service';
import { SimulationService } from '../simulation/simulation.service';
import { GameGateway } from '../gateway/game.gateway';

@ApiTags('Health')
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prisma: PrismaService,
    private redis: RedisService,
    private metrics: MetricsService,
    private simulation: SimulationService,
    private gateway: GameGateway,
  ) {}

  @Get('health')
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe - process is alive' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  @ApiResponse({ status: 503, description: 'Service is unhealthy' })
  async healthCheck(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth(),
      () => this.redisHealth(),
      () => this.simulationHealth(),
      () => this.gatewayHealth(),
    ]);
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe - ready to serve traffic' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Service not ready' })
  async readinessCheck(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.prismaHealth(),
      () => this.redisHealth(),
    ]);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  async metricsEndpoint(@Res() res: Response): Promise<void> {
    res.set('Content-Type', this.metrics.getContentType());
    res.send(await this.metrics.getMetrics());
  }

  private async prismaHealth(): Promise<HealthIndicatorResult> {
    const isHealthy = await this.prisma.healthCheck();
    return {
      database: { status: isHealthy ? 'up' : 'down' },
    };
  }

  private async redisHealth(): Promise<HealthIndicatorResult> {
    const isHealthy = await this.redis.healthCheck();
    return {
      redis: { status: isHealthy ? 'up' : 'down' },
    };
  }

  private async simulationHealth(): Promise<HealthIndicatorResult> {
    const worlds = (this.simulation as any).worlds || [];
    return {
      simulation: {
        status: 'up',
        worlds: worlds.length,
        ticksPerSecond: 20,
      },
    };
  }

  private async gatewayHealth(): Promise<HealthIndicatorResult> {
    return {
      websocket: {
        status: 'up',
        connectedUsers: this.gateway.getConnectedUsers?.().length || 0,
      },
    };
  }
}