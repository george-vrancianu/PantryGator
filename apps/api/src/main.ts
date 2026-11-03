import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp, MAX_REQUEST_BODY_BYTES } from './app.setup';
import type { AppConfig } from './config/env';
import { serveWebApp } from './web-app';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: MAX_REQUEST_BODY_BYTES }),
  );
  const config = app.get(ConfigService<AppConfig, true>);

  configureApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PantryGator API')
    .setDescription('PantryGator API')
    .setVersion('1.0')
    .addCookieAuth('better-auth.session_token')
    .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'assistant-token')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const webDistDir = config.get('WEB_DIST_DIR', { infer: true });
  if (webDistDir) await serveWebApp(app, webDistDir);

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on port ${port} (all interfaces)`, 'Bootstrap');
}

// Top-level entry point: if bootstrap() rejects, Node's default unhandled-rejection handling logs the error and exits non-zero, which is what we want for a failed startup.
void bootstrap();
