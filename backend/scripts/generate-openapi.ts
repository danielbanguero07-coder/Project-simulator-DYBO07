#!/usr/bin/env node
/**
 * Generate OpenAPI specification and TypeScript types
 * Run with: npx ts-node scripts/generate-openapi.ts
 */

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { AppModule } from '../src/app.module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function generate() {
  console.log('📄 Generating OpenAPI specification...');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  const config = new DocumentBuilder()
    .setTitle('Simulation Game API')
    .setDescription(
      'Authoritative backend for web simulation game - Auth, Player, Simulation, Economy, Social',
    )
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

  const document = SwaggerModule.createDocument(app, config);

  // Write OpenAPI JSON
  const outputPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));
  console.log(`✅ OpenAPI spec written to ${outputPath}`);

  // Generate TypeScript types (requires @hey-api/openapi-ts or similar)
  // For now, just output the raw spec

  await app.close();
  console.log('🎉 OpenAPI generation complete!');
}

generate().catch((error) => {
  console.error('❌ Generation failed:', error);
  process.exit(1);
});