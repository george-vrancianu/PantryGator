import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { ApiException } from '../common/api-exception';
import type { AppConfig } from '../config/env';
import { InviteCodeRateLimiter } from './invite-code-rate-limiter';

/**
 * Throttles Invite Code redemption (`join-preview` and `join` share one
 * budget): a Member can only guess so many codes a minute, and so can one IP.
 * Either limit tripping answers 429 `family.rate_limited` with Retry-After.
 * Run it after AuthGuard. Requests the per-Member limit blocks do not charge
 * the IP, so one throttled Member cannot lock out the rest of a shared IP.
 *
 * The IP is `request.clientIp`: the socket address, or the header named by
 * `TRUSTED_CLIENT_IP_HEADER` behind a hosting proxy (see `common/client-ip.ts`).
 *
 * Per-process and in memory (fixed one-minute windows, held by
 * `InviteCodeRateLimiter`, which signup with an Invite Code shares): it assumes a single
 * API instance. Running several multiplies the limits by the instance count
 * until a shared store replaces it. Expired windows are pruned on access.
 */
@Injectable()
export class InviteCodeRateLimitGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly limiter: InviteCodeRateLimiter,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const now = Date.now();
    this.limiter.prune(now);
    const retryAfterMs =
      this.limiter.hit(
        `user:${request.user.id}`,
        this.config.get('INVITE_CODE_LIMIT_PER_USER', { infer: true }),
        now,
      ) ??
      this.limiter.hit(
        `ip:${request.clientIp}`,
        this.config.get('INVITE_CODE_LIMIT_PER_IP', { infer: true }),
        now,
      );
    if (retryAfterMs === undefined) return true;
    // header() is synchronous and returns the reply for chaining; the result is unused.
    void http
      .getResponse<FastifyReply>()
      .header('Retry-After', Math.ceil(retryAfterMs / 1000));
    throw new ApiException(429, 'family.rate_limited');
  }
}
