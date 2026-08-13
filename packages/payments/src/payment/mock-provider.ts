import { randomUUID } from 'node:crypto';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  VerifyPaymentResult,
} from './types';

/**
 * Mock payment provider for development (§61). Payments auto-succeed;
 * an amount ending in ".13" simulates a failed payment so the failure
 * path is testable. checkoutUrl is null — the app skips the webview and
 * calls the dev-only completion endpoint directly.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly payments = new Map<string, { amount: string; fail: boolean }>();

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const token = `mock-pay-${randomUUID()}`;
    this.payments.set(token, { amount: input.amount, fail: input.amount.endsWith('.13') });
    return { providerPaymentId: token, checkoutUrl: null, providerToken: token };
  }

  async verifyPayment(providerToken: string): Promise<VerifyPaymentResult> {
    const record = this.payments.get(providerToken);
    if (record == null) {
      return { status: 'FAILED', providerPaymentId: providerToken, paidAmount: null, rawResponse: { mock: true, reason: 'unknown token' } };
    }
    return {
      status: record.fail ? 'FAILED' : 'SUCCEEDED',
      providerPaymentId: providerToken,
      paidAmount: record.fail ? null : record.amount,
      rawResponse: { mock: true },
    };
  }

  async refund(): Promise<{ refunded: boolean }> {
    return { refunded: true };
  }
}
