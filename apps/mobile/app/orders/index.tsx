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
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Order } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, gradients, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { OrderStatusPill } from '../../src/components/OrderStatusPill';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ChevronRightIcon } from '../../src/components/icons';
import { EmptyState, ErrorState } from '../../src/components/states';

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toDateString();
  }
}

/** Order card per `Orders/01` — 56×72 cover, Fraunces title, meta, status pill. */
function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${order.bookTitle} ${order.orderNumber}`}
      style={({ pressed }) => [styles.card, shadows.cardSubtle, { opacity: pressed ? 0.88 : 1 }]}
    >
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
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {order.bookTitle}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {`#${order.orderNumber} · ${formatDate(order.createdAt)}`}
        </Text>
        <OrderStatusPill status={order.status} />
      </View>
      <ChevronRightIcon size={14} color={colors.mutedForeground} />
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
              title={t('orders.emptyTitle')}
              body={t('orders.emptyBody')}
              ctaLabel={t('orders.emptyCta')}
              onCta={() => router.replace('/(tabs)/library')}
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
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coverThumb: {
    width: 56,
    height: 72,
    // Design spec: r10 cover thumb (between radius.sm and radius.chip).
    borderRadius: 10,
    backgroundColor: colors.purpleDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverEmoji: { fontSize: 28 },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  cardMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
});
