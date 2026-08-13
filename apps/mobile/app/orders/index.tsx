import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OrderStatus } from '@masalim/types';
import type { Order } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { EmptyState, ErrorState } from '../../src/components/states';

/** "649.00" → "₺649,00" (Turkish decimal comma + thousands dots). */
function formatPrice(amount: string): string {
  const [int = '0', frac = '00'] = amount.split('.');
  return `₺${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toDateString();
  }
}

/** Tinted chip per order status (tints derived from the token palette). */
const STATUS_CHIP: Record<OrderStatus, { bg: string; fg: string }> = {
  PENDING: { bg: 'rgba(255,217,125,0.3)', fg: colors.foreground },
  PAID: { bg: colors.secondary, fg: colors.primary },
  IN_PRODUCTION: { bg: 'rgba(240,139,110,0.15)', fg: colors.coral },
  SHIPPED: { bg: 'rgba(123,167,201,0.18)', fg: colors.dustyBlue },
  DELIVERED: { bg: 'rgba(141,184,154,0.18)', fg: colors.sage },
  CANCELLED: { bg: 'rgba(224,84,84,0.12)', fg: colors.destructive },
  REFUNDED: { bg: colors.muted, fg: colors.mutedForeground },
};

function StatusChip({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const chip = STATUS_CHIP[status];
  return (
    <View style={[styles.statusChip, { backgroundColor: chip.bg }]}>
      <Text style={[styles.statusChipText, { color: chip.fg }]}>
        {t(`orders.statuses.${status}`)}
      </Text>
    </View>
  );
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.bookTitle} ${order.orderNumber}`}
      style={({ pressed }) => [styles.card, shadows.cardSubtle, { opacity: pressed ? 0.88 : 1 }]}
    >
      <View style={styles.coverThumb}>
        {order.coverImageUrl != null ? (
          <Image
            source={{ uri: order.coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.coverEmoji}>📦</Text>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {order.bookTitle}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {`${order.orderNumber} · ${formatDate(order.createdAt)}`}
        </Text>
        <View style={styles.cardFooter}>
          <StatusChip status={order.status} />
          <Text style={styles.cardTotal}>{formatPrice(order.total)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Siparişlerim — order list with live statuses (§35). */
export default function OrdersList() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: () => api.orders.list() });

  const mapError = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (error instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await ordersQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
      <View style={styles.header}>
        <ScreenHeader title={t('orders.title')} />
      </View>

      {ordersQuery.isError ? (
        <ErrorState
          emoji="🌧️"
          title={mapError(ordersQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => void ordersQuery.refetch()}
        />
      ) : ordersQuery.data == null ? (
        <ActivityIndicator
          color={colors.primary}
          style={styles.loader}
          accessibilityLabel={t('common.loading')}
        />
      ) : (
        <FlatList
          data={ordersQuery.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => router.push(`/orders/${item.id}` as never)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              emoji="📦"
              title={t('orders.empty')}
              ctaLabel={t('common.back')}
              onCta={() => router.back()}
            />
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.pageX },
  loader: { marginTop: spacing.xxxl },
  listContent: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  card: {
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
    width: 52,
    height: 68,
    borderRadius: radius.sm,
    backgroundColor: colors.lavenderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverEmoji: { fontSize: 22 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  cardMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  statusChip: {
    borderRadius: radius.xs,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  statusChipText: { fontFamily: fontFamilies.bodyBold, fontSize: 10, letterSpacing: 0.4 },
  cardTotal: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
});
