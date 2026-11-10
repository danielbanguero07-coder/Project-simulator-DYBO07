import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string().valid('development', 'production', 'test', 'staging').default('development'),
  PORT: Joi.number().port().default(3000),
  HOST: Joi.string().ip().default('0.0.0.0'),

  // Database (required)
  DATABASE_URL: Joi.string().uri().required()
    .description('PostgreSQL connection string: postgresql://user:pass@host:port/db?schema=public'),

  // Redis (required)
  REDIS_URL: Joi.string().uri().required()
    .description('Redis connection string: redis://[:password@]host:port[/db]'),

  // JWT (required)
  JWT_SECRET: Joi.string().min(32).required()
    .description('JWT secret key (min 32 chars for HS256)'),
  JWT_ACCESS_TTL: Joi.string().pattern(/^\d+[smhd]$/).default('15m'),
  JWT_REFRESH_TTL: Joi.string().pattern(/^\d+[smhd]$/).default('7d'),

  // Bcrypt
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),

  // Throttler
  THROTTLE_TTL: Joi.number().integer().positive().default(60000),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),

  // CORS
  CORS_ORIGINS: Joi.string().default(
    'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177',
  ),

  // Simulation
  SIM_TICK_RATE: Joi.number().integer().min(1).max(60).default(20),
  SIM_MAX_PLAYERS_PER_WORLD: Joi.number().integer().positive().default(5000),
  SIM_ACTION_QUEUE_SIZE: Joi.number().integer().positive().default(10000),
  SIM_STATE_BROADCAST_INTERVAL: Joi.number().integer().positive().default(50),
  SIM_SNAPSHOT_INTERVAL: Joi.number().integer().positive().default(300000),

  // Observability
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
  METRICS_ENABLED: Joi.boolean().default(true),
  TRACING_ENABLED: Joi.boolean().default(true),
  SENTRY_DSN: Joi.string().uri().allow(''),
  OTLP_ENDPOINT: Joi.string().uri().allow(''),

  // Mail
  MAIL_HOST: Joi.string().default('localhost'),
  MAIL_PORT: Joi.number().port().default(1025),
  MAIL_USER: Joi.string().allow(''),
  MAIL_PASS: Joi.string().allow(''),
  MAIL_FROM: Joi.string().email().default('noreply@simulation.game'),
}).unknown(true);