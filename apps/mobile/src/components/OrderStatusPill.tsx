import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { OrderStatus } from '@masalim/types';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';

interface PillSpec {
  labelKey: string;
  bg: string;
  fg: string;
}

/**
 * Status pill map from `Orders/01` — PENDING/PAID read as "Hazırlanıyor"
 * (dustyBlue), IN_PRODUCTION "Basılıyor" (lavender), SHIPPED "Kargoya Verildi"
 * (coral), DELIVERED "Teslim Edildi" (sage). CANCELLED/REFUNDED keep their
 * status labels with destructive/muted tints (the design omits them).
 * Tint backgrounds are the token hexes at design opacity.
 */
const PILLS: Record<OrderStatus, PillSpec> = {
  PENDING: {
    labelKey: 'orders.pills.preparing',
    bg: 'rgba(123,167,201,0.12)',
    fg: colors.dustyBlue,
  },
  PAID: {
    labelKey: 'orders.pills.preparing',
    bg: 'rgba(123,167,201,0.12)',
    fg: colors.dustyBlue,
  },
  IN_PRODUCTION: {
    labelKey: 'orders.pills.printing',
    bg: 'rgba(176,156,224,0.12)',
    fg: colors.lavender,
  },
  SHIPPED: {
    labelKey: 'orders.pills.shipped',
    bg: 'rgba(240,139,110,0.12)',
    fg: colors.coral,
  },
  DELIVERED: {
    labelKey: 'orders.pills.delivered',
    bg: 'rgba(141,184,154,0.12)',
    fg: colors.sage,
  },
  CANCELLED: {
    labelKey: 'orders.statuses.CANCELLED',
    bg: 'rgba(224,84,84,0.12)',
    fg: colors.destructive,
  },
  REFUNDED: {
    labelKey: 'orders.statuses.REFUNDED',
    bg: colors.muted,
    fg: colors.mutedForeground,
  },
};

/** Tinted order-status pill (design: Orders/01 + Orders/02). */
export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  const pill = PILLS[status];
  return (
    <View style={[styles.pill, { backgroundColor: pill.bg }]}>
      <Text style={[styles.text, { color: pill.fg }]}>{t(pill.labelKey)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  text: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xs },
});
