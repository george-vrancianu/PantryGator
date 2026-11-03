import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env';
import { DATABASE } from '../database/database.constants';
import type { Database } from '../database/database.types';
import { AUTH } from './auth.constants';
import { AdminRoleGuard } from './admin-role.guard';
import { AuthGuard } from './auth.guard';
import { InviteCodeLimiterModule } from '../family/invite-code-limiter.module';
import { InviteCodeRateLimiter } from '../family/invite-code-rate-limiter';
import { PromoCodeRateLimiter } from '../promo-codes/promo-code-rate-limiter';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { SignupConfigController } from './signup-config.controller';
import { createAuth } from './create-auth';

@Global()
@Module({
  imports: [PromoCodesModule, InviteCodeLimiterModule],
  controllers: [SignupConfigController],
  providers: [
    {
      provide: AUTH,
      inject: [
        DATABASE,
        ConfigService,
        PromoCodeRateLimiter,
        InviteCodeRateLimiter,
      ],
      useFactory: (
        database: Database,
        config: ConfigService<AppConfig, true>,
        promoLimiter: PromoCodeRateLimiter,
        inviteLimiter: InviteCodeRateLimiter,
      ) =>
        createAuth(database, {
          baseURL: config.get('BETTER_AUTH_URL', { infer: true }),
          secret: config.get('BETTER_AUTH_SECRET', { infer: true }),
          clientOrigin: config.get('CLIENT_ORIGIN', { infer: true }),
          rateLimit: config.get('NODE_ENV', { infer: true }) !== 'test',
          signup: {
            requiresPromoCode: config.get('SIGNUP_REQUIRES_PROMO_CODE', {
              infer: true,
            }),
            reserveIp: (ip) => promoLimiter.reserveIp(ip),
            reserveInviteIp: (ip) => inviteLimiter.reserveIp(ip),
          },
        }),
    },
    AuthGuard,
    AdminRoleGuard,
  ],
  exports: [AUTH, AuthGuard, AdminRoleGuard],
})
export class AuthModule {}
