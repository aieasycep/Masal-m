import { BookSize, CoverType } from '@masalim/types';
import { useCheckoutStore } from '../checkout';

describe('checkout store (§78 idempotency semantics)', () => {
  beforeEach(() => {
    useCheckoutStore.getState().reset();
  });

  it('begin() starts a fresh draft per book but keeps it on re-entry for the same book', () => {
    useCheckoutStore.getState().begin('book-1');
    const firstKey = useCheckoutStore.getState().orderKey;
    useCheckoutStore.getState().setQuantity(3);

    useCheckoutStore.getState().begin('book-1'); // re-enter same book
    expect(useCheckoutStore.getState().quantity).toBe(3);
    expect(useCheckoutStore.getState().orderKey).toBe(firstKey);

    useCheckoutStore.getState().begin('book-2'); // different book → fresh
    expect(useCheckoutStore.getState().quantity).toBe(1);
    expect(useCheckoutStore.getState().orderKey).not.toBe(firstKey);
  });

  it('keeps idempotency keys stable across retries while nothing changed', () => {
    useCheckoutStore.getState().begin('book-1');
    const { orderKey, paymentKey } = useCheckoutStore.getState();
    useCheckoutStore.getState().setQuantity(2); // no order created yet → keys stay
    expect(useCheckoutStore.getState().orderKey).toBe(orderKey);
    expect(useCheckoutStore.getState().paymentKey).toBe(paymentKey);
  });

  it('rotates keys and drops the order when config changes AFTER an order was created', () => {
    useCheckoutStore.getState().begin('book-1');
    useCheckoutStore.getState().setOrderId('order-1');
    const staleKey = useCheckoutStore.getState().orderKey;

    useCheckoutStore.getState().setCoverType(CoverType.SOFTCOVER);
    const state = useCheckoutStore.getState();
    expect(state.orderId).toBeNull(); // stale order can't be replayed with new config
    expect(state.orderKey).not.toBe(staleKey);
    expect(state.coverType).toBe(CoverType.SOFTCOVER);
  });

  it('address change after order creation also invalidates the attempt', () => {
    useCheckoutStore.getState().begin('book-1');
    useCheckoutStore.getState().setAddressId('addr-1');
    useCheckoutStore.getState().setOrderId('order-1');
    const staleKey = useCheckoutStore.getState().orderKey;

    useCheckoutStore.getState().setAddressId('addr-2');
    expect(useCheckoutStore.getState().orderId).toBeNull();
    expect(useCheckoutStore.getState().orderKey).not.toBe(staleKey);

    // Re-selecting the SAME address is a no-op.
    useCheckoutStore.getState().setOrderId('order-2');
    useCheckoutStore.getState().setAddressId('addr-2');
    expect(useCheckoutStore.getState().orderId).toBe('order-2');
  });

  it('reset clears everything including the book binding', () => {
    useCheckoutStore.getState().begin('book-1');
    useCheckoutStore.getState().setBookSize(BookSize.STANDARD);
    useCheckoutStore.getState().reset();
    expect(useCheckoutStore.getState().bookId).toBeNull();
    expect(useCheckoutStore.getState().bookSize).toBe(BookSize.SQUARE);
  });
});
