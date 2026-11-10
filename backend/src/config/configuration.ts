// Loaded as a plain config object (not namespaced) so values such as
// `jwt.secret`, `redis.url` and `simulation.tickRate` can be read directly.
export const configuration = () => ({
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  apiPrefix: 'api',
  apiVersion: '1',

  // Database
  database: {
    url: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    logLevel: process.env.DATABASE_LOG_LEVEL || 'warn',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    family: parseInt(process.env.REDIS_FAMILY || '4', 10),
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET,
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtl: process.env.JWT_REFRESH_TTL || '7d',
    issuer: 'simulation-game',
    audience: 'simulation-game-client',
  },

  // Bcrypt
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },

  // Throttler
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
  },

  // CORS
  cors: {
    origins: (
      process.env.CORS_ORIGINS ||
      'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177'
    ).split(','),
  },

  // Simulation
  simulation: {
    tickRate: parseInt(process.env.SIM_TICK_RATE || '20', 10), // ticks per second
    maxPlayersPerWorld: parseInt(process.env.SIM_MAX_PLAYERS_PER_WORLD || '5000', 10),
    actionQueueSize: parseInt(process.env.SIM_ACTION_QUEUE_SIZE || '10000', 10),
    stateBroadcastInterval: parseInt(process.env.SIM_STATE_BROADCAST_INTERVAL || '50', 10), // ms
    snapshotInterval: parseInt(process.env.SIM_SNAPSHOT_INTERVAL || '300000', 10), // ms (5 min)
  },

  // WebSocket
  websocket: {
    pingInterval: 25000,
    pingTimeout: 20000,
    maxPayload: 10 * 1024 * 1024, // 10MB
    transports: ['websocket', 'polling'],
  },

  // BullMQ
  queue: {
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  },

  // Observability
  observability: {
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsEnabled: process.env.METRICS_ENABLED !== 'false',
    tracingEnabled: process.env.TRACING_ENABLED !== 'false',
    sentryDsn: process.env.SENTRY_DSN,
    otlpEndpoint: process.env.OTLP_ENDPOINT,
  },

  // Mail (Maildev for local)
  mail: {
    host: process.env.MAIL_HOST || 'localhost',
    port: parseInt(process.env.MAIL_PORT || '1025', 10),
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
    from: process.env.MAIL_FROM || 'noreply@simulation.game',
  },

  // File upload
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  },
});