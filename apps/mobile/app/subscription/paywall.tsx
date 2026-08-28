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
import { purchases, type Offering } from '../../src/lib/purchases';
import { Button } from '../../src/components/Button';
import { CloseIcon } from '../../src/components/icons';
import { ErrorState } from '../../src/components/states';

type PlanPeriod = Offering['period'];

/** `Subscription/01-Paywall` premium feature grid — icons from the final design. */
const FEATURES = [
  { key: 'stories', icon: '✨' },
  { key: 'parentVoices', icon: '🎙' },
  { key: 'illustrations', icon: '🎨' },
  { key: 'library', icon: '📚' },
  { key: 'audiobook', icon: '📖' },
  { key: 'print', icon: '🖨' },
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

/**
 * Parse a store-formatted price label ("₺129,99", "₺1.068,50", "$9.99") into a
 * number. The last separator counts as the decimal point only when followed by
 * at most two digits; every other separator is a thousands group.
 */
function parsePriceLabel(label: string): number | null {
  const cleaned = label.replace(/[^\d.,]/g, '');
  if (cleaned.length === 0) return null;
  const sep = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  let intPart = cleaned;
  let fracPart = '';
  if (sep >= 0) {
    const frac = cleaned.slice(sep + 1);
    if (frac.length > 0 && frac.length <= 2 && !frac.includes(',') && !frac.includes('.')) {
      intPart = cleaned.slice(0, sep);
      fracPart = frac;
    }
  }
  const digits = intPart.replace(/[.,]/g, '');
  if (digits.length === 0) return null;
  const value = Number(`${digits}.${fracPart.length > 0 ? fracPart : '0'}`);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Format a price the Turkish store way ("1.068,50") — no Intl dependency. */
function formatPrice(value: number): string {
  const fixed = value.toFixed(2);
  const intPart = fixed.slice(0, -3);
  const fracPart = fixed.slice(-2);
  return `${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fracPart}`;
}

/** Currency prefix/suffix of a store label (e.g. "₺" + "" or "" + " TL"). */
function currencyParts(label: string): { prefix: string; suffix: string } {
  const prefix = /^[^\d]*/.exec(label)?.[0] ?? '';
  const suffix = /[^\d]*$/.exec(label)?.[0] ?? '';
  return { prefix: prefix.trimStart(), suffix: suffix.trimEnd() };
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
 * Subscription paywall — `Subscription/01-Paywall` from the final design:
 * night-gradient hero with pulsing stars, premium feature grid, monthly/yearly
 * segmented toggle + plan cards with real store prices, gradient CTA.
 */
export default function Paywall() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Yearly preselected — the "En Popüler" plan.
  const [period, setPeriod] = useState<PlanPeriod>('yearly');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [done, setDone] = useState(false);
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

  const offeringsQuery = useQuery({
    queryKey: ['offerings'],
    queryFn: () => purchases.getOfferings(),
  });
  const offerings = offeringsQuery.data ?? [];
  const monthly = offerings.find((offering) => offering.period === 'monthly');
  const yearly = offerings.find((offering) => offering.period === 'yearly');

  const monthlyValue = monthly == null ? null : parsePriceLabel(monthly.priceLabel);
  const yearlyValue = yearly == null ? null : parsePriceLabel(yearly.priceLabel);

  // Discount % computed from real offering prices — never hardcoded.
  const discountPercent =
    monthlyValue != null && yearlyValue != null
      ? Math.round((1 - yearlyValue / (monthlyValue * 12)) * 100)
      : null;
  const showDiscount = discountPercent != null && discountPercent > 0;

  // Yearly card leads with the per-month equivalent when the label parses.
  const yearlyPerMonth =
    yearly != null && yearlyValue != null
      ? (() => {
          const { prefix, suffix } = currencyParts(yearly.priceLabel);
          return `${prefix}${formatPrice(yearlyValue / 12)}${suffix}`;
        })()
      : null;

  /** Headline price + small period suffix for a plan card / the CTA. */
  const priceParts = (plan: PlanPeriod): { price: string; suffix: string } | null => {
    if (plan === 'monthly') {
      return monthly == null
        ? null
        : { price: monthly.priceLabel, suffix: t('subscription.perMonth') };
    }
    if (yearly == null) return null;
    return yearlyPerMonth != null
      ? { price: yearlyPerMonth, suffix: t('subscription.perMonth') }
      : { price: yearly.priceLabel, suffix: t('subscription.perYear') };
  };

  const selectedParts = priceParts(period);
  const selectedProductId: Offering['productId'] =
    (period === 'yearly' ? yearly?.productId : monthly?.productId) ??
    (period === 'yearly' ? 'masalim_premium_yearly' : 'masalim_premium_monthly');

  const mapError = (err: unknown): string => {
    if (err instanceof ApiError) {
      return t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (err instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  /**
   * Offering.priceLabel arrives store-formatted (mock: '₺129,99'). The i18n
   * keys already carry the ₺ symbol, so strip a leading ₺ before interpolating;
   * a non-₺ store locale (RevenueCat) shows the label as-is.
   */
  const yearlyTotalLine = (offering: Offering): string => {
    if (offering.priceLabel.startsWith('₺')) {
      return t('subscription.pricePerYear', { price: offering.priceLabel.slice(1).trim() });
    }
    return offering.priceLabel;
  };

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      queryClient.invalidateQueries({ queryKey: ['subscription'] }),
    ]);
  };

  // Success beat → back to where the user came from.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => router.back(), 900);
    return () => clearTimeout(timer);
  }, [done]);

  const onSubscribe = async () => {
    if (busy || restoring) return;
    setError(null);
    setRestoreNote(null);
    setBusy(true);
    try {
      const result = await purchases.purchase(selectedProductId);
      if (result.cancelled === true) return; // user backed out — no-op
      if (!result.success) {
        setError(t('errors.GENERIC'));
        return;
      }
      await invalidateAll();
      setDone(true);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (busy || restoring) return;
    setError(null);
    setRestoreNote(null);
    setRestoring(true);
    try {
      const result = await purchases.restore();
      await invalidateAll();
      if (result.success) {
        setDone(true);
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
    <View style={styles.content}>
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

  const renderFeatures = () => (
    <View style={styles.featuresCard}>
      <Text style={styles.featuresLabel}>
        {t('subscription.featuresLabel').toLocaleUpperCase('tr-TR')}
      </Text>
      <View style={styles.featuresGrid}>
        {FEATURES.map((feature) => (
          <View key={feature.key} style={styles.featureItem}>
            <Text style={styles.featureIcon}>{feature.icon}</Text>
            <Text style={styles.featureText}>{t(`subscription.features.${feature.key}`)}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderToggle = () => (
    <View style={styles.toggleTrack}>
      {(['monthly', 'yearly'] as const).map((plan) => {
        const active = period === plan;
        return (
          <Pressable
            key={plan}
            onPress={() => setPeriod(plan)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(`subscription.${plan}`)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {t(`subscription.${plan}`)}
            </Text>
            {plan === 'yearly' && showDiscount ? (
              <View style={styles.discountChip}>
                <Text style={styles.discountText}>
                  {t('subscription.discountBadge', { percent: discountPercent })}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const renderPlanCard = (plan: PlanPeriod) => {
    const offering = plan === 'monthly' ? monthly : yearly;
    if (offering == null) return null;
    const parts = priceParts(plan);
    const selected = period === plan;
    return (
      <Pressable
        key={plan}
        onPress={() => setPeriod(plan)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={t(plan === 'monthly' ? 'subscription.monthlyPlan' : 'subscription.yearlyPlan')}
        style={[styles.planCard, selected ? styles.planCardSelected : styles.planCardIdle]}
      >
        {plan === 'yearly' ? (
          <View style={styles.popularBadge}>
            <Text style={styles.popularBadgeText}>{t('subscription.mostPopular')}</Text>
          </View>
        ) : null}
        <View style={styles.planRow}>
          <View style={styles.planTextBlock}>
            <Text style={styles.planName}>
              {t(plan === 'monthly' ? 'subscription.monthlyPlan' : 'subscription.yearlyPlan')}
            </Text>
            <Text style={styles.planDesc}>
              {plan === 'monthly' ? t('subscription.cancelAnytime') : yearlyTotalLine(offering)}
            </Text>
          </View>
          {parts != null ? (
            <View style={styles.priceRow}>
              <Text style={[styles.planPrice, selected && styles.planPriceSelected]}>
                {parts.price}
              </Text>
              <Text style={styles.planPeriod}>{parts.suffix}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
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
    ) : offeringsQuery.data == null ? (
      <ActivityIndicator
        color={colors.primary}
        style={styles.loader}
        accessibilityLabel={t('common.loading')}
      />
    ) : (
      <View style={styles.content}>
        {renderFeatures()}
        {renderToggle()}

        {/* Monthly toggle shows the monthly card only; yearly shows both. */}
        <View style={styles.planList}>
          {renderPlanCard('monthly')}
          {period === 'yearly' ? renderPlanCard('yearly') : null}
        </View>

        {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
        {restoreNote != null ? <Text style={styles.restoreNote}>{restoreNote}</Text> : null}

        {done ? (
          <Animated.Text entering={FadeInUp.duration(250)} style={styles.doneText}>
            {`🎉 ${t('profile.premiumMember')}`}
          </Animated.Text>
        ) : (
          <>
            <Button
              label={
                selectedParts != null
                  ? t('subscription.startCta', {
                      price: `${selectedParts.price}${selectedParts.suffix}`,
                    })
                  : t('subscription.subscribe')
              }
              onPress={() => void onSubscribe()}
              loading={busy}
            />
            <Pressable
              onPress={() => void onRestore()}
              disabled={busy || restoring}
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
            <Text style={styles.legal}>{t('subscription.legal')}</Text>
          </>
        )}
      </View>
    );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + spacing.xl }}
      showsVerticalScrollIndicator={false}
    >
      {renderHero()}
      {isPremium && !done ? renderActive() : renderPurchase()}
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

  /* Feature grid card */
  featuresCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: 18,
    marginBottom: spacing.lg,
  },
  featuresLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: 0.72,
    marginBottom: 14,
  },
  featuresGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureItem: { width: '47%', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  featureIcon: { fontSize: 16 },
  featureText: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    lineHeight: 18,
  },

  /* Plan toggle */
  toggleTrack: {
    flexDirection: 'row',
    backgroundColor: colors.muted,
    borderRadius: radius.base,
    padding: 4,
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.chip,
  },
  segmentActive: { backgroundColor: colors.card, ...shadows.cardSubtle },
  segmentLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  segmentLabelActive: { color: colors.foreground },
  /* rgba stops derive from colors.sage (#8DB89A). */
  discountChip: {
    backgroundColor: 'rgba(141,184,154,0.12)',
    borderRadius: radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discountText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxs,
    color: colors.sage,
  },

  /* Plan cards */
  planList: { gap: 10, marginBottom: spacing.lg },
  planCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 2,
  },
  planCardSelected: { borderColor: colors.primary },
  planCardIdle: { borderColor: colors.border },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.md,
    backgroundColor: colors.coral,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  popularBadgeText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxs,
    color: colors.primaryForeground,
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
  },
  priceRow: { flexDirection: 'row', alignItems: 'baseline' },
  planPrice: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h1,
    color: colors.foreground,
  },
  planPriceSelected: { color: colors.primary },
  planPeriod: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
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
    marginTop: 4,
  },

  /* Active premium */
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
