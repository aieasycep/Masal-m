import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookSize, CoverType } from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  letterSpacing,
  radius,
  shadows,
  spacing,
} from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { Button } from '../../../src/components/Button';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { SelectableCard } from '../../../src/components/SelectableCard';
import { ErrorState } from '../../../src/components/states';

const QUOTE_DEBOUNCE_MS = 300;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 20;

/** Checkout flow: configure (this) → address → review. */
const TOTAL_STEPS = 3;
const STEP_INDEX = 0;

const BOOK_SIZES: BookSize[] = [BookSize.SQUARE, BookSize.STANDARD];
const COVER_TYPES: CoverType[] = [CoverType.HARDCOVER, CoverType.SOFTCOVER];

/** "649.00" → "₺649,00" (Turkish decimal comma + thousands dots). */
function formatPrice(amount: string): string {
  const [int = '0', frac = '00'] = amount.split('.');
  return `₺${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

/** Debounce config changes so the server quote isn't spammed while tapping. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Thin 3-segment checkout progress bar under the header (design: PrintOrder). */
function StepBar() {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: TOTAL_STEPS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.progressSegment,
            index <= STEP_INDEX ? styles.progressFilled : styles.progressEmpty,
          ]}
        />
      ))}
    </View>
  );
}

/** Checkout step 1 — product configuration with a live server quote (§34, §82). */
export default function CheckoutConfigure() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  const begin = useCheckoutStore((state) => state.begin);
  const quantity = useCheckoutStore((state) => state.quantity);
  const bookSize = useCheckoutStore((state) => state.bookSize);
  const coverType = useCheckoutStore((state) => state.coverType);
  const setQuantity = useCheckoutStore((state) => state.setQuantity);
  const setBookSize = useCheckoutStore((state) => state.setBookSize);
  const setCoverType = useCheckoutStore((state) => state.setCoverType);

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

  const bookQuery = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => api.books.get(bookId as string),
    enabled: bookId != null && bookId.length > 0,
  });

  const debouncedConfig = useDebouncedValue({ quantity, bookSize, coverType }, QUOTE_DEBOUNCE_MS);
  const quoteQuery = useQuery({
    queryKey: [
      'quote',
      bookId,
      debouncedConfig.quantity,
      debouncedConfig.bookSize,
      debouncedConfig.coverType,
    ],
    queryFn: () =>
      api.orders.quote({
        bookId: bookId as string,
        quantity: debouncedConfig.quantity,
        bookSize: debouncedConfig.bookSize,
        coverType: debouncedConfig.coverType,
      }),
    enabled: bookId != null && bookId.length > 0,
    // Keep the last quote on screen while the next one loads (no flicker).
    placeholderData: keepPreviousData,
  });
  const quote = quoteQuery.data;
  const quotePending =
    quoteQuery.isFetching ||
    debouncedConfig.quantity !== quantity ||
    debouncedConfig.bookSize !== bookSize ||
    debouncedConfig.coverType !== coverType;

  if (bookQuery.isError) {
    return (
      <Screen>
        <ScreenHeader eyebrow={t('checkout.eyebrow')} title={t('checkout.configTitle')} />
        <StepBar />
        <ErrorState
          emoji="🌧️"
          title={mapError(bookQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => void bookQuery.refetch()}
        />
      </Screen>
    );
  }

  const book = bookQuery.data;

  return (
    <Screen>
      <ScreenHeader eyebrow={t('checkout.eyebrow')} title={t('checkout.configTitle')} />
      <StepBar />

      {book == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <>
          {/* Product card — book-shaped cover thumb + title. */}
          <View style={[styles.productCard, shadows.cardSubtle]}>
            <View style={styles.coverThumb}>
              <LinearGradient
                colors={gradients.playerCover as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.coverFill}
              />
              {book.coverImageUrl != null ? (
                <Image
                  source={{ uri: book.coverImageUrl }}
                  style={styles.coverFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.coverEmoji}>⭐</Text>
              )}
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {book.title}
              </Text>
              {book.subtitle != null && book.subtitle.length > 0 ? (
                <Text style={styles.productSubtitle} numberOfLines={1}>
                  {book.subtitle}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Book size. */}
          <Text style={styles.sectionLabel}>
            {t('checkout.bookSize').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.optionRow} accessibilityRole="radiogroup">
            {BOOK_SIZES.map((size) => (
              <SelectableCard
                key={size}
                selected={bookSize === size}
                showCheck={false}
                onPress={() => setBookSize(size)}
                accessibilityLabel={t(`checkout.sizes.${size}`)}
                style={styles.optionTile}
              >
                <View style={styles.optionContent}>
                  <Text
                    style={[styles.sizeLabel, bookSize === size && styles.optionLabelSelected]}
                  >
                    {t(`checkout.sizes.${size}`)}
                  </Text>
                  <Text style={styles.optionSub}>{t(`checkout.sizeDims.${size}`)}</Text>
                </View>
              </SelectableCard>
            ))}
          </View>

          {/* Cover type. */}
          <Text style={styles.sectionLabel}>
            {t('checkout.coverTypeLabel').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.optionRow} accessibilityRole="radiogroup">
            {COVER_TYPES.map((cover) => (
              <SelectableCard
                key={cover}
                selected={coverType === cover}
                showCheck={false}
                onPress={() => setCoverType(cover)}
                accessibilityLabel={t(`checkout.covers.${cover}`)}
                style={styles.optionTile}
              >
                <View style={styles.optionContent}>
                  <Text style={styles.optionEmoji}>
                    {cover === CoverType.HARDCOVER ? '📗' : '📔'}
                  </Text>
                  <Text
                    style={[styles.coverLabel, coverType === cover && styles.optionLabelSelected]}
                  >
                    {t(`checkout.covers.${cover}`)}
                  </Text>
                  <Text style={styles.optionSub}>{t(`checkout.coverSubs.${cover}`)}</Text>
                </View>
              </SelectableCard>
            ))}
          </View>

          {/* Quantity stepper (1–20). */}
          <Text style={styles.sectionLabel}>
            {t('checkout.quantity').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.stepperRow}>
            <Pressable
              onPress={() => setQuantity(Math.max(MIN_QUANTITY, quantity - 1))}
              disabled={quantity <= MIN_QUANTITY}
              accessibilityRole="button"
              accessibilityLabel="−"
              style={[
                styles.stepperButton,
                styles.stepperMinus,
                quantity <= MIN_QUANTITY && styles.stepperDisabled,
              ]}
            >
              <Text style={styles.stepperMinusSign}>−</Text>
            </Pressable>
            <Text style={styles.stepperValue} accessibilityLiveRegion="polite">
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))}
              disabled={quantity >= MAX_QUANTITY}
              accessibilityRole="button"
              accessibilityLabel="+"
              style={[
                styles.stepperButton,
                styles.stepperPlus,
                quantity >= MAX_QUANTITY && styles.stepperDisabled,
              ]}
            >
              <Text style={styles.stepperPlusSign}>+</Text>
            </Pressable>
          </View>

          {/* Live server quote — prices only ever come from the API (§82). */}
          <View style={[styles.summaryCard, shadows.cardSubtle]}>
            {quoteQuery.isError ? (
              <View style={styles.quoteErrorBlock}>
                <Text style={styles.quoteError}>{mapError(quoteQuery.error)}</Text>
                <Button
                  label={t('common.retry')}
                  variant="secondary"
                  compact
                  onPress={() => void quoteQuery.refetch()}
                />
              </View>
            ) : quote == null ? (
              <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
            ) : (
              <>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>
                    {t('checkout.priceLine', {
                      qty: quantity,
                      size: t(`checkout.sizes.${bookSize}`),
                      cover: t(`checkout.covers.${coverType}`),
                    })}
                  </Text>
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
                  <View style={styles.totalValueRow}>
                    {quotePending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : null}
                    <Text style={[styles.totalValue, quotePending && styles.totalValueStale]}>
                      {formatPrice(quote.total)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.deliveryNote}>
                  {`🚚 ${t('checkout.estimatedDelivery', {
                    min: quote.estimatedDeliveryDays.min,
                    max: quote.estimatedDeliveryDays.max,
                  })}`}
                </Text>
              </>
            )}
          </View>

          <Button
            label={t('checkout.continue')}
            onPress={() => router.push(`/checkout/${bookId}/address` as never)}
            disabled={quote == null}
            style={styles.cta}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: spacing.xxxl },
  progressRow: { flexDirection: 'row', gap: 4, marginTop: -8, marginBottom: spacing.lg },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressFilled: { backgroundColor: colors.primary },
  progressEmpty: { backgroundColor: colors.border },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coverThumb: {
    width: 64,
    height: 84,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: colors.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 3,
  },
  coverFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  coverEmoji: { fontSize: 28 },
  productInfo: { flex: 1 },
  productTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    color: colors.foreground,
    marginBottom: 2,
  },
  productSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginTop: spacing.xl,
    marginBottom: 10,
  },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionTile: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  optionContent: { flex: 1, alignItems: 'center', gap: 2 },
  optionEmoji: { fontSize: 28, marginBottom: 4 },
  sizeLabel: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
    textAlign: 'center',
  },
  coverLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    textAlign: 'center',
  },
  optionLabelSelected: { color: colors.primary },
  optionSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.lg,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperMinus: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperPlus: { backgroundColor: colors.secondary },
  stepperDisabled: { opacity: 0.4 },
  stepperMinusSign: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg + 5,
    color: colors.foreground,
    lineHeight: 24,
  },
  stepperPlusSign: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.lg + 5,
    color: colors.primary,
    lineHeight: 24,
  },
  stepperValue: {
    minWidth: 40,
    textAlign: 'center',
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
  },
  summaryCard: {
    marginTop: spacing.xl,
    padding: spacing.md,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryLabel: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  summaryValue: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  totalLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  totalValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  totalValue: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.primary,
  },
  totalValueStale: { opacity: 0.5 },
  deliveryNote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  quoteErrorBlock: { gap: spacing.sm },
  quoteError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  cta: { marginTop: spacing.xl },
});
