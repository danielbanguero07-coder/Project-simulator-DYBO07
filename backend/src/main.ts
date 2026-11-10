import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { useContainer } from 'class-validator';
import helmet from 'helmet';
import compression from 'compression';
import * as Sentry from '@sentry/node';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { TransformInterceptor } from './shared/interceptors/transform.interceptor';
import { LoggingInterceptor } from './shared/interceptors/logging.interceptor';
import { PrismaService } from './shared/services/prisma.service';
import { setupOpenTelemetry } from './shared/observability/opentelemetry';
import { cookieParser } from './shared/utils/cookie';

async function bootstrap() {
  // Initialize OpenTelemetry early
  setupOpenTelemetry();

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const prismaService = app.get(PrismaService);

  // Cookie parsing (access_token / refresh_token)
  app.use(cookieParser);

  // Global prefix
  app.setGlobalPrefix('api', { exclude: ['health', 'ready', 'metrics'] });

  // API Versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Configure properly for production
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  // CORS
  const configuredOrigins = configService.get<string[]>('cors.origins');
  const corsOrigins =
    Array.isArray(configuredOrigins) && configuredOrigins.length > 0
      ? configuredOrigins
      : (configService.get<string>('CORS_ORIGINS') || 'http://localhost:3000,http://localhost:5173')
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      validateCustomDecorators: true,
      errorHttpStatusCode: 422,
    }),
  );

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  useContainer(app.select(AppModule), { fallbackOnErrors: true });
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // Swagger/OpenAPI
  if (configService.get('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Simulation Game API')
      .setDescription('Authoritative backend for web simulation game - Auth, Player, Simulation, Economy, Social')
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addCookieAuth('refresh-token')
      .addTag('Auth', 'Authentication & Authorization')
      .addTag('Player', 'Player profile, inventory, progression')
      .addTag('Simulation', 'Game actions, state sync, tick processing')
      .addTag('Economy', 'Transactions, marketplace, resources')
      .addTag('Social', 'Clans, chat, friends, leaderboards')
      .addTag('Health', 'Health checks & metrics')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
      },
      customSiteTitle: 'Simulation Game API Docs',
    });

    // Generate OpenAPI JSON for client generation
    const fs = await import('fs');
    const path = await import('path');
    const outputPath = path.join(process.cwd(), 'openapi.json');
    fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
    console.log(`📄 OpenAPI spec written to ${outputPath}`);
  }

  // Enable shutdown hooks for Prisma
  await prismaService.enableShutdownHooks(app);

  const port = configService.get<number>('PORT') || 3000;
  const host = configService.get<string>('HOST') || '0.0.0.0';

  console.log(`⏳ Starting HTTP listener on ${host}:${port}...`);
  await app.listen(port, host);
  console.log(`🚀 Server running on http://${host}:${port}`);
  console.log(`📚 API Docs: http://${host}:${port}/docs`);
  console.log(`💚 Health: http://${host}:${port}/health`);
  console.log(`✅ Ready: http://${host}:${port}/ready`);
  console.log(`📊 Metrics: http://${host}:${port}/metrics`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});