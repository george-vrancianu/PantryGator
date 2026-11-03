import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import type { CurrentUser as CurrentUserValue } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PromoCodeRateLimiter } from '../promo-codes/promo-code-rate-limiter';
import {
  PromoCodeService,
  type RedeemedPromoCode,
} from '../promo-codes/promo-code.service';
import { LOW_BALANCE_THRESHOLD, type CreditsView } from './credits.schemas';
import { CreditsService } from './credits.service';

const redeemBody = z.object({ code: z.string().min(1).max(64) });

@ApiTags('credits')
@Controller('credits')
@UseGuards(AuthGuard)
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly promoCodes: PromoCodeService,
    private readonly promoLimiter: PromoCodeRateLimiter,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "The Family's Credit Balance, Credit Prices, low-balance threshold and recent history",
  })
  async view(@CurrentUser() member: CurrentUserValue): Promise<CreditsView> {
    return {
      balance: await this.credits.balanceOfMember(member.id),
      prices: this.credits.prices(),
      lowBalanceThreshold: LOW_BALANCE_THRESHOLD,
      history: await this.credits.historyOfMember(member.id),
    };
  }

  @Post('promo-code')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Any Member: redeem a Promo Code for the Family; returns the new Credit Balance. Failed attempts are rate-limited',
  })
  async redeem(
    @CurrentUser() member: CurrentUserValue,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body(new ZodValidationPipe(redeemBody)) body: z.infer<typeof redeemBody>,
  ): Promise<RedeemedPromoCode> {
    const refund = this.promoLimiter.reserve(
      member.id,
      request.clientIp,
      reply,
    );
    const redeemed = await this.promoCodes.redeem(member.id, body.code);
    // Only failures use the budget.
    refund();
    return redeemed;
  }
}
