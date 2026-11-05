import multipart from '@fastify/multipart';
import { ConfigService } from '@nestjs/config';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AUTH } from './auth/auth.constants';
import type { AuthInstance } from './auth/auth.types';
import { toErrorResponse } from './common/api-error';
import { registerClientIp } from './common/client-ip';
import type { AppConfig } from './config/env';
import { allowedOrigins, isAllowedOrigin } from './config/origins';
import { MAX_VOICE_AUDIO_BYTES } from './voice/voice.schemas';
import { registerAuthHandler } from './auth/register-auth-handler';

/** Scan images arrive as data URLs in the JSON body, so the default 1 MB is far too small. */
export const MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024;

/** Wiring shared by the real server and the integration tests. */
export function configureApp(app: NestFastifyApplication): void {
  app.setGlobalPrefix('api');
  const config = app.get(ConfigService<AppConfig, true>);
  const origins = allowedOrigins(config.get('CLIENT_ORIGIN', { infer: true }));
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, !origin || isAllowedOrigin(origin, origins));
    },
    credentials: true,
    methods: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS',
    // The mobile apps read the session token from this header (Better Auth's bearer plugin).
    exposedHeaders: ['set-auth-token'],
  });
  // Before any route: guards, the auth handler and limiters read request.clientIp.
  registerClientIp(
    app.getHttpAdapter().getInstance(),
    config.get('TRUSTED_CLIENT_IP_HEADER', { infer: true }),
  );
  // Errors raised by Fastify itself (malformed JSON, routes registered outside
  // Nest such as /api/auth/*) never reach Nest's exception filter.
  app
    .getHttpAdapter()
    .getInstance()
    .setErrorHandler((error, _request, reply) => {
      const { status, body } = toErrorResponse(error);
      // Fire-and-forget: send() returns the reply for chaining; nothing to await in an error handler.
      void reply.code(status).send(body);
    });
  // Fire-and-forget: Fastify queues plugin registration; app.listen/ready awaits it.
  void app
    .getHttpAdapter()
    .getInstance()
    .register(multipart, {
      limits: {
        fileSize: MAX_VOICE_AUDIO_BYTES,
        files: 1,
        fields: 10,
        fieldSize: 1024,
      },
    });
  registerAuthHandler(
    app.getHttpAdapter().getInstance(),
    app.get<AuthInstance>(AUTH),
  );
}
