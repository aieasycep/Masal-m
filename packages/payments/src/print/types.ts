import type { BookSize, CoverType } from '@masalim/types';

export type PrintOrderStatus = 'PENDING' | 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface CreatePrintOrderInput {
  orderNumber: string;
  quantity: number;
  bookSize: BookSize;
  coverType: CoverType;
  pageCount: number;
  /** Signed URL (or storage key resolvable by the provider integration) of the print-ready PDF. */
  printPdfUrl: string;
  shipping: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    district: string;
    postalCode: string;
    country: 'TR';
  };
}

export interface PrintOrderState {
  providerOrderId: string;
  status: PrintOrderStatus;
  trackingNumber: string | null;
  carrier?: string | null;
  trackingUrl?: string | null;
}

/**
 * Print provider abstraction (§33). No Turkish print API has been selected yet;
 * production integrations implement this interface — see docs/providers.md.
 */
export interface PrintProvider {
  readonly name: string;
  createOrder(input: CreatePrintOrderInput): Promise<PrintOrderState>;
  getOrder(providerOrderId: string): Promise<PrintOrderState>;
  cancelOrder(providerOrderId: string): Promise<{ cancelled: boolean }>;
}
