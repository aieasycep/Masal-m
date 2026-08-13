import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookSize, CoverType } from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, shadows, spacing } from '@masalim/ui';
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
        <ScreenHeader title={t('checkout.configTitle')} />
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
      <ScreenHeader title={t('checkout.configTitle')} />

      {book == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <>
          {/* Product card — cover thumb + title. */}
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
                  <Text style={styles.optionEmoji}>{size === BookSize.SQUARE ? '⬛' : '📄'}</Text>
                  <Text
                    style={[styles.optionLabel, bookSize === size && styles.optionLabelSelected]}
                  >
                    {t(`checkout.sizes.${size}`)}
                  </Text>
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
                    {cover === CoverType.HARDCOVER ? '📕' : '📙'}
                  </Text>
                  <Text
                    style={[styles.optionLabel, coverType === cover && styles.optionLabelSelected]}
                  >
                    {t(`checkout.covers.${cover}`)}
                  </Text>
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
              style={[styles.stepperButton, quantity <= MIN_QUANTITY && styles.stepperDisabled]}
            >
              <Text style={styles.stepperSign}>−</Text>
            </Pressable>
            <Text style={styles.stepperValue} accessibilityLiveRegion="polite">
              {quantity}
            </Text>
            <Pressable
              onPress={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))}
              disabled={quantity >= MAX_QUANTITY}
              accessibilityRole="button"
              accessibilityLabel="+"
              style={[styles.stepperButton, quantity >= MAX_QUANTITY && styles.stepperDisabled]}
            >
              <Text style={styles.stepperSign}>+</Text>
            </Pressable>
          </View>

          {/* Live server quote — prices only ever come from the API (§82). */}
          <View style={styles.quoteCard}>
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
                <View style={styles.quoteRow}>
                  <Text style={styles.quoteLabel}>{t('checkout.price')}</Text>
                  <View style={styles.quoteValueRow}>
                    {quotePending ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : null}
                    <Text style={[styles.quoteValue, quotePending && styles.quoteValueStale]}>
                      {formatPrice(quote.total)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.deliveryNote}>
                  {t('checkout.estimatedDelivery', {
                    min: quote.estimatedDeliveryDays.min,
                    max: quote.estimatedDeliveryDays.max,
                  })}
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
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
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
  productSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  optionRow: { flexDirection: 'row', gap: spacing.xs },
  optionTile: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  optionContent: { flex: 1, alignItems: 'center', gap: 4 },
  optionEmoji: { fontSize: 22 },
  optionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    textAlign: 'center',
  },
  optionLabelSelected: { color: colors.primary },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: { opacity: 0.4 },
  stepperSign: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.h3,
    color: colors.primary,
    lineHeight: 24,
  },
  stepperValue: {
    minWidth: 32,
    textAlign: 'center',
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
  },
  quoteCard: {
    marginTop: spacing.xl,
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.secondary,
    gap: 6,
  },
  quoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quoteLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.secondaryForeground,
  },
  quoteValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quoteValue: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: colors.primary,
  },
  quoteValueStale: { opacity: 0.5 },
  deliveryNote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  quoteErrorBlock: { gap: spacing.sm },
  quoteError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  cta: { marginTop: spacing.xl },
});
