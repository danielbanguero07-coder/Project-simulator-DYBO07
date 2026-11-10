# Multi-stage Dockerfile for NestJS Backend
# Stage 1: Base image with dependencies
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    dumb-init \
    tini \
    curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml* ./
COPY prisma ./prisma/

# Stage 2: Dependencies
FROM base AS deps

# Install pnpm
RUN corepack enable pnpm && corepack prepare pnpm@8.15.0 --activate

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod=false

# Generate Prisma Client
RUN pnpm prisma generate

# Stage 3: Builder
FROM deps AS builder

# Copy source code
COPY . .

# Build application
RUN pnpm run build

# Stage 4: Production dependencies only
FROM base AS prod-deps

RUN corepack enable pnpm && corepack prepare pnpm@8.15.0 --activate

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod=true

# Stage 5: Runner (distroless-like minimal image)
FROM node:20-alpine AS runner

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    tini \
    curl \
    && addgroup -g 1001 -S nodejs \
    && adduser -S nestjs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./

# Copy Prisma
COPY --from=prod-deps /app/prisma ./prisma/

# Copy built application
COPY --from=builder /app/dist ./dist

# Create non-root user directories
RUN mkdir -p /app/logs /app/tmp && chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["tini", "--"]

# Start application
CMD ["node", "dist/main.js"]