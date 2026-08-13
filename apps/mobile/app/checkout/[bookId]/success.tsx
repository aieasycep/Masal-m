import { useEffect } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { colors, fontFamilies, fontSizes, letterSpacing, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { Button } from '../../../src/components/Button';
import { Screen } from '../../../src/components/Screen';

const CONFETTI_COLORS = [
  colors.primary,
  colors.gold,
  colors.coral,
  colors.sage,
  colors.dustyBlue,
  colors.lavender,
] as const;
const CONFETTI_COUNT = 18;

/** One falling confetti dot — deterministic per index (no re-render jitter). */
function ConfettiDot({ index, height }: { index: number; height: number }) {
  const fall = useSharedValue(0);
  useEffect(() => {
    fall.value = withDelay(
      (index % 6) * 180,
      withTiming(1, { duration: 2200 + (index % 5) * 300, easing: Easing.out(Easing.quad) }),
    );
  }, [fall, index]);

  const left = ((index * 53) % 100) / 100;
  const size = 8 + (index % 3) * 3;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? colors.primary;
  const drift = ((index % 4) - 1.5) * 24;

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: fall.value * height * 0.6 },
      { translateX: fall.value * drift },
      { rotate: `${fall.value * (180 + (index % 4) * 90)}deg` },
    ],
    opacity: 1 - fall.value * fall.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        { left: `${left * 100}%`, width: size, height: size, backgroundColor: color },
        index % 2 === 0 ? styles.confettiRound : null,
        style,
      ]}
    />
  );
}

/** Checkout step 4 — payment succeeded; hand off to order tracking (§34). */
export default function CheckoutSuccess() {
  const { t } = useTranslation();
  const { orderId, name } = useLocalSearchParams<{ orderId: string; name?: string }>();
  const { height } = useWindowDimensions();

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.orders.get(orderId as string),
    enabled: orderId != null && orderId.length > 0,
  });
  const orderNumber = orderQuery.data?.orderNumber;

  const title =
    name != null && name.length > 0
      ? t('checkout.successTitle', { name })
      : t('checkout.successTitleGeneric');

  return (
    <Screen scroll={false}>
      {Array.from({ length: CONFETTI_COUNT }, (_, index) => (
        <ConfettiDot key={index} index={index} height={height} />
      ))}

      <View style={styles.center}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {orderNumber != null ? (
          <View style={styles.orderNumberBlock}>
            <Text style={styles.orderNumberLabel}>
              {t('checkout.orderNumber').toLocaleUpperCase('tr')}
            </Text>
            <Text style={styles.orderNumber} selectable>
              {orderNumber}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.buttons}>
        <Button
          label={t('checkout.trackOrder')}
          onPress={() => router.replace(`/orders/${orderId}` as never)}
        />
        <Button
          label={t('tabs.home')}
          variant="tertiary"
          compact
          onPress={() => router.replace('/(tabs)/home')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confetti: {
    position: 'absolute',
    top: 40,
    borderRadius: 2,
  },
  confettiRound: { borderRadius: 999 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 56, marginBottom: spacing.lg },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    lineHeight: 32,
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  orderNumberBlock: { alignItems: 'center', gap: 4 },
  orderNumberLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
  },
  orderNumber: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.h4,
    color: colors.primary,
    letterSpacing: 1,
  },
  buttons: { gap: spacing.xs },
});
