import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { AIJobStatus, PaymentStatus } from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { Button } from '../../../src/components/Button';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { ErrorState } from '../../../src/components/states';

const PAYMENT_POLL_MS = 3_000;
/** ~3 minutes of polling before giving up on the hosted checkout. */
const PAYMENT_MAX_POLLS = 60;

/** "649.00" → "₺649,00" (Turkish decimal comma + thousands dots). */
function formatPrice(amount: string): string {
  const [int = '0', frac = '00'] = amount.split('.');
  return `₺${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

type PayPhase = 'idle' | 'working' | 'polling';

/** Checkout step 3 — order summary, print-file readiness gate and payment (§34). */
export default function CheckoutReview() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const queryClient = useQueryClient();

  const begin = useCheckoutStore((state) => state.begin);
  const quantity = useCheckoutStore((state) => state.quantity);
  const bookSize = useCheckoutStore((state) => state.bookSize);
  const coverType = useCheckoutStore((state) => state.coverType);
  const addressId = useCheckoutStore((state) => state.addressId);
  const orderKey = useCheckoutStore((state) => state.orderKey);
  const paymentKey = useCheckoutStore((state) => state.paymentKey);
  const setOrderId = useCheckoutStore((state) => state.setOrderId);

  useEffect(() => {
    if (bookId != null && bookId.length > 0) begin(bookId);
  }, [bookId, begin]);

  const mapError = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (error instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  // ---- Print-file readiness (§34): render print_pdf and wait before payment. ----
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const renderRequested = useRef(false);
  const renderJob = useJobProgress(renderJobId ?? undefined);
  const renderJobSucceeded = renderJob.status === AIJobStatus.SUCCEEDED;

  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => api.books.get(bookId as string),
    enabled: bookId != null && bookId.length > 0,
    // After the render job finishes, refetch until the signed printPdfUrl shows up.
    refetchInterval: (query) =>
      renderJobSucceeded && query.state.data?.printPdfUrl == null ? 2_000 : false,
  });
  const book = bookQuery.data;
  const printReady = book?.printPdfUrl != null;

  useEffect(() => {
    if (book == null || book.printPdfUrl != null || renderRequested.current) return;
    renderRequested.current = true;
    api.books
      .render(book.id, { kind: 'print_pdf' })
      .then(({ jobId }) => setRenderJobId(jobId))
      .catch((error) => setRenderError(mapError(error)));
    // mapError is stable in practice (t identity churn is irrelevant here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  useEffect(() => {
    if (renderJob.status === AIJobStatus.SUCCEEDED) {
      void queryClient.invalidateQueries({ queryKey: ['book', bookId] });
    } else if (
      renderJob.status === AIJobStatus.FAILED ||
      renderJob.status === AIJobStatus.CANCELLED
    ) {
      setRenderError(t('errors.BOOK_RENDER_FAILED'));
    }
  }, [renderJob.status, bookId, queryClient, t]);

  const retryRender = () => {
    setRenderError(null);
    setRenderJobId(null);
    renderRequested.current = false;
    void bookQuery.refetch();
  };

  // ---- Supporting data: quote, address, child name for the success copy. ----
  const quoteQuery = useQuery({
    queryKey: ['quote', bookId, quantity, bookSize, coverType],
    queryFn: () =>
      api.orders.quote({ bookId: bookId as string, quantity, bookSize, coverType }),
    enabled: bookId != null && bookId.length > 0,
  });
  const quote = quoteQuery.data;

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.addresses.list(),
  });
  const address = addressesQuery.data?.find((item) => item.id === addressId) ?? null;

  const storyQuery = useQuery({
    queryKey: ['story', book?.storyId],
    queryFn: () => api.stories.detail(book?.storyId as string),
    enabled: book?.storyId != null,
  });
  const childName = storyQuery.data?.childName ?? null;

  // ---- Payment (§78: idempotency keys live in the store, reused on retry). ----
  const [payPhase, setPayPhase] = useState<PayPhase>('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const finishSucceeded = async (orderId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    await queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    if (cancelledRef.current) return;
    useCheckoutStore.getState().reset();
    const nameParam = childName != null ? `&name=${encodeURIComponent(childName)}` : '';
    router.replace(
      `/checkout/${bookId}/success?orderId=${encodeURIComponent(orderId)}${nameParam}` as never,
    );
  };

  const failPayment = (message: string) => {
    if (cancelledRef.current) return;
    setPayError(message);
    setPayPhase('idle');
  };

  /** Poll the order until the hosted checkout resolves (3s cadence, ~3min cap). */
  const pollPayment = async (orderId: string) => {
    for (let attempt = 0; attempt < PAYMENT_MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, PAYMENT_POLL_MS));
      if (cancelledRef.current) return;
      try {
        const order = await api.orders.get(orderId);
        if (order.paymentStatus === PaymentStatus.SUCCEEDED) {
          await finishSucceeded(orderId);
          return;
        }
        if (
          order.paymentStatus === PaymentStatus.FAILED ||
          order.paymentStatus === PaymentStatus.REFUNDED
        ) {
          failPayment(t('errors.PAYMENT_FAILED'));
          return;
        }
      } catch {
        // Transient poll failure — keep trying until the cap.
      }
    }
    failPayment(t('errors.PAYMENT_FAILED'));
  };

  const startPayment = async () => {
    if (bookId == null || addressId == null || payPhase !== 'idle') return;
    setPayError(null);
    setPayPhase('working');
    try {
      // 1) Create the order — idempotent, so a retry returns the same order.
      const order = await api.orders.create(
        { bookId, quantity, bookSize, coverType, shippingAddressId: addressId },
        orderKey,
      );
      setOrderId(order.id);

      // 2) Init payment with its own idempotency key.
      const payment = await api.orders.initPayment(order.id, paymentKey);
      if (cancelledRef.current) return;

      // 3a) Mock provider: complete directly via the provider token.
      if (payment.providerToken != null) {
        const result = await api.orders.mockCompletePayment(payment.providerToken);
        if (result.status === 'SUCCEEDED') {
          await finishSucceeded(order.id);
        } else {
          failPayment(t('errors.PAYMENT_FAILED'));
        }
        return;
      }

      // 3b) Hosted checkout (iyzico): open the URL, then poll for the outcome.
      if (payment.checkoutUrl != null) {
        void WebBrowser.openBrowserAsync(payment.checkoutUrl);
      }
      setPayPhase('polling');
      await pollPayment(order.id);
    } catch (error) {
      failPayment(mapError(error));
    }
  };

  const paying = payPhase !== 'idle';
  const canPay = printReady && addressId != null && quote != null && !paying;

  if (bookQuery.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('checkout.reviewTitle')} />
        <ErrorState
          emoji="🌧️"
          title={mapError(bookQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => void bookQuery.refetch()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('checkout.reviewTitle')} />

      {book == null || quote == null ? (
        quoteQuery.isError ? (
          <ErrorState
            emoji="🌧️"
            title={mapError(quoteQuery.error)}
            ctaLabel={t('common.retry')}
            onCta={() => void quoteQuery.refetch()}
          />
        ) : (
          <ActivityIndicator
            color={colors.primary}
            style={styles.loader}
            accessibilityLabel={t('common.loading')}
          />
        )
      ) : (
        <>
          {/* Product line. */}
          <Text style={styles.sectionLabel}>
            {t('checkout.product').toLocaleUpperCase('tr')}
          </Text>
          <View style={[styles.productCard, shadows.cardSubtle]}>
            <View style={styles.coverThumb}>
              {book.coverImageUrl != null ? (
                <Image
                  source={{ uri: book.coverImageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.coverEmoji}>📖</Text>
              )}
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {`${book.title} × ${quantity}`}
              </Text>
              <Text style={styles.productMeta}>
                {`${t(`checkout.sizes.${bookSize}`)} · ${t(`checkout.covers.${coverType}`)}`}
              </Text>
            </View>
          </View>

          {/* Print-file readiness — honest progress from the real render job. */}
          {!printReady ? (
            <View style={styles.renderCard}>
              {renderError != null ? (
                <>
                  <Text style={styles.renderError}>{renderError}</Text>
                  <Button
                    label={t('common.retry')}
                    variant="secondary"
                    compact
                    onPress={retryRender}
                  />
                </>
              ) : (
                <View style={styles.renderRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.renderText} accessibilityLiveRegion="polite">
                    {renderJob.progress > 0
                      ? `${t('book.renderPreparing')} %${renderJob.progress}`
                      : t('book.renderPreparing')}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Price breakdown — server-quoted only (§82). */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('checkout.subtotal')}</Text>
              <Text style={styles.summaryValue}>{formatPrice(quote.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('checkout.shippingLabel')}</Text>
              <Text style={styles.summaryValue}>
                {quote.shipping === '0.00'
                  ? t('checkout.shippingFree')
                  : formatPrice(quote.shipping)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>{t('checkout.totalLabel')}</Text>
              <Text style={styles.totalValue}>{formatPrice(quote.total)}</Text>
            </View>
            <Text style={styles.deliveryNote}>
              {t('checkout.estimatedDelivery', {
                min: quote.estimatedDeliveryDays.min,
                max: quote.estimatedDeliveryDays.max,
              })}
            </Text>
          </View>

          {/* Shipping address. */}
          <Text style={styles.sectionLabel}>
            {t('checkout.addressTitle').toLocaleUpperCase('tr')}
          </Text>
          {address != null ? (
            <View style={styles.addressCard}>
              <Text style={styles.addressName}>{address.fullName}</Text>
              <Text style={styles.addressLine}>{address.addressLine}</Text>
              <Text style={styles.addressMeta}>
                {`${address.district} / ${address.city} · ${address.postalCode}`}
              </Text>
              <Text style={styles.addressMeta}>{address.phone}</Text>
            </View>
          ) : (
            <Button
              label={t('checkout.addressTitle')}
              variant="secondary"
              compact
              onPress={() => router.push(`/checkout/${bookId}/address` as never)}
            />
          )}

          {payError != null ? (
            <Text style={styles.payError} accessibilityLiveRegion="polite">
              {payError}
            </Text>
          ) : null}

          <Button
            label={paying ? t('checkout.paying') : t('checkout.payCta')}
            onPress={() => void startPayment()}
            disabled={!canPay}
            style={styles.cta}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coverThumb: {
    width: 56,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.lavenderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverEmoji: { fontSize: 24 },
  productInfo: { flex: 1 },
  productTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
    marginBottom: 2,
  },
  productMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  renderCard: {
    marginTop: spacing.sm,
    padding: 14,
    borderRadius: radius.base,
    backgroundColor: colors.secondary,
    gap: spacing.sm,
  },
  renderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  renderText: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.secondaryForeground,
  },
  renderError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  summaryCard: {
    marginTop: spacing.lg,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
  },
  summaryValue: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  summaryDivider: { height: 1, backgroundColor: colors.border },
  totalLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  totalValue: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.primary,
  },
  deliveryNote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  addressCard: {
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  addressName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  addressLine: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    lineHeight: 19,
  },
  addressMeta: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  payError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.lg,
  },
  cta: { marginTop: spacing.xl },
});
