import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { CREDIT_PACK_PRODUCT_IDS, ErrorCode } from '@masalim/types';
import {
  mockPurchaseSchema,
  subscriptionEventSchema,
  EntitlementsResponse,
  OfferingsResponse,
  Subscription,
  SubscriptionEvent,
} from '@masalim/validation';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUser } from '../../common/auth/jwt-auth.guard';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { EntitlementService } from './entitlement.service';
import { MonetizationConfigService } from './monetization-config.service';
import { SubscriptionService } from './subscription.service';

/** RevenueCat webhook envelope — mapped to the normalized event shape. */
const revenueCatWebhookSchema = z.object({
  event: z.object({
    id: z.string().nullish(),
    type: z.string(),
    app_user_id: z.string(),
    product_id: z.string().nullish(),
    event_timestamp_ms: z.number().int(),
    expiration_at_ms: z.number().int().nullish(),
    /** Purchase/renewal time — anchors the Premium quota period (D.1). */
    purchased_at_ms: z.number().int().nullish(),
    environment: z.enum(['SANDBOX', 'PRODUCTION']).default('PRODUCTION'),
  }),
});

class MockPurchaseDto extends createZodDto(mockPurchaseSchema) {}
class RevenueCatWebhookDto extends createZodDto(revenueCatWebhookSchema) {}

/** Constant-time secret comparison; a length mismatch is simply "no match". */
function secretMatches(provided: string | undefined, expected: string): boolean {
  if (provided == null) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const SUPPORTED_EVENTS = new Set<SubscriptionEvent['eventType']>([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

@ApiTags('subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly entitlements: EntitlementService,
    private readonly monetization: MonetizationConfigService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser): Promise<Subscription> {
    return this.subscriptions.get(user.id);
  }

  @Get('entitlements')
  resolveEntitlements(@CurrentUser() user: AuthenticatedUser): Promise<EntitlementsResponse> {
    return this.entitlements.resolve(user.id);
  }

  /** Paywall products for THIS user: subscription + plan-priced credit packs. */
  @Get('offerings')
  async offerings(@CurrentUser() user: AuthenticatedUser): Promise<OfferingsResponse> {
    const plan = await this.entitlements.planFor(user.id);
    return this.monetization.offeringsFor(plan);
  }

  /** RevenueCat-shaped webhook — authenticated by the shared Authorization secret. */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: RevenueCatWebhookDto,
  ): Promise<{ received: boolean }> {
    const secret = this.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secret || !secretMatches(authorization, secret)) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Invalid webhook credentials',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // Sandbox purchases must never grant production entitlements.
    if (this.env.NODE_ENV === 'production' && body.event.environment === 'SANDBOX') {
      return { received: true };
    }
    const eventType = body.event.type as SubscriptionEvent['eventType'];
    if (!SUPPORTED_EVENTS.has(eventType)) {
      // Unknown event kinds (TRANSFER, TEST, …) are acknowledged and skipped.
      return { received: true };
    }
    await this.subscriptions.applyEvent(
      subscriptionEventSchema.parse({
        eventType,
        appUserId: body.event.app_user_id,
        productId: body.event.product_id ?? 'unknown',
        eventTimeMs: body.event.event_timestamp_ms,
        expirationAtMs: body.event.expiration_at_ms ?? null,
        purchasedAtMs: body.event.purchased_at_ms ?? null,
        environment: body.event.environment,
        eventId: body.event.id ?? null,
      }),
      'revenuecat',
    );
    return { received: true };
  }

  /**
   * Dev-only mock IAP (§37): drives the exact same normalized-event pipeline
   * as RevenueCat so entitlements flip for real. Refused outside mock mode.
   */
  @Post('mock/purchase')
  async mockPurchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: MockPurchaseDto,
  ): Promise<Subscription> {
    this.assertMockAllowed();
    const isPack = (CREDIT_PACK_PRODUCT_IDS as readonly string[]).includes(body.productId);
    await this.subscriptions.applyEvent(
      isPack
        ? {
            eventType: 'NON_RENEWING_PURCHASE',
            appUserId: user.id,
            productId: body.productId,
            eventTimeMs: Date.now(),
            expirationAtMs: null,
            purchasedAtMs: Date.now(),
            environment: 'SANDBOX',
            eventId: `mock:${randomUUID()}`,
          }
        : {
            eventType: 'INITIAL_PURCHASE',
            appUserId: user.id,
            productId: body.productId,
            eventTimeMs: Date.now(),
            expirationAtMs: Date.now() + 30 * 24 * 3600 * 1000,
            purchasedAtMs: Date.now(),
            environment: 'SANDBOX',
          },
      'mock',
    );
    return this.subscriptions.get(user.id);
  }

  @Post('mock/expire')
  async mockExpire(@CurrentUser() user: AuthenticatedUser): Promise<Subscription> {
    this.assertMockAllowed();
    await this.subscriptions.applyEvent(
      {
        eventType: 'EXPIRATION',
        appUserId: user.id,
        productId: 'masalim_premium_monthly',
        eventTimeMs: Date.now(),
        expirationAtMs: Date.now(),
        purchasedAtMs: null,
        environment: 'SANDBOX',
      },
      'mock',
    );
    return this.subscriptions.get(user.id);
  }

  private assertMockAllowed(): void {
    if (this.env.NODE_ENV === 'production' || this.env.SUBSCRIPTION_PROVIDER !== 'mock') {
      throw new AppException(
        ErrorCode.FEATURE_DISABLED,
        'Mock subscription endpoints are disabled',
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
