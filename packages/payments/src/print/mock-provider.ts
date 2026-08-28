import { randomUUID } from 'node:crypto';
import type { CreatePrintOrderInput, PrintOrderState, PrintProvider } from './types';

/**
 * Mock print provider: orders progress PENDING → IN_PRODUCTION → SHIPPED on a
 * timer so the order-tracking UI has real state transitions in development.
 */
export class MockPrintProvider implements PrintProvider {
  readonly name = 'mock';
  private readonly orders = new Map<string, { createdAt: number; cancelled: boolean }>();
  /** Seconds per stage; tests can shrink it. */
  private readonly stageSeconds: number;

  constructor(options?: { stageSeconds?: number }) {
    this.stageSeconds = options?.stageSeconds ?? 60;
  }

  async createOrder(_input: CreatePrintOrderInput): Promise<PrintOrderState> {
    const providerOrderId = `mock-print-${randomUUID()}`;
    this.orders.set(providerOrderId, { createdAt: Date.now(), cancelled: false });
    return { providerOrderId, status: 'PENDING', trackingNumber: null };
  }

  async getOrder(providerOrderId: string): Promise<PrintOrderState> {
    const record = this.orders.get(providerOrderId);
    if (record == null) {
      // Order created by a previous process run — treat as freshly in production.
      return { providerOrderId, status: 'IN_PRODUCTION', trackingNumber: null };
    }
    if (record.cancelled) {
      return { providerOrderId, status: 'CANCELLED', trackingNumber: null };
    }
    const elapsed = (Date.now() - record.createdAt) / 1000;
    if (elapsed < this.stageSeconds) {
      return { providerOrderId, status: 'PENDING', trackingNumber: null };
    }
    if (elapsed < this.stageSeconds * 2) {
      return { providerOrderId, status: 'IN_PRODUCTION', trackingNumber: null };
    }
    return {
      providerOrderId,
      status: 'SHIPPED',
      trackingNumber: `MOCK${providerOrderId.slice(-8).toUpperCase()}`,
      carrier: 'Masalım Test Kargo',
      trackingUrl: `https://example.com/track/MOCK${providerOrderId.slice(-8).toUpperCase()}`,
    };
  }

  async cancelOrder(providerOrderId: string): Promise<{ cancelled: boolean }> {
    const record = this.orders.get(providerOrderId);
    if (record != null) record.cancelled = true;
    return { cancelled: true };
  }
}
