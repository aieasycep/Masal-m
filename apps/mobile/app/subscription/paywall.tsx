import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { PLAN_ENTITLEMENTS, SubscriptionPlan } from '@masalim/types';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { purchases, type Offering } from '../../src/lib/purchases';
import { Badge } from '../../src/components/Badge';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SelectableCard } from '../../src/components/SelectableCard';
import { ErrorState } from '../../src/components/states';

/**
 * Free-vs-premium comparison rows (§36). Quota rows show the real monthly
 * limits from PLAN_ENTITLEMENTS; boolean features render ✓ / –.
 */
const FEATURE_ROWS: { key: string; free: string; premium: string }[] = [
  {
    key: 'stories',
    free: String(PLAN_ENTITLEMENTS.FREE.storyMonthlyLimit),
    premium: String(PLAN_ENTITLEMENTS.PREMIUM.storyMonthlyLimit),
  },
  { key: 'parentVoices', free: '–', premium: '✓' },
  { key: 'premiumVoices', free: '–', premium: '✓' },
  {
    key: 'illustrations',
    free: String(PLAN_ENTITLEMENTS.FREE.illustrationMonthlyLimit),
    premium: String(PLAN_ENTITLEMENTS.PREMIUM.illustrationMonthlyLimit),
  },
  { key: 'hdExport', free: '–', premium: '✓' },
];

function formatExpiryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toDateString();
  }
}

/** Subscription paywall (§36) — crown hero, plan toggle, comparison matrix, CTA. */
export default function Paywall() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Yearly preselected — the "En Avantajlı" plan.
  const [selected, setSelected] = useState<Offering['productId']>('masalim_premium_yearly');
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
  const priceLine = (offering: Offering): string => {
    const key =
      offering.period === 'monthly' ? 'subscription.pricePerMonth' : 'subscription.pricePerYear';
    if (offering.priceLabel.startsWith('₺')) {
      return t(key, { price: offering.priceLabel.slice(1).trim() });
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
      const result = await purchases.purchase(selected);
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

  const renderActive = () => (
    <>
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
    </>
  );

  const renderPlans = () => (
    <View style={styles.planRow}>
      {monthly != null ? (
        <SelectableCard
          glow
          selected={selected === monthly.productId}
          onPress={() => setSelected(monthly.productId)}
          showCheck={false}
          style={styles.planCard}
          accessibilityLabel={t('subscription.monthly')}
        >
          <View style={styles.planCardBody}>
            <Text style={styles.planName}>{t('subscription.monthly')}</Text>
            <Text style={styles.planPrice}>{priceLine(monthly)}</Text>
          </View>
        </SelectableCard>
      ) : null}
      {yearly != null ? (
        <SelectableCard
          glow
          selected={selected === yearly.productId}
          onPress={() => setSelected(yearly.productId)}
          showCheck={false}
          style={styles.planCard}
          accessibilityLabel={t('subscription.yearly')}
        >
          <View style={styles.planCardBody}>
            <Badge label={t('subscription.bestValue')} variant="premium" />
            <Text style={styles.planName}>{t('subscription.yearly')}</Text>
            <Text style={styles.planPrice}>{priceLine(yearly)}</Text>
          </View>
        </SelectableCard>
      ) : null}
    </View>
  );

  const renderMatrix = () => (
    <View style={styles.matrixCard}>
      <View style={[styles.matrixRow, styles.matrixRowBorder]}>
        <View style={styles.matrixLabelCell} />
        <Text style={[styles.matrixHeader, styles.matrixValueCell]}>
          {t('subscription.freePlan')}
        </Text>
        <Text style={[styles.matrixHeader, styles.matrixHeaderPremium, styles.matrixValueCell]}>
          {t('subscription.premiumPlan')}
        </Text>
      </View>
      {FEATURE_ROWS.map((row, index) => (
        <View
          key={row.key}
          style={[styles.matrixRow, index < FEATURE_ROWS.length - 1 && styles.matrixRowBorder]}
        >
          <Text style={[styles.matrixLabel, styles.matrixLabelCell]}>
            {t(`subscription.features.${row.key}`)}
          </Text>
          <Text
            style={[
              styles.matrixValue,
              row.free === '–' && styles.matrixValueMuted,
              styles.matrixValueCell,
            ]}
          >
            {row.free}
          </Text>
          <Text style={[styles.matrixValue, styles.matrixValuePremium, styles.matrixValueCell]}>
            {row.premium}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderPurchase = () =>
    offeringsQuery.isError ? (
      <ErrorState
        emoji="🌧️"
        title={mapError(offeringsQuery.error)}
        ctaLabel={t('common.retry')}
        onCta={() => void offeringsQuery.refetch()}
      />
    ) : offeringsQuery.data == null ? (
      <ActivityIndicator
        color={colors.primary}
        style={styles.loader}
        accessibilityLabel={t('common.loading')}
      />
    ) : (
      <>
        {renderPlans()}
        {renderMatrix()}

        {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
        {restoreNote != null ? <Text style={styles.restoreNote}>{restoreNote}</Text> : null}

        {done ? (
          <Animated.Text entering={FadeInUp.duration(250)} style={styles.doneText}>
            {`🎉 ${t('profile.premiumMember')}`}
          </Animated.Text>
        ) : (
          <>
            <Button label={t('subscription.subscribe')} onPress={() => void onSubscribe()} loading={busy} />
            <Pressable
              onPress={() => void onRestore()}
              disabled={busy || restoring}
              accessibilityRole="button"
              accessibilityLabel={t('subscription.restore')}
              style={({ pressed }) => [styles.restoreLink, { opacity: pressed ? 0.7 : 1 }]}
            >
              {restoring ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Text style={styles.restoreLinkText}>{t('subscription.restore')}</Text>
              )}
            </Pressable>
          </>
        )}
      </>
    );

  return (
    <Screen>
      {/* Back-only header — the crown hero carries the title. */}
      <ScreenHeader />

      {/* Crown hero */}
      <View style={styles.hero}>
        <View style={styles.crownCircle}>
          <Text style={styles.crownEmoji}>👑</Text>
        </View>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {t('subscription.title')}
        </Text>
        <Text style={styles.heroSubtitle}>{t('subscription.subtitle')}</Text>
      </View>

      {isPremium && !done ? renderActive() : renderPurchase()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  crownCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,217,125,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,217,125,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  crownEmoji: { fontSize: 40 },
  heroTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: spacing.xs,
  },
  heroSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 22,
  },
  loader: { marginTop: spacing.xxl },

  planRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  planCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  planCardBody: { flex: 1, gap: 4, alignItems: 'flex-start' },
  planName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  planPrice: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },

  matrixCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    marginBottom: spacing.lg,
  },
  matrixRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  matrixRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  matrixLabelCell: { flex: 1 },
  matrixValueCell: { width: 64, textAlign: 'center' },
  matrixHeader: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: 0.4,
  },
  matrixHeaderPremium: { color: colors.primary },
  matrixLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    lineHeight: 19,
  },
  matrixValue: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.sage,
  },
  matrixValueMuted: { color: colors.mutedForeground },
  matrixValuePremium: { color: colors.sage },

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
  restoreLink: { alignItems: 'center', paddingVertical: 14 },
  restoreLinkText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    textDecorationLine: 'underline',
  },

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
