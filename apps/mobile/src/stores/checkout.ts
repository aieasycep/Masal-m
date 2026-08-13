import { create } from 'zustand';
import { BookSize, CoverType } from '@masalim/types';

/**
 * Idempotency key for one checkout attempt (§78). Generated ONCE per attempt
 * and reused on retry so double taps / retries create exactly one order.
 */
function makeIdempotencyKey(prefix: string, bookId: string): string {
  return `${prefix}-${bookId}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

interface CheckoutDraft {
  /** Book being ordered — begin() resets the draft when it changes. */
  bookId: string | null;
  quantity: number;
  bookSize: BookSize;
  coverType: CoverType;
  /** Selected (persisted) shipping address. */
  addressId: string | null;
  /** Order created by the current attempt (create is idempotent regardless). */
  orderId: string | null;
  /** Idempotency-Key for POST /orders. */
  orderKey: string;
  /** Idempotency-Key for POST /orders/:id/payment. */
  paymentKey: string;
}

interface CheckoutState extends CheckoutDraft {
  /** Enter the checkout flow — keeps the draft when re-entering for the same book. */
  begin: (bookId: string) => void;
  setQuantity: (quantity: number) => void;
  setBookSize: (bookSize: BookSize) => void;
  setCoverType: (coverType: CoverType) => void;
  setAddressId: (addressId: string) => void;
  setOrderId: (orderId: string) => void;
  reset: () => void;
}

function freshDraft(bookId: string | null): CheckoutDraft {
  const keyBase = bookId ?? 'none';
  return {
    bookId,
    quantity: 1,
    bookSize: BookSize.SQUARE,
    coverType: CoverType.HARDCOVER,
    addressId: null,
    orderId: null,
    orderKey: makeIdempotencyKey('order', keyBase),
    paymentKey: makeIdempotencyKey('payment', keyBase),
  };
}

/**
 * A config/address change after an order was already created is a NEW checkout
 * attempt: the old idempotency key would replay the stale order, so rotate the
 * keys and drop the created order id. No-op while nothing was created yet.
 */
function invalidateAttempt(state: CheckoutState): Partial<CheckoutDraft> {
  if (state.orderId == null) return {};
  const keyBase = state.bookId ?? 'none';
  return {
    orderId: null,
    orderKey: makeIdempotencyKey('order', keyBase),
    paymentKey: makeIdempotencyKey('payment', keyBase),
  };
}

/**
 * Physical-book checkout draft (config + address + idempotency keys). Plain
 * non-persisted store: survives navigation within the session, starts fresh on
 * relaunch (a half-done checkout is safe to abandon — nothing is charged).
 */
export const useCheckoutStore = create<CheckoutState>()((set) => ({
  ...freshDraft(null),
  begin: (bookId) =>
    set((state) => (state.bookId === bookId ? {} : freshDraft(bookId))),
  setQuantity: (quantity) => set((state) => ({ quantity, ...invalidateAttempt(state) })),
  setBookSize: (bookSize) => set((state) => ({ bookSize, ...invalidateAttempt(state) })),
  setCoverType: (coverType) => set((state) => ({ coverType, ...invalidateAttempt(state) })),
  setAddressId: (addressId) =>
    set((state) => (state.addressId === addressId ? {} : { addressId, ...invalidateAttempt(state) })),
  setOrderId: (orderId) => set({ orderId }),
  reset: () => set(freshDraft(null)),
}));
