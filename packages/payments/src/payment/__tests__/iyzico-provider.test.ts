import { afterEach, describe, expect, it, vi } from 'vitest';
import { IyzicoPaymentProvider, normalizeAmount } from '../iyzico-provider';

function stubDetail(body: Record<string, unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeAmount', () => {
  it('renders provider numbers and bare strings as 2-decimal strings', () => {
    expect(normalizeAmount(649)).toBe('649.00');
    expect(normalizeAmount('649')).toBe('649.00');
    expect(normalizeAmount('649.5')).toBe('649.50');
    expect(normalizeAmount(649.004)).toBe('649.00');
  });

  it('returns null for missing or non-numeric values', () => {
    expect(normalizeAmount(null)).toBeNull();
    expect(normalizeAmount(undefined)).toBeNull();
    expect(normalizeAmount('')).toBeNull();
    expect(normalizeAmount('abc')).toBeNull();
    expect(normalizeAmount(Number.NaN)).toBeNull();
  });
});

describe('IyzicoPaymentProvider.verifyPayment', () => {
  const provider = new IyzicoPaymentProvider({
    apiKey: 'k',
    secretKey: 's',
    baseUrl: 'https://sandbox-api.iyzipay.com',
  });

  it('normalises paidPrice and echoes basketId on success', async () => {
    stubDetail({
      status: 'success',
      paymentStatus: 'SUCCESS',
      paymentId: 'pay-1',
      paidPrice: 649,
      basketId: 'MSL-2024-0001',
      cardAssociation: 'VISA',
    });

    const verdict = await provider.verifyPayment('tok');
    expect(verdict.status).toBe('SUCCEEDED');
    expect(verdict.paidAmount).toBe('649.00');
    expect(verdict.basketId).toBe('MSL-2024-0001');
    // Card-like fields never reach persistence (§47).
    expect(verdict.rawResponse).not.toHaveProperty('cardAssociation');
  });

  it('reports null amount/basket when the provider omits them', async () => {
    stubDetail({ status: 'failure', paymentStatus: 'FAILURE', errorMessage: 'declined' });

    const verdict = await provider.verifyPayment('tok');
    expect(verdict.status).toBe('FAILED');
    expect(verdict.paidAmount).toBeNull();
    expect(verdict.basketId).toBeNull();
    expect(verdict.providerTransactionId).toBeNull();
  });

  it('captures the basket item transaction id a refund must name (numeric ids stringified)', async () => {
    stubDetail({
      status: 'success',
      paymentStatus: 'SUCCESS',
      paymentId: 12345,
      paidPrice: 649,
      itemTransactions: [{ paymentTransactionId: 67890, price: 649 }],
    });

    const verdict = await provider.verifyPayment('tok');
    expect(verdict.providerPaymentId).toBe('12345');
    expect(verdict.providerTransactionId).toBe('67890');
  });
});

describe('IyzicoPaymentProvider.refund', () => {
  const provider = new IyzicoPaymentProvider({
    apiKey: 'k',
    secretKey: 's',
    baseUrl: 'https://sandbox-api.iyzipay.com',
  });

  function stubRefund(body: Record<string, unknown>) {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(body), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const sentBody = (fetchMock: ReturnType<typeof stubRefund>) =>
    JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

  it('sends the captured transaction id as paymentTransactionId', async () => {
    const fetchMock = stubRefund({ status: 'success' });

    await expect(
      provider.refund({
        providerPaymentId: 'checkout-token',
        amount: '649.00',
        providerTransactionId: '67890',
      }),
    ).resolves.toEqual({ refunded: true });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/payment/refund');
    expect(sentBody(fetchMock)).toMatchObject({
      paymentTransactionId: '67890',
      price: '649.00',
      currency: 'TRY',
    });
  });

  it('falls back to the payment id when no transaction id was captured', async () => {
    const fetchMock = stubRefund({ status: 'success' });

    await provider.refund({ providerPaymentId: 'checkout-token', amount: '649.00' });

    expect(sentBody(fetchMock).paymentTransactionId).toBe('checkout-token');
  });

  it('surfaces a provider failure as PaymentError', async () => {
    stubRefund({ status: 'failure', errorMessage: 'Transaction not found' });

    await expect(
      provider.refund({ providerPaymentId: 'checkout-token', amount: '649.00' }),
    ).rejects.toThrow('iyzico refund failed: Transaction not found');
  });
});
