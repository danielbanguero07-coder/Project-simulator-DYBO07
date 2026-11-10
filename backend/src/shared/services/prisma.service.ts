import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    super({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
      datasources: {
        db: {
          url: configService.get<string>('DATABASE_URL'),
        },
      },
    } as any);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('📦 Prisma Client connected to database');

    // Log queries in development
    if (this.configService.get('NODE_ENV') === 'development') {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query} - Params: ${e.params} - Duration: ${e.duration}ms`);
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('📦 Prisma Client disconnected');
  }

  async enableShutdownHooks(app: any) {
    // `$on('beforeExit')` is not supported by Prisma's library engine since
    // v5. Listen on the process directly instead.
    process.once('beforeExit', async () => {
      await app.close();
    });
  }

  // Transaction helper with retry logic - named to avoid conflict with Prisma's
  // `transaction` model delegate.
  async withTransaction<T>(
    fn: (prisma: any) => Promise<T>,
    options?: { maxRetries?: number; timeout?: number },
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 3;
    const timeout = options?.timeout ?? 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.$transaction(fn as any, { timeout });
      } catch (error) {
        if (attempt === maxRetries) throw error;

        // Check if it's a serialization error (P2034) or deadlock (P2030)
        const prismaError = error as any;
        if (prismaError?.code === 'P2034' || prismaError?.code === 'P2030') {
          this.logger.warn(`Transaction conflict (attempt ${attempt}/${maxRetries}), retrying...`);
          await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Transaction failed after max retries');
  }

  // Alias kept for callers that use `prisma.transaction(...)` as a helper.
  async runInTransaction<T>(
    fn: (prisma: any) => Promise<T>,
    options?: { maxRetries?: number; timeout?: number },
  ): Promise<T> {
    return this.withTransaction(fn, options);
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
