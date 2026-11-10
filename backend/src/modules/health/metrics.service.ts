import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly register: Registry;

  // HTTP metrics
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDuration: Histogram<string>;
  public readonly httpRequestSize: Histogram<string>;
  public readonly httpResponseSize: Histogram<string>;

  // WebSocket metrics
  public readonly wsConnectionsActive: Gauge<string>;
  public readonly wsConnectionsTotal: Counter<string>;
  public readonly wsMessagesReceived: Counter<string>;
  public readonly wsMessagesSent: Counter<string>;
  public readonly wsMessageSize: Histogram<string>;

  // Simulation metrics
  public readonly simulationTickDuration: Histogram<string>;
  public readonly simulationTickTotal: Counter<string>;
  public readonly simulationWorldsActive: Gauge<string>;
  public readonly simulationPlayersActive: Gauge<string>;
  public readonly simulationActionsProcessed: Counter<string>;
  public readonly simulationActionQueueSize: Gauge<string>;

  // Database metrics
  public readonly dbQueryDuration: Histogram<string>;
  public readonly dbQueriesTotal: Counter<string>;
  public readonly dbConnectionsActive: Gauge<string>;
  public readonly dbConnectionsIdle: Gauge<string>;

  // Cache metrics
  public readonly cacheHitsTotal: Counter<string>;
  public readonly cacheMissesTotal: Counter<string>;
  public readonly cacheOperationsDuration: Histogram<string>;

  // Auth metrics
  public readonly authLoginsTotal: Counter<string>;
  public readonly authRegistrationsTotal: Counter<string>;
  public readonly authTokenRefreshesTotal: Counter<string>;
  public readonly authFailuresTotal: Counter<string>;

  // Economy metrics
  public readonly economyTransactionsTotal: Counter<string>;
  public readonly economyCurrencyFlow: Counter<string>;
  public readonly economyBalancesTotal: Gauge<string>;

  // Error metrics
  public readonly errorsTotal: Counter<string>;

  constructor() {
    this.register = new Registry();
    collectDefaultMetrics({ register: this.register, prefix: 'app_' });

    // HTTP
    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.register],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.register],
    });

    this.httpRequestSize = new Histogram({
      name: 'http_request_size_bytes',
      help: 'HTTP request size in bytes',
      labelNames: ['method', 'path'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
      registers: [this.register],
    });

    this.httpResponseSize = new Histogram({
      name: 'http_response_size_bytes',
      help: 'HTTP response size in bytes',
      labelNames: ['method', 'path'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
      registers: [this.register],
    });

    // WebSocket
    this.wsConnectionsActive = new Gauge({
      name: 'ws_connections_active',
      help: 'Number of active WebSocket connections',
      registers: [this.register],
    });

    this.wsConnectionsTotal = new Counter({
      name: 'ws_connections_total',
      help: 'Total WebSocket connections',
      labelNames: ['status'],
      registers: [this.register],
    });

    this.wsMessagesReceived = new Counter({
      name: 'ws_messages_received_total',
      help: 'Total WebSocket messages received',
      labelNames: ['event'],
      registers: [this.register],
    });

    this.wsMessagesSent = new Counter({
      name: 'ws_messages_sent_total',
      help: 'Total WebSocket messages sent',
      labelNames: ['event'],
      registers: [this.register],
    });

    this.wsMessageSize = new Histogram({
      name: 'ws_message_size_bytes',
      help: 'WebSocket message size in bytes',
      labelNames: ['event', 'direction'],
      buckets: [100, 500, 1000, 5000, 10000, 50000, 100000],
      registers: [this.register],
    });

    // Simulation
    this.simulationTickDuration = new Histogram({
      name: 'simulation_tick_duration_seconds',
      help: 'Game loop tick duration in seconds',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers: [this.register],
    });

    this.simulationTickTotal = new Counter({
      name: 'simulation_ticks_total',
      help: 'Total simulation ticks processed',
      registers: [this.register],
    });

    this.simulationWorldsActive = new Gauge({
      name: 'simulation_worlds_active',
      help: 'Number of active simulation worlds',
      registers: [this.register],
    });

    this.simulationPlayersActive = new Gauge({
      name: 'simulation_players_active',
      help: 'Number of players in simulation',
      labelNames: ['world'],
      registers: [this.register],
    });

    this.simulationActionsProcessed = new Counter({
      name: 'simulation_actions_processed_total',
      help: 'Total player actions processed',
      labelNames: ['action_type', 'world'],
      registers: [this.register],
    });

    this.simulationActionQueueSize = new Gauge({
      name: 'simulation_action_queue_size',
      help: 'Current action queue size per world',
      labelNames: ['world'],
      registers: [this.register],
    });

    // Database
    this.dbQueryDuration = new Histogram({
      name: 'db_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'model'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.register],
    });

    this.dbQueriesTotal = new Counter({
      name: 'db_queries_total',
      help: 'Total database queries',
      labelNames: ['operation', 'model', 'status'],
      registers: [this.register],
    });

    this.dbConnectionsActive = new Gauge({
      name: 'db_connections_active',
      help: 'Active database connections',
      registers: [this.register],
    });

    this.dbConnectionsIdle = new Gauge({
      name: 'db_connections_idle',
      help: 'Idle database connections',
      registers: [this.register],
    });

    // Cache
    this.cacheHitsTotal = new Counter({
      name: 'cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_type'],
      registers: [this.register],
    });

    this.cacheMissesTotal = new Counter({
      name: 'cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_type'],
      registers: [this.register],
    });

    this.cacheOperationsDuration = new Histogram({
      name: 'cache_operation_duration_seconds',
      help: 'Cache operation duration',
      labelNames: ['operation', 'cache_type'],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.register],
    });

    // Auth
    this.authLoginsTotal = new Counter({
      name: 'auth_logins_total',
      help: 'Total successful logins',
      labelNames: ['provider'],
      registers: [this.register],
    });

    this.authRegistrationsTotal = new Counter({
      name: 'auth_registrations_total',
      help: 'Total registrations',
      registers: [this.register],
    });

    this.authTokenRefreshesTotal = new Counter({
      name: 'auth_token_refreshes_total',
      help: 'Total token refreshes',
      registers: [this.register],
    });

    this.authFailuresTotal = new Counter({
      name: 'auth_failures_total',
      help: 'Total authentication failures',
      labelNames: ['reason'],
      registers: [this.register],
    });

    // Economy
    this.economyTransactionsTotal = new Counter({
      name: 'economy_transactions_total',
      help: 'Total economy transactions',
      labelNames: ['type', 'currency'],
      registers: [this.register],
    });

    this.economyCurrencyFlow = new Counter({
      name: 'economy_currency_flow_total',
      help: 'Currency flow (positive = mint, negative = burn)',
      labelNames: ['currency', 'direction'],
      registers: [this.register],
    });

    this.economyBalancesTotal = new Gauge({
      name: 'economy_balances_total',
      help: 'Total currency in circulation',
      labelNames: ['currency'],
      registers: [this.register],
    });

    // Errors
    this.errorsTotal = new Counter({
      name: 'errors_total',
      help: 'Total errors',
      labelNames: ['type', 'code'],
      registers: [this.register],
    });
  }

  onModuleInit() {
    // Metrics are ready
  }

  getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getContentType(): string {
    return this.register.contentType;
  }

  // Helper methods for recording metrics
  recordHttpRequest(method: string, path: string, status: number, duration: number, reqSize?: number, resSize?: number) {
    this.httpRequestsTotal.inc({ method, path, status: status.toString() });
    this.httpRequestDuration.observe({ method, path }, duration);
    if (reqSize) this.httpRequestSize.observe({ method, path }, reqSize);
    if (resSize) this.httpResponseSize.observe({ method, path }, resSize);
  }

  recordWsConnection(status: 'connected' | 'disconnected') {
    if (status === 'connected') {
      this.wsConnectionsActive.inc();
      this.wsConnectionsTotal.inc({ status: 'connected' });
    } else {
      this.wsConnectionsActive.dec();
      this.wsConnectionsTotal.inc({ status: 'disconnected' });
    }
  }

  recordWsMessage(event: string, direction: 'received' | 'sent', size: number) {
    if (direction === 'received') {
      this.wsMessagesReceived.inc({ event });
    } else {
      this.wsMessagesSent.inc({ event });
    }
    this.wsMessageSize.observe({ event, direction }, size);
  }

  recordSimulationTick(duration: number) {
    this.simulationTickDuration.observe(duration);
    this.simulationTickTotal.inc();
  }

  recordActionProcessed(actionType: string, world: string) {
    this.simulationActionsProcessed.inc({ action_type: actionType, world });
  }

  recordDbQuery(operation: string, model: string, duration: number, status: 'success' | 'error') {
    this.dbQueryDuration.observe({ operation, model }, duration);
    this.dbQueriesTotal.inc({ operation, model, status });
  }

  recordCacheHit(cacheType: string) {
    this.cacheHitsTotal.inc({ cache_type: cacheType });
  }

  recordCacheMiss(cacheType: string) {
    this.cacheMissesTotal.inc({ cache_type: cacheType });
  }

  recordAuthLogin(provider: string) {
    this.authLoginsTotal.inc({ provider });
  }

  recordAuthRegistration() {
    this.authRegistrationsTotal.inc();
  }

  recordAuthFailure(reason: string) {
    this.authFailuresTotal.inc({ reason });
  }

  recordEconomyTransaction(type: string, currency: string) {
    this.economyTransactionsTotal.inc({ type, currency });
  }

  recordCurrencyFlow(currency: string, amount: number) {
    this.economyCurrencyFlow.inc({ currency, direction: amount >= 0 ? 'mint' : 'burn' }, Math.abs(amount));
  }

  updateEconomyBalance(currency: string, total: number) {
    this.economyBalancesTotal.set({ currency }, total);
  }

  recordError(type: string, code: string) {
    this.errorsTotal.inc({ type, code });
  }
}