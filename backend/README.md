# Simulation Game Backend

Authoritative backend for web simulation game - Real-time game loop, economy, social features, WebSocket state sync.

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│  REST API (meta-game) ◄──────────► WebSocket (gameplay)     │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   NGINX     │ (SSL termination, rate limit)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌──────────┐ ┌───────────┐
         │Backend 1│ │Backend 2 │ │Backend N  │ (Stateless, K8s HPA)
         └────┬────┘ └────┬─────┘ └─────┬─────┘
              │           │             │
              └───────────┼─────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌──────────┐ ┌────────┐ ┌──────────┐
         │PostgreSQL│ │ Redis  │ │  BullMQ  │
         │(Primary) │ │(Cache/ │ │ (Queues) │
         │          │ │ PubSub)│ │          │
         └──────────┘ └────────┘ └──────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8.15+
- PostgreSQL 16+
- Redis 7+

### Local Development

```bash
# 1. Clone and install
cd backend
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your local settings

# 3. Start infrastructure
docker-compose up -d postgres redis maildev

# 4. Setup database
pnpm prisma migrate dev
pnpm prisma db seed

# 5. Start development server
pnpm run start:dev
```

Server runs at `http://localhost:3000`
- API Docs: `http://localhost:3000/docs`
- Health: `http://localhost:3000/health`
- Ready: `http://localhost:3000/ready`
- Metrics: `http://localhost:3000/metrics`

### Docker (Production-like)

```bash
# Build and run all services
docker-compose -f docker-compose.yml -f docker-compose.override.yml up -d

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── app.module.ts           # Root module
│   ├── config/                 # Configuration
│   │   ├── configuration.ts    # App config factory
│   │   └── validation.ts       # Joi validation schema
│   ├── modules/
│   │   ├── auth/               # JWT + Refresh tokens, Passport
│   │   ├── player/             # Player profile, progression
│   │   ├── simulation/         # Authoritative game loop (20 TPS)
│   │   ├── gateway/            # Socket.io + Redis adapter
│   │   ├── economy/            # Double-entry bookkeeping
│   │   ├── social/             # Clans, friends, chat
│   │   └── health/             # Health checks, Prometheus metrics
│   └── shared/                 # Cross-cutting concerns
│       ├── services/           # Prisma, Redis
│       ├── guards/             # Auth, Roles, Throttler
│       ├── interceptors/       # Logging, Transform
│       ├── filters/            # Exception handling
│       ├── decorators/         # CurrentUser, Roles, Public
│       └── observability/      # OpenTelemetry setup
├── prisma/
│   ├── schema.prisma           # Database schema (7 core models)
│   └── seed.ts                 # Development seed data
├── test/                       # Test configuration
├── Dockerfile                  # Multi-stage build
├── docker-compose.yml          # Production services
├── docker-compose.override.yml # Development overrides
└── .github/workflows/ci.yml    # CI pipeline
```

## 🔐 Authentication

### JWT Token Flow
```
POST /api/auth/login
  └─► Returns: access_token (15min) + refresh_token (7d) in HttpOnly cookies

GET /api/player/profile (with Authorization: Bearer <access_token>)
  └─► Validates JWT, returns user data

POST /api/auth/refresh (with refresh_token cookie)
  └─► Rotates refresh token, returns new access_token

POST /api/auth/logout
  └─► Revokes refresh token, clears cookies
```

### Roles
- `PLAYER` - Default authenticated user
- `MODERATOR` - Can moderate chat, manage reports
- `ADMIN` - Full access, economy management
- `DEVELOPER` - Debug endpoints, simulation control

## 🎮 Simulation (Authoritative Game Loop)

### Tick Processing (20 TPS)
```typescript
// Server-side only - clients send actions, server processes
while (running) {
  // 1. Process building production
  // 2. Regenerate resources
  // 3. Process player action queues
  // 4. Broadcast state deltas via WebSocket
  await tick();
  await sleep(50ms); // 20 TPS
}
```

### WebSocket Protocol
```typescript
// Client → Server
{ event: 'action', data: { actionId, type: 'BUILD', clientTick, data: {...} } }

// Server → Client
{ event: 'state_delta', data: { tick, buildings, resources, players, timestamp } }
{ event: 'action_ack', data: { actionId, serverTick, success } }
```

### Client Prediction
- Client predicts locally for instant feedback
- Server authoritative - reconciles on state_delta
- Rollback on mismatch (anti-cheat)

## 💰 Economy (Double-Entry Bookkeeping)

Every transaction creates balanced ledger entries:

```typescript
// Transfer 100 gold from Player A to Player B
// Ledger:
DEBIT  player:A:gold     100
CREDIT player:B:gold     100
DEBIT  system:expense:gold  100
CREDIT system:revenue:gold  100
```

### ACID Guarantees
- All economy operations in Prisma transactions
- Row-level locking for concurrent transfers
- Event sourcing via `GameEvent` table for audit

## 👥 Social Features

- **Clans**: Create, invite, promote/kick, leaderboards
- **Friends**: Request, accept, block, online status
- **Chat**: World, clan, private messages via WebSocket

## 📊 Observability

### Health Checks
```
GET /health    # Liveness (k8s probe)
GET /ready     # Readiness (k8s probe)
GET /metrics   # Prometheus metrics
```

### Key Metrics
- `http_request_duration_seconds` - API latency (p50, p95, p99)
- `simulation_tick_duration_seconds` - Game loop performance
- `ws_connections_active` - Concurrent WebSocket connections
- `db_query_duration_seconds` - Database performance
- `economy_transactions_total` - Transaction throughput

### Logging
- Structured JSON logs (Pino)
- Request correlation IDs
- Error tracking with stack traces

## 🧪 Testing

```bash
# Unit tests
pnpm run test

# Integration tests (requires DB)
pnpm run test:integration

# E2E tests
pnpm run test:e2e

# Coverage
pnpm run test:cov
```

## 🔒 Security

- Helmet.js for HTTP headers
- CORS configured per environment
- Rate limiting (Throttler) per IP
- Input validation (class-validator + Zod)
- JWT with short expiry + refresh rotation
- Password hashing (bcrypt 12 rounds)
- SQL injection prevention (Prisma)
- Audit logging for economy actions

## 📦 Deployment

### Kubernetes (Helm)
```yaml
# values.yaml
replicaCount: 3
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 50
  targetCPUUtilization: 70

resources:
  limits:
    cpu: 2000m
    memory: 2Gi
  requests:
    cpu: 1000m
    memory: 1Gi

env:
  DATABASE_URL: from Secret
  REDIS_URL: from Secret
  JWT_SECRET: from Secret
```

### Environment Variables (Production)
```bash
NODE_ENV=production
JWT_SECRET=<64-char-random-string>
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
REDIS_URL=redis://:pass@host:6379
CORS_ORIGINS=https://game.example.com
LOG_LEVEL=info
```

## 📝 API Documentation

OpenAPI/Swagger available at `/docs` when `NODE_ENV !== production`.

Generate client types:
```bash
pnpm run docs:generate
# Outputs openapi.json + TypeScript types
```

## 🤝 Contributing

1. Follow conventional commits (`feat:`, `fix:`, `chore:`)
2. Run `pnpm run lint` and `pnpm run format` before commit
3. Write tests for new features
4. Update OpenAPI spec for API changes

## 📄 License

Proprietary - Simulation Game Team