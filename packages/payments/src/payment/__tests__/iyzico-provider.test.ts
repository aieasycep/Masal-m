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
  });
});
