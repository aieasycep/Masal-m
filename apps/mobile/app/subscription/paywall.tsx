import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { SubscriptionPlan } from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
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
import { purchases } from '../../src/lib/purchases';
import { Button } from '../../src/components/Button';
import { CloseIcon } from '../../src/components/icons';
import { ErrorState } from '../../src/components/states';

/**
 * PREMIUM vs ÜCRETSİZ comparison rows (owner's launch decision, Sep 2026).
 * `both`: included on the free plan too (paid with credits there).
 */
const COMPARE_ROWS = [
  { key: 'storyFull', icon: '📖', both: true },
  { key: 'monthlyCredits', icon: '🎟', both: false },
  { key: 'voiceClone', icon: '🎙', both: false },
  { key: 'premiumVoices', icon: '🌟', both: false },
  { key: 'hdBook', icon: '📚', both: false },
] as const;

/** Fixed star dots of the paywall hero (positions from the final design). */
const HERO_STARS: ReadonlyArray<{ x: DimensionValue; y: DimensionValue; s: number }> = [
  { x: '10%', y: '20%', s: 6 },
  { x: '80%', y: '10%', s: 4 },
  { x: '50%', y: '60%', s: 5 },
  { x: '30%', y: '80%', s: 3 },
  { x: '90%', y: '70%', s: 6 },
];

/** One softly pulsing hero star (design: `pulse-soft 2s`, staggered 0.4s). */
function HeroStar({ star, index }: { star: (typeof HERO_STARS)[number]; index: number }) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withDelay(
      index * 400,
      withRepeat(
        withTiming(0.35, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [index, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: 0.6 * pulse.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.heroStar,
        {
          left: star.x,
          top: star.y,
          width: star.s,
          height: star.s,
          borderRadius: star.s / 2,
        },
        pulseStyle,
      ]}
    />
  );
}

/** "999.99" (server decimal string) → "₺999,99" the Turkish store way. */
function formatTRY(priceTRY: string): string {
  const value = Number(priceTRY);
  if (!Number.isFinite(value)) return `₺${priceTRY}`;
  const fixed = value.toFixed(2);
  const intPart = fixed.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₺${intPart},${fixed.slice(-2)}`;
}

function formatExpiryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toDateString();
  }
}

/**
 * Subscription paywall — night-gradient hero, a PREMIUM vs ÜCRETSİZ comparison
 * table (launch model: monthly subscription with a 30-credit quota), and the
 * credit packs available to THIS user (server-priced: free tier ₺50/kr,
 * members ₺40/kr). Premium members land on their active card + member packs.
 */
export default function Paywall() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState<'premium' | 'credits' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const isPremium = entitlementsQuery.data?.plan === SubscriptionPlan.PREMIUM;

  const subscriptionQuery = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.subscription.get(),
    enabled: isPremium,
  });

  // Server-config offerings: subscription price + the packs for this user's
  // plan — sticker prices can change on the server without an app update.
  const offeringsQuery = useQuery({
    queryKey: ['offerings', isPremium],
    queryFn: () => api.subscription.offerings(),
  });
  const offerings = offeringsQuery.data ?? null;

  const mapError = (err: unknown): string => {
    if (err instanceof ApiError) {
      return t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (err instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['subscription'] }),
      queryClient.invalidateQueries({ queryKey: ['offerings'] }),
    ]);
  };

  // Subscription success beat → back to where the user came from. Credit
  // purchases stay on the screen (the balance just grew, they may buy again).
  useEffect(() => {
    if (done !== 'premium') return;
    const timer = setTimeout(() => router.back(), 900);
    return () => clearTimeout(timer);
  }, [done]);

  const buy = async (productId: string, kind: 'premium' | 'credits') => {
    if (busyProduct != null || restoring) return;
    setError(null);
    setRestoreNote(null);
    setDone(null);
    setBusyProduct(productId);
    try {
      const result = await purchases.purchase(productId);
      if (result.cancelled === true) return; // user backed out — no-op
      if (!result.success) {
        setError(t('errors.GENERIC'));
        return;
      }
      await invalidateAll();
      setDone(kind);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusyProduct(null);
    }
  };

  const onRestore = async () => {
    if (busyProduct != null || restoring) return;
    setError(null);
    setRestoreNote(null);
    setRestoring(true);
    try {
      const result = await purchases.restore();
      await invalidateAll();
      if (result.success) {
        setDone('premium');
      } else {
        // Nothing to restore — the account stays on the free plan.
        setRestoreNote(t('profile.menu.subscriptionFree'));
      }
    } catch (err) {
      setError(mapError(err));
    } finally {
      setRestoring(false);
    }
  };

  const expiresAt = subscriptionQuery.data?.expiresAt ?? null;

  // Night-gradient hero: 160deg purpleDeep→primary, star dots, close circle.
  const renderHero = () => (
    <LinearGradient
      colors={[colors.purpleDeep, colors.primary]}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 12 }]}
    >
      {HERO_STARS.map((star, index) => (
        <HeroStar key={index} star={star} index={index} />
      ))}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        hitSlop={8}
        style={({ pressed }) => [
          styles.closeButton,
          { top: Math.max(insets.top, 20) + 12, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <CloseIcon />
      </Pressable>
      <View style={styles.eyebrowRow}>
        <Text style={styles.eyebrowSparkle}>✨</Text>
        <Text style={styles.eyebrow}>{t('subscription.title').toLocaleUpperCase('tr-TR')}</Text>
      </View>
      <Text style={styles.heroTitle} accessibilityRole="header">
        {t('subscription.heroTitle')}
      </Text>
      <Text style={styles.heroSubtitle}>{t('subscription.heroSubtitle')}</Text>
    </LinearGradient>
  );

  const renderActive = () => (
    <View style={styles.activeBlock}>
      <LinearGradient
        colors={[colors.primary, colors.purpleSoft]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.activeCard, shadows.hero]}
      >
        <Text style={styles.activeCrown}>👑</Text>
        <Text style={styles.activePlan}>{t('subscription.premiumPlan')}</Text>
        {expiresAt != null ? (
          <Text style={styles.activeExpiry}>
            {t('profile.menu.subscriptionPremium', { date: formatExpiryDate(expiresAt) })}
          </Text>
        ) : (
          <Text style={styles.activeExpiry}>{t('profile.menu.subscriptionPremiumNoDate')}</Text>
        )}
      </LinearGradient>
      {/* Store subscriptions are managed in the store — a note, not a CTA. */}
      <Text style={styles.manageNote}>{t('subscription.manage')}</Text>
    </View>
  );

  /** PREMIUM vs ÜCRETSİZ checkmark table (inspired by the owner's reference). */
  const renderComparison = () => (
    <View style={styles.compareCard}>
      <View style={styles.compareHeader}>
        <Text style={[styles.compareHeadLabel, styles.compareFeatureCol]}>
          {t('subscription.compareTitle').toLocaleUpperCase('tr-TR')}
        </Text>
        <Text style={[styles.compareHeadLabel, styles.compareCol, styles.comparePremiumHead]}>
          {t('subscription.comparePremium')}
        </Text>
        <Text style={[styles.compareHeadLabel, styles.compareCol]}>
          {t('subscription.compareFree')}
        </Text>
      </View>
      {COMPARE_ROWS.map((row, index) => (
        <View
          key={row.key}
          style={[styles.compareRow, index < COMPARE_ROWS.length - 1 && styles.compareRowBorder]}
        >
          <View style={[styles.compareFeatureCol, styles.compareFeatureCell]}>
            <Text style={styles.compareIcon}>{row.icon}</Text>
            <Text style={styles.compareFeatureText}>
              {t(`subscription.compareRows.${row.key}`, {
                count: offerings?.subscription.monthlyCredits ?? 30,
              })}
            </Text>
          </View>
          <Text style={[styles.compareCol, styles.compareCheck]}>✓</Text>
          <Text style={[styles.compareCol, row.both ? styles.compareCheck : styles.compareDash]}>
            {row.both ? '✓' : '—'}
          </Text>
        </View>
      ))}
      <Text style={styles.compareFootnote}>{t('subscription.compareFootnote')}</Text>
    </View>
  );

  /** Credit packs for THIS user's tier — every card is its own buy button. */
  const renderPacks = () => {
    if (offerings == null || offerings.packs.length === 0) return null;
    return (
      <View style={styles.packsBlock}>
        <Text style={styles.packsTitle}>
          {t('subscription.packsTitle').toLocaleUpperCase('tr-TR')}
        </Text>
        <Text style={styles.packsSub}>
          {t(isPremium ? 'subscription.packsSubPremium' : 'subscription.packsSubFree')}
        </Text>
        <View style={styles.packList}>
          {offerings.packs.map((pack) => (
            <View key={pack.productId} style={styles.packCard}>
              <Text style={styles.packEmoji}>🎟</Text>
              <View style={styles.packTextBlock}>
                <Text style={styles.packCredits}>
                  {t('subscription.packCredits', { count: pack.credits })}
                </Text>
                <Text style={styles.packPrice}>{formatTRY(pack.priceTRY)}</Text>
              </View>
              <Button
                label={t('subscription.buyPack')}
                compact
                loading={busyProduct === pack.productId}
                onPress={() => void buy(pack.productId, 'credits')}
              />
            </View>
          ))}
        </View>
        {done === 'credits' ? (
          <Animated.Text entering={FadeInUp.duration(250)} style={styles.doneText}>
            {`🎉 ${t('subscription.creditsAdded')}`}
          </Animated.Text>
        ) : null}
      </View>
    );
  };

  const renderPurchase = () =>
    offeringsQuery.isError ? (
      <View style={styles.content}>
        <ErrorState
          emoji="🌧️"
          title={mapError(offeringsQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => void offeringsQuery.refetch()}
        />
      </View>
    ) : offerings == null ? (
      <ActivityIndicator
        color={colors.primary}
        style={styles.loader}
        accessibilityLabel={t('common.loading')}
      />
    ) : (
      <View style={styles.content}>
        {renderComparison()}

        {/* Single monthly plan (launch model — yearly comes after usage data). */}
        <View style={styles.planCard}>
          <View style={styles.planRow}>
            <View style={styles.planTextBlock}>
              <Text style={styles.planName}>{t('subscription.monthlyPlan')}</Text>
              <Text style={styles.planDesc}>
                {t('subscription.monthlyPlanDesc', {
                  count: offerings.subscription.monthlyCredits,
                })}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.planPrice}>{formatTRY(offerings.subscription.priceTRY)}</Text>
              <Text style={styles.planPeriod}>{t('subscription.perMonth')}</Text>
            </View>
          </View>
        </View>

        {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
        {restoreNote != null ? <Text style={styles.restoreNote}>{restoreNote}</Text> : null}

        {done === 'premium' ? (
          <Animated.Text entering={FadeInUp.duration(250)} style={styles.doneText}>
            {`🎉 ${t('profile.premiumMember')}`}
          </Animated.Text>
        ) : (
          <>
            <Button
              label={t('subscription.startCta', {
                price: `${formatTRY(offerings.subscription.priceTRY)}${t('subscription.perMonth')}`,
              })}
              onPress={() => void buy(offerings.subscription.productId, 'premium')}
              loading={busyProduct === offerings.subscription.productId}
            />
            <Pressable
              onPress={() => void onRestore()}
              disabled={busyProduct != null || restoring}
              accessibilityRole="button"
              accessibilityLabel={t('subscription.restore')}
              style={({ pressed }) => [styles.restoreLink, { opacity: pressed ? 0.7 : 1 }]}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.restoreLinkText}>{t('subscription.restore')}</Text>
              )}
            </Pressable>
          </>
        )}

        {renderPacks()}
        <Pressable
          onPress={() => router.navigate('/subscription/quota' as never)}
          accessibilityRole="button"
          accessibilityLabel={t('subscription.viewCredits')}
          style={({ pressed }) => [styles.restoreLink, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.restoreLinkText}>{t('subscription.viewCredits')}</Text>
        </Pressable>
        <Text style={styles.legal}>{t('subscription.legal')}</Text>
      </View>
    );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {renderHero()}
      {isPremium && done !== 'premium' ? (
        <View style={styles.content}>
          {renderActive()}
          {renderPacks()}
        </View>
      ) : (
        renderPurchase()
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xxl },

  /* Hero */
  hero: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.xxl,
    overflow: 'hidden',
  },
  heroStar: { position: 'absolute', backgroundColor: colors.primaryForeground },
  closeButton: {
    position: 'absolute',
    right: spacing.pageX,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  eyebrowSparkle: { fontSize: 24 },
  eyebrow: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: premiumGold.bright,
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayLg,
    color: colors.primaryForeground,
    lineHeight: 36,
    marginBottom: 10,
    paddingRight: 44,
  },
  heroSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
  },

  content: { paddingHorizontal: spacing.pageX, paddingTop: spacing.xl },

  /* Comparison table */
  compareCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  compareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  compareHeadLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    letterSpacing: 0.6,
  },
  comparePremiumHead: { color: colors.primary },
  compareFeatureCol: { flex: 1 },
  compareCol: { width: 64, textAlign: 'center' },
  compareRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  compareRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  compareFeatureCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  compareIcon: { fontSize: 15 },
  compareFeatureText: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    lineHeight: 18,
  },
  compareCheck: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.lg,
    color: colors.sageText,
  },
  compareDash: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
  },
  compareFootnote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    paddingTop: 10,
    lineHeight: 16,
  },

  /* Plan card */
  planCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
  },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planTextBlock: { flexShrink: 1, paddingRight: spacing.sm },
  planName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    marginBottom: 2,
  },
  planDesc: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  planPrice: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h2,
    color: colors.primary,
  },
  planPeriod: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },

  /* Credit packs */
  packsBlock: { marginTop: spacing.xl },
  packsTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: 0.72,
    marginBottom: 4,
  },
  packsSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  packList: { gap: 10 },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  packEmoji: { fontSize: 22 },
  packTextBlock: { flex: 1 },
  packCredits: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  packPrice: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },

  errorText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  restoreNote: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  doneText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: 18,
  },
  restoreLink: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: 4 },
  restoreLinkText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },
  legal: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.lg,
  },

  /* Active premium */
  activeBlock: { marginBottom: spacing.sm },
  activeCard: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    gap: 6,
    marginBottom: spacing.md,
  },
  activeCrown: { fontSize: 36 },
  activePlan: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.primaryForeground,
  },
  activeExpiry: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.85)',
  },
  manageNote: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
