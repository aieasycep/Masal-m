import { createHmac, randomUUID } from 'node:crypto';
import {
  PaymentError,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type VerifyPaymentResult,
} from './types';

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  /** https://sandbox-api.iyzipay.com for sandbox, https://api.iyzipay.com for production. */
  baseUrl: string;
}

/**
 * iyzico Checkout Form (CF) adapter using the HMAC-SHA256 auth scheme
 * (IYZWSv2). The business logic never touches iyzico shapes directly —
 * everything goes through the PaymentProvider interface (§34).
 * Verify current endpoint/docs at https://docs.iyzico.com when activating.
 */
export class IyzicoPaymentProvider implements PaymentProvider {
  readonly name = 'iyzico';

  constructor(private readonly config: IyzicoConfig) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body = {
      locale: 'tr',
      conversationId: input.paymentId,
      price: input.amount,
      paidPrice: input.amount,
      currency: input.currency,
      basketId: input.orderNumber,
      paymentGroup: 'PRODUCT',
      callbackUrl: input.callbackUrl,
      buyer: {
        id: input.buyer.id,
        name: input.buyer.name.split(' ')[0] ?? input.buyer.name,
        surname: input.buyer.name.split(' ').slice(1).join(' ') || '-',
        email: input.buyer.email,
        identityNumber: '11111111111',
        registrationAddress: input.shippingAddress.addressLine,
        ip: input.buyer.ip,
        city: input.shippingAddress.city,
        country: 'Turkey',
      },
      shippingAddress: {
        contactName: input.shippingAddress.fullName,
        city: input.shippingAddress.city,
        country: 'Turkey',
        address: `${input.shippingAddress.addressLine}, ${input.shippingAddress.district}`,
        zipCode: input.shippingAddress.postalCode,
      },
      billingAddress: {
        contactName: input.shippingAddress.fullName,
        city: input.shippingAddress.city,
        country: 'Turkey',
        address: `${input.shippingAddress.addressLine}, ${input.shippingAddress.district}`,
        zipCode: input.shippingAddress.postalCode,
      },
      basketItems: input.basketItems.map((item) => ({
        id: item.id,
        name: item.name,
        category1: 'Kitap',
        itemType: 'PHYSICAL',
        price: item.price,
      })),
    };

    const response = await this.request<{
      status: string;
      token?: string;
      paymentPageUrl?: string;
      errorMessage?: string;
    }>('/payment/iyzipos/checkoutform/initialize/auth/ecom', body);

    if (response.status !== 'success' || !response.token) {
      throw new PaymentError(`iyzico init failed: ${response.errorMessage ?? 'unknown error'}`);
    }
    return {
      providerPaymentId: response.token,
      checkoutUrl: response.paymentPageUrl ?? null,
      providerToken: response.token,
    };
  }

  async verifyPayment(providerToken: string): Promise<VerifyPaymentResult> {
    const response = await this.request<{
      status: string;
      paymentStatus?: string;
      paymentId?: string;
      paidPrice?: number | string;
      errorMessage?: string;
    }>('/payment/iyzipos/checkoutform/auth/ecom/detail', { token: providerToken, locale: 'tr' });

    const succeeded = response.status === 'success' && response.paymentStatus === 'SUCCESS';
    return {
      status: succeeded ? 'SUCCEEDED' : response.paymentStatus === 'INIT_THREEDS' ? 'PENDING' : 'FAILED',
      providerPaymentId: String(response.paymentId ?? providerToken),
      paidAmount: response.paidPrice != null ? String(response.paidPrice) : null,
      rawResponse: sanitize(response),
    };
  }

  async refund(providerPaymentId: string, amount: string): Promise<{ refunded: boolean }> {
    const response = await this.request<{ status: string; errorMessage?: string }>(
      '/payment/refund',
      {
        locale: 'tr',
        paymentTransactionId: providerPaymentId,
        price: amount,
        currency: 'TRY',
        conversationId: randomUUID(),
      },
    );
    if (response.status !== 'success') {
      throw new PaymentError(`iyzico refund failed: ${response.errorMessage ?? 'unknown error'}`);
    }
    return { refunded: true };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const randomKey = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const payload = JSON.stringify(body);
    const signature = createHmac('sha256', this.config.secretKey)
      .update(randomKey + path + payload)
      .digest('hex');
    const authorization = `IYZWSv2 ${Buffer.from(
      `apiKey:${this.config.apiKey}&randomKey:${randomKey}&signature:${signature}`,
    ).toString('base64')}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'x-iyzi-rnd': randomKey,
          'Content-Type': 'application/json',
        },
        body: payload,
      });
    } catch (err) {
      throw new PaymentError('iyzico request failed', err);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new PaymentError(`iyzico HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    return (await response.json()) as T;
  }
}

/** Strip anything card-like before persisting raw responses (§47). */
function sanitize(raw: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...raw };
  for (const key of Object.keys(clone)) {
    if (/card|pan|cvc|cvv/i.test(key)) delete clone[key];
  }
  return clone;
}
