import { Logger } from '@nestjs/common';
import { DEFAULT_MONETIZATION } from '@masalim/types';
import type { PrismaService } from '../../prisma/prisma.service';
import { MonetizationConfigService } from './monetization-config.service';

function buildService(row: { value: unknown } | null) {
  const prisma = {
    pricingConfig: {
      findFirst: jest.fn(async () => (row == null ? null : { key: 'monetization_v1', ...row })),
    },
  } as unknown as PrismaService;
  return { service: new MonetizationConfigService(prisma), prisma };
}

describe('MonetizationConfigService — invalid monetization_v1 row (D.7)', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs the parse issues once per cache window and serves the code defaults', async () => {
    const { service, prisma } = buildService({ value: { packs: 'not-a-list' } });

    const first = await service.get();
    const second = await service.get();

    expect(first.packs).toHaveLength(DEFAULT_MONETIZATION.packs.length);
    expect(second).toBe(first);
    expect(prisma.pricingConfig.findFirst).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'monetization_v1',
        issues: expect.arrayContaining([expect.objectContaining({ path: ['packs'] })]),
      }),
      'monetization_v1 invalid — using code defaults',
    );
  });

  it('does not log for a missing row (fresh database) or a valid row', async () => {
    const missing = buildService(null);
    expect((await missing.service.get()).subscription.productId).toBe(
      DEFAULT_MONETIZATION.subscription.productId,
    );

    const valid = buildService({
      value: {
        ...DEFAULT_MONETIZATION,
        subscription: { ...DEFAULT_MONETIZATION.subscription, priceTRY: '1099.99' },
      },
    });
    expect((await valid.service.get()).subscription.priceTRY).toBe('1099.99');

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
