import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { OrderStatus } from '@masalim/types';
import type { Order } from '@masalim/validation';
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
import { AppIcon } from '../../src/components/AppIcon';
import { api } from '../../src/lib/api';
import { Button } from '../../src/components/Button';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { OrderStatusPill } from '../../src/components/OrderStatusPill';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { CheckIcon } from '../../src/components/icons';
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

/**
 * The five tracking steps from `Orders/02`, mapped onto the happy-path
 * statuses. IN_PRODUCTION shows "Basıldı" as the active (in-progress) step; it
 * counts as done once SHIPPED is reached.
 */
const DESIGN_STEPS: { labelKey: string; status: OrderStatus }[] = [
  { labelKey: 'orders.steps.received', status: OrderStatus.PENDING },
  { labelKey: 'orders.steps.preparing', status: OrderStatus.PAID },
  { labelKey: 'orders.steps.printed', status: OrderStatus.IN_PRODUCTION },
  { labelKey: 'orders.steps.shipped', status: OrderStatus.SHIPPED },
  { labelKey: 'orders.steps.delivered', status: OrderStatus.DELIVERED },
];

interface TimelineStep {
  labelKey: string;
  at: string | null;
  state: 'done' | 'current' | 'future';
}

function buildTimeline(order: Order): TimelineStep[] {
  const chainIndex = DESIGN_STEPS.findIndex((step) => step.status === order.status);
  if (chainIndex >= 0) {
    // Happy path — the five design steps; real timestamps from the timeline.
    const reachedAt = new Map(order.timeline.map((entry) => [entry.status, entry.at]));
    return DESIGN_STEPS.map((step, index) => ({
      labelKey: step.labelKey,
      at: reachedAt.get(step.status) ?? null,
      state: index < chainIndex ? 'done' : index === chainIndex ? 'current' : 'future',
    }));
  }
  // Cancelled/refunded — keep the order's real history, last entry active.
  const lastCurrentIndex = order.timeline.reduce(
    (acc, entry, index) => (entry.status === order.status ? index : acc),
    -1,
  );
  return order.timeline.map((entry, index) => ({
    labelKey: `orders.statuses.${entry.status}`,
    at: entry.at,
    state: index === lastCurrentIndex ? 'current' : 'done',
  }));
}

function InfoRow({ label, value, selectable }: { label: string; value: string; selectable?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={styles.infoRowValue} selectable={selectable}>
        {value}
      </Text>
    </View>
  );
}

/** Sipariş takibi — status timeline, shipping info, totals, cancel (§35). */
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
        <ScreenHeader title={t('orders.trackingTitle')} />
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
  const trackingUrl = order?.trackingUrl ?? null;
  const hasShippingInfo =
    order != null &&
    (order.estimatedDeliveryDays != null ||
      order.carrier != null ||
      order.trackingNumber != null);

  return (
    <Screen>
      <ScreenHeader title={t('orders.trackingTitle')} />

      {order == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <>
          {/* Book card (design: Orders/02). */}
          <View style={[styles.productCard, shadows.cardSubtle]}>
            <View style={styles.coverThumb}>
              <LinearGradient
                colors={gradients.playerCover as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {order.coverImageUrl != null ? (
                <Image
                  source={{ uri: order.coverImageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.coverEmoji}>⭐</Text>
              )}
            </View>
            <View style={styles.productInfo}>
              <Text style={styles.productTitle} numberOfLines={2}>
                {`${order.bookTitle} × ${order.quantity}`}
              </Text>
              <Text style={styles.productMeta} numberOfLines={1}>
                {t('orders.orderNumberMeta', { number: order.orderNumber })}
              </Text>
              <Text style={styles.productMeta} numberOfLines={1}>
                {`${t(`checkout.sizes.${order.bookSize}`)} · ${t(`checkout.covers.${order.coverType}`)}`}
              </Text>
              <View style={styles.productPill}>
                <OrderStatusPill status={order.status} />
              </View>
            </View>
          </View>

          {/* Status timeline — the five design steps from the real history. */}
          <View style={styles.timelineCard}>
            <Text style={styles.cardLabel}>
              {t('orders.statusTimeline').toLocaleUpperCase('tr')}
            </Text>
            {buildTimeline(order).map((step, index, steps) => (
              <View key={`${step.labelKey}-${index}`} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineNode,
                      step.state === 'current'
                        ? styles.timelineNodeCurrent
                        : step.state === 'done'
                          ? styles.timelineNodeDone
                          : styles.timelineNodeFuture,
                    ]}
                  >
                    {step.state === 'done' ? (
                      <CheckIcon size={12} color={colors.sage} strokeWidth={3} />
                    ) : step.state === 'current' ? (
                      <View style={styles.timelineNodeInner} />
                    ) : null}
                  </View>
                  {index < steps.length - 1 ? (
                    <View
                      style={[
                        styles.timelineLine,
                        step.state !== 'future' && styles.timelineLineDone,
                      ]}
                    />
                  ) : null}
                </View>
                <View style={styles.timelineBody}>
                  <Text
                    style={[
                      styles.timelineLabel,
                      step.state === 'current' && styles.timelineLabelCurrent,
                      step.state === 'future' && styles.timelineLabelFuture,
                    ]}
                  >
                    {t(step.labelKey)}
                  </Text>
                  {step.at != null ? (
                    <Text style={styles.timelineDate}>{formatDateTime(step.at)}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          {/* Shipping info — only rows the backend actually knows (no fake dates). */}
          {hasShippingInfo ? (
            <View style={styles.infoCard}>
              <Text style={styles.cardLabel}>
                {t('orders.shippingInfo').toLocaleUpperCase('tr')}
              </Text>
              {order.estimatedDeliveryDays != null ? (
                <InfoRow
                  label={t('orders.estimatedDeliveryLabel')}
                  value={t('orders.deliveryDays', {
                    min: order.estimatedDeliveryDays.min,
                    max: order.estimatedDeliveryDays.max,
                  })}
                />
              ) : null}
              {order.carrier != null ? (
                <InfoRow label={t('orders.carrierLabel')} value={order.carrier} />
              ) : null}
              {order.trackingNumber != null ? (
                <InfoRow
                  label={t('orders.trackingNoLabel')}
                  value={order.trackingNumber}
                  selectable
                />
              ) : null}
            </View>
          ) : null}

          {trackingUrl != null ? (
            <Button
              label={t('orders.trackShipment')}
              variant="secondary"
              leading={<AppIcon name="order" size={18} color={colors.primary} />}
              onPress={() => void Linking.openURL(trackingUrl)}
              style={styles.trackButton}
            />
          ) : null}

          {/* Shipping address. */}
          {order.shippingAddress != null ? (
            <View style={styles.infoCard}>
              <Text style={styles.cardLabel}>
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
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  coverThumb: {
    width: 56,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverEmoji: { fontSize: 28 },
  productInfo: { flex: 1, gap: 2 },
  productTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  productMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  productPill: { marginTop: 4 },
  cardLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: spacing.md,
  },
  timelineCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  timelineRail: { alignItems: 'center', width: 28 },
  timelineNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineNodeDone: {
    backgroundColor: 'rgba(141,184,154,0.2)',
    borderColor: 'rgba(141,184,154,0.5)',
  },
  timelineNodeCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  timelineNodeFuture: { backgroundColor: colors.muted, borderColor: colors.border },
  timelineNodeInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primaryForeground,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    minHeight: 20,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  timelineLineDone: { backgroundColor: 'rgba(141,184,154,0.4)' },
  timelineBody: { flex: 1, paddingTop: 4, paddingBottom: spacing.md },
  timelineLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  timelineLabelCurrent: { fontFamily: fontFamilies.bodyExtraBold, color: colors.primary },
  timelineLabelFuture: { color: colors.mutedForeground },
  timelineDate: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  infoCard: {
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  infoRowLabel: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  infoRowValue: {
    flexShrink: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    textAlign: 'right',
  },
  trackButton: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
    marginBottom: spacing.md,
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
