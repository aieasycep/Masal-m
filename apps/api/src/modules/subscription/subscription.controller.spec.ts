import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@masalim/types';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';
import type { EntitlementService } from './entitlement.service';
import type { MonetizationConfigService } from './monetization-config.service';
import { SubscriptionController } from './subscription.controller';
import type { SubscriptionService } from './subscription.service';

type WebhookBody = Parameters<SubscriptionController['webhook']>[1];

function buildController(nodeEnv: Env['NODE_ENV']) {
  const subscriptions = { applyEvent: jest.fn(async () => undefined) };
  const env = { NODE_ENV: nodeEnv, REVENUECAT_WEBHOOK_SECRET: 'rc-secret' } as Env;
  const controller = new SubscriptionController(
    subscriptions as unknown as SubscriptionService,
    {} as EntitlementService,
    {} as MonetizationConfigService,
    env,
  );
  return { controller, subscriptions };
}

function event(environment: 'SANDBOX' | 'PRODUCTION'): WebhookBody {
  return {
    event: {
      id: 'evt-1',
      type: 'INITIAL_PURCHASE',
      app_user_id: 'u1',
      product_id: 'masalim_premium_monthly',
      event_timestamp_ms: 1_700_000_000_000,
      expiration_at_ms: 1_700_000_000_000 + 30 * 24 * 3600 * 1000,
      environment,
    },
  } as WebhookBody;
}

describe('SubscriptionController.webhook', () => {
  it('acknowledges but does not apply SANDBOX events in production', async () => {
    const { controller, subscriptions } = buildController('production');

    await expect(controller.webhook('rc-secret', event('SANDBOX'))).resolves.toEqual({
      received: true,
    });
    expect(subscriptions.applyEvent).not.toHaveBeenCalled();

    await controller.webhook('rc-secret', event('PRODUCTION'));
    expect(subscriptions.applyEvent).toHaveBeenCalledTimes(1);
  });

  it('applies SANDBOX events outside production', async () => {
    const { controller, subscriptions } = buildController('staging');

    await controller.webhook('rc-secret', event('SANDBOX'));

    expect(subscriptions.applyEvent).toHaveBeenCalledTimes(1);
    expect(subscriptions.applyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'INITIAL_PURCHASE', environment: 'SANDBOX' }),
      'revenuecat',
    );
  });

  it('rejects a wrong, wrong-length or missing secret with 401 (no timingSafeEqual throw)', async () => {
    const { controller, subscriptions } = buildController('production');

    for (const authorization of ['rc-secre', 'rc-secret-longer', 'xx-secret', undefined]) {
      const attempt = controller.webhook(authorization, event('PRODUCTION'));
      await expect(attempt).rejects.toBeInstanceOf(AppException);
      await attempt.catch((error: AppException) => {
        expect(error.code).toBe(ErrorCode.AUTH_TOKEN_INVALID);
        expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      });
    }
    expect(subscriptions.applyEvent).not.toHaveBeenCalled();
  });

  it('refuses every call when no secret is configured', async () => {
    const { controller } = buildController('staging');
    (controller as unknown as { env: Env }).env = {
      NODE_ENV: 'staging',
      REVENUECAT_WEBHOOK_SECRET: '',
    } as Env;

    await expect(controller.webhook('', event('PRODUCTION'))).rejects.toMatchObject({
      code: ErrorCode.AUTH_TOKEN_INVALID,
    });
  });
});
