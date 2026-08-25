import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  colors,
  fontFamilies,
  fontSizes,
  premiumGold,
  radius,
  shadows,
  spacing,
} from '@masalim/ui';
import { api } from '../../src/lib/api';
import { CloseIcon } from '../../src/components/icons';

/** The three headline premium perks shown on the quota screen (design order). */
const QUOTA_FEATURES = [
  { key: 'stories', icon: '✨' },
  { key: 'parentVoices', icon: '🎙' },
  { key: 'illustrations', icon: '🎨' },
] as const;

/**
 * `Subscription/02-QuotaReached` — full-screen stop when the monthly story
 * quota is used up: rocket circle, real limit from entitlements, top premium
 * perks and a coral-gradient CTA into the paywall.
 */
export default function QuotaReached() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const limit = entitlementsQuery.data?.quotas.story_monthly_limit.limit ?? null;

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: Math.max(insets.top, 20) + 8,
          paddingBottom: Math.max(insets.bottom, 24) + spacing.xl,
        },
      ]}
    >
      {/* Close-only header */}
      <View style={styles.closeRow}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={8}
          style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <CloseIcon color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* rgba stops derive from colors.coral (#F08B6E). */}
        <View style={styles.rocketCircle}>
          <Text style={styles.rocketEmoji}>🚀</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            {limit != null
              ? t('subscription.quotaTitle', { limit })
              : t('quotaBanner.exhaustedTitle')}
          </Text>
          <Text style={styles.subtitle}>{t('subscription.quotaSubtitle')}</Text>
        </View>
        <View style={styles.featureCard}>
          {QUOTA_FEATURES.map((feature) => (
            <View key={feature.key} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <Text style={styles.featureText}>{t(`subscription.features.${feature.key}`)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push('/subscription/paywall' as never)}
          accessibilityRole="button"
          accessibilityLabel={t('quotaBanner.explorePremium')}
          style={({ pressed }) => [
            styles.ctaShadow,
            { transform: [{ scale: pressed ? 0.99 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={[premiumGold.mid, colors.coral]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cta}
          >
            <Text style={styles.ctaLabel}>{t('quotaBanner.explorePremium')}</Text>
          </LinearGradient>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('subscription.later')}
          style={({ pressed }) => [styles.laterButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.laterLabel}>{t('subscription.later')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  closeRow: {
    paddingHorizontal: spacing.pageX,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.pageXWide,
    gap: spacing.lg,
  },
  rocketCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(240,139,110,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(240,139,110,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rocketEmoji: { fontSize: 42 },
  titleBlock: { alignItems: 'center' },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.display,
    color: colors.foreground,
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 24,
  },
  featureCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 8 },
  featureIcon: { fontSize: 18 },
  featureText: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  footer: { paddingHorizontal: spacing.pageX, gap: 10 },
  ctaShadow: { borderRadius: radius.lg, ...shadows.recordButton },
  cta: {
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.primaryForeground,
  },
  laterButton: { alignItems: 'center', paddingVertical: 14 },
  laterLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
});
