import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { OrderStatus } from '@masalim/types';
import type { Order } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/Button';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ErrorState } from '../../src/components/states';

/** Honest live tracking: refetch while the order is moving through production. */
const ACTIVE_REFETCH_MS = 15_000;

/** "649.00" → "₺649,00" (Turkish decimal comma + thousands dots). */
function formatPrice(amount: string): string {
  const [int = '0', frac = '00'] = amount.split('.');
  return `₺${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return date.toDateString();
  }
}

/** Happy-path status chain — steps not reached yet render dimmed. */
const CANONICAL_CHAIN: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

interface TimelineStep {
  status: OrderStatus;
  at: string | null;
  state: 'done' | 'current' | 'future';
}

function buildTimeline(order: Order): TimelineStep[] {
  const entries = order.timeline;
  const lastCurrentIndex = entries.reduce(
    (acc, entry, index) => (entry.status === order.status ? index : acc),
    -1,
  );
  const steps: TimelineStep[] = entries.map((entry, index) => ({
    status: entry.status,
    at: entry.at,
    state: index === lastCurrentIndex ? 'current' : 'done',
  }));
  // Append the not-yet-reached canonical steps while the order is on the happy path.
  if (CANONICAL_CHAIN.includes(order.status)) {
    const seen = new Set(entries.map((entry) => entry.status));
    for (const status of CANONICAL_CHAIN) {
      if (!seen.has(status)) steps.push({ status, at: null, state: 'future' });
    }
  }
  return steps;
}

/** Sipariş detayı — status timeline, tracking, address, totals, cancel (§35). */
export default function OrderDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const mapError = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (error instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.orders.get(id as string),
    enabled: id != null && id.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === OrderStatus.PAID || status === OrderStatus.IN_PRODUCTION
        ? ACTIVE_REFETCH_MS
        : false;
    },
  });
  const order = orderQuery.data;

  const cancelMutation = useMutation({
    mutationFn: () => api.orders.cancel(id as string),
    onSuccess: async () => {
      setConfirmCancel(false);
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
    onError: (error) => {
      setConfirmCancel(false);
      setActionError(mapError(error));
    },
  });

  if (orderQuery.isError) {
    return (
      <Screen>
        <ScreenHeader title={t('orders.title')} />
        <ErrorState
          emoji="🌧️"
          title={mapError(orderQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => void orderQuery.refetch()}
        />
      </Screen>
    );
  }

  const cancellable =
    order != null &&
    (order.status === OrderStatus.PENDING || order.status === OrderStatus.PAID);

  return (
    <Screen>
      <ScreenHeader title={order?.orderNumber ?? t('orders.title')} />

      {order == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <>
          {/* Product card. */}
          <View style={[styles.productCard, shadows.cardSubtle]}>
            <View style={styles.coverThumb}>
              {order.coverImageUrl != null ? (
                <Image
                  source={{ uri: order.coverImageUrl }}
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
                {`${order.bookTitle} × ${order.quantity}`}
              </Text>
              <Text style={styles.productMeta}>
                {`${t(`checkout.sizes.${order.bookSize}`)} · ${t(`checkout.covers.${order.coverType}`)}`}
              </Text>
            </View>
          </View>

          {/* Status timeline — vertical stepper from the order's real history. */}
          <View style={styles.timelineCard}>
            {buildTimeline(order).map((step, index, steps) => (
              <View key={`${step.status}-${index}`} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      step.state === 'current'
                        ? styles.timelineDotCurrent
                        : step.state === 'done'
                          ? styles.timelineDotDone
                          : styles.timelineDotFuture,
                    ]}
                  />
                  {index < steps.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineBody}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      step.state === 'current' && styles.timelineLabelCurrent,
                      step.state === 'future' && styles.timelineLabelFuture,
                    ]}
                  >
                    {t(`orders.statuses.${step.status}`)}
                  </Text>
                  {step.at != null ? (
                    <Text style={styles.timelineDate}>{formatDateTime(step.at)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* Tracking number (plain selectable text — no clipboard dep). */}
          {order.trackingNumber != null ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>
                {t('orders.trackingNumber').toLocaleUpperCase('tr')}
              </Text>
              <Text style={styles.trackingNumber} selectable>
                {order.trackingNumber}
              </Text>
            </View>
          ) : null}

          {/* Shipping address. */}
          {order.shippingAddress != null ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>
                {t('checkout.addressTitle').toLocaleUpperCase('tr')}
              </Text>
              <Text style={styles.addressName}>{order.shippingAddress.fullName}</Text>
              <Text style={styles.addressLine}>{order.shippingAddress.addressLine}</Text>
              <Text style={styles.addressMeta}>
                {`${order.shippingAddress.district} / ${order.shippingAddress.city} · ${order.shippingAddress.postalCode}`}
              </Text>
              <Text style={styles.addressMeta}>{order.shippingAddress.phone}</Text>
            </View>
          ) : null}

          {/* Price breakdown. */}
          <View style={styles.infoCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('checkout.price')}</Text>
              <Text style={styles.summaryValue}>{formatPrice(order.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t('checkout.shippingLabel')}</Text>
              <Text style={styles.summaryValue}>
                {order.shipping === '0.00'
                  ? t('checkout.shippingFree')
                  : formatPrice(order.shipping)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>{t('checkout.totalLabel')}</Text>
              <Text style={styles.totalValue}>{formatPrice(order.total)}</Text>
            </View>
          </View>

          {actionError != null ? (
            <Text style={styles.actionError} accessibilityLiveRegion="polite">
              {actionError}
            </Text>
          ) : null}

          {cancellable ? (
            <Button
              label={t('orders.cancelOrder')}
              variant="destructive"
              onPress={() => {
                setActionError(null);
                setConfirmCancel(true);
              }}
              loading={cancelMutation.isPending}
              style={styles.cancelButton}
            />
          ) : null}

          <ConfirmSheet
            visible={confirmCancel}
            title={t('orders.cancelConfirm')}
            confirmLabel={t('orders.cancelOrder')}
            cancelLabel={t('common.cancel')}
            destructive
            onConfirm={() => cancelMutation.mutate()}
            onCancel={() => setConfirmCancel(false)}
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
    marginBottom: spacing.md,
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
  timelineCard: {
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  timelineRow: { flexDirection: 'row', gap: 14 },
  timelineRail: { alignItems: 'center', width: 16 },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 3,
  },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineDotCurrent: {
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.secondary,
    width: 18,
    height: 18,
    borderRadius: 9,
    marginTop: 1,
  },
  timelineDotFuture: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  timelineBody: { flex: 1, paddingBottom: spacing.md },
  timelineLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  timelineLabelCurrent: { fontFamily: fontFamilies.bodyExtraBold, color: colors.primary },
  timelineLabelFuture: { color: colors.mutedForeground, opacity: 0.6 },
  timelineDate: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  infoCard: {
    padding: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 4,
  },
  infoLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: 4,
  },
  trackingNumber: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.h4,
    color: colors.primary,
    letterSpacing: 1,
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
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
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
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
  actionError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginBottom: spacing.sm,
  },
  cancelButton: { marginTop: spacing.xs },
});
