export interface CreatePaymentInput {
  /** Internal payment id — becomes the provider conversation/reference id. */
  paymentId: string;
  orderNumber: string;
  /** Amount as a decimal string, e.g. "649.00" — computed server-side only (§82). */
  amount: string;
  currency: 'TRY';
  buyer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    ip: string;
  };
  shippingAddress: {
    fullName: string;
    addressLine: string;
    city: string;
    district: string;
    postalCode: string;
  };
  basketItems: Array<{ id: string; name: string; price: string }>;
  /** Where the provider redirects/posts after 3DS / checkout completion. */
  callbackUrl: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string;
  /** Hosted checkout form URL (iyzico checkout form); null for mock. */
  checkoutUrl: string | null;
  /** Provider token to verify the payment on callback. */
  providerToken: string;
}

export interface VerifyPaymentResult {
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  providerPaymentId: string;
  /**
   * Paid amount as reported by the provider, normalised to a 2-decimal string
   * ("649.00") — MUST be compared to the expected amount (§82).
   */
  paidAmount: string | null;
  /** Provider-echoed order reference (iyzico basketId) — compared to the order number when present. */
  basketId?: string | null;
  /**
   * Provider-side transaction id of the paid basket item (iyzico
   * `itemTransactions[0].paymentTransactionId`) — the id a refund must name.
   * Null when the provider has no such notion; persisted for later refunds.
   */
  providerTransactionId: string | null;
  rawResponse: unknown;
}

export interface RefundInput {
  providerPaymentId: string;
  /** Amount as a decimal string, e.g. "649.00". */
  amount: string;
  /** Transaction id captured at verify time; providers that need it fall back to `providerPaymentId` without it. */
  providerTransactionId?: string | null;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Verify a completed checkout using the provider token from the callback. */
  verifyPayment(providerToken: string): Promise<VerifyPaymentResult>;
  refund(input: RefundInput): Promise<{ refunded: boolean }>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}
