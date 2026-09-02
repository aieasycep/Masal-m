import { useEffect } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { SubscriptionPlan, SubscriptionStatus, VoiceProfileStatus } from '@masalim/types';
import { colors, fontFamilies, fontSizes, premiumGold, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ListRow } from '../../src/components/ListRow';
import { LoadingState } from '../../src/components/LoadingState';

const STORE_SUBSCRIPTIONS_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
const MOCK_STORE = process.env.EXPO_PUBLIC_PURCHASES_PROVIDER !== 'revenuecat';

function formatDate(iso: string | null, locale: string): string | null {
  if (iso == null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isThisMonth(iso: string): boolean {
  const date = new Date(iso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

/**
 * "Aboneliğim" for Premium members (design Subscription/02-Manage): plan +
 * renewal, this month's usage, credits, and the store-managed actions. Free
 * users never land here — the Profile row sends them to the paywall.
 */
export default function ManageSubscription() {
  const { t, i18n } = useTranslation();

  const subscriptionQuery = useQuery({ queryKey: ['subscription'], queryFn: () => api.subscription.get() });
  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const storiesQuery = useQuery({ queryKey: ['stories', 'recent'], queryFn: () => api.stories.list() });
  const voicesQuery = useQuery({ queryKey: ['voices'], queryFn: () => api.voices.list() });
  const booksQuery = useQuery({ queryKey: ['books'], queryFn: () => api.books.list() });

  const subscription = subscriptionQuery.data;
  const isPremium = subscription?.plan === SubscriptionPlan.PREMIUM;

  // A free account reaching this route (stale link) belongs on the paywall.
  useEffect(() => {
    if (subscription != null && !isPremium) router.replace('/subscription/paywall' as never);
  }, [subscription, isPremium]);

  const credits = entitlementsQuery.data?.credits;
  const creditsLeft =
    credits == null ? null : Math.max(0, credits.quota.limit - credits.quota.used) + credits.balance;
  const storiesThisMonth = (storiesQuery.data?.items ?? []).filter((story) => isThisMonth(story.createdAt)).length;
  const readyVoices = (voicesQuery.data ?? []).filter((voice) => voice.status === VoiceProfileStatus.READY).length;
  const bookCount = booksQuery.data?.length ?? 0;

  const renewal = formatDate(subscription?.expiresAt ?? null, i18n.language);
  const statusLine =
    subscription?.status === SubscriptionStatus.CANCELLED || subscription?.status === SubscriptionStatus.GRACE
      ? renewal != null
        ? t('subscription.manageStatusEnding', { date: renewal })
        : t('subscription.manageStatusEndingSoon')
      : renewal != null
        ? t('subscription.manageStatusActive', { date: renewal })
        : t('subscription.manageStatusActiveNoDate');

  return (
    <Screen>
      <ScreenHeader title={t('subscription.manageTitle')} onBack={() => router.back()} />
      {subscription == null ? (
        <LoadingState variant="page" />
      ) : (
        <>
          <LinearGradient
            colors={[premiumGold.light, premiumGold.mid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.hero, shadows.cardMedium]}
          >
            <Text style={styles.heroEyebrow}>{t('subscription.premiumPlan').toLocaleUpperCase('tr')}</Text>
            <Text style={styles.heroTitle}>{t('subscription.monthlyPlan')}</Text>
            <Text style={styles.heroStatus}>{statusLine}</Text>
            <Text style={styles.heroPayment}>
              {MOCK_STORE ? t('subscription.managePaymentMock') : t('subscription.managePaymentStore')}
            </Text>
          </LinearGradient>

          <Text style={styles.sectionLabel}>{t('subscription.manageUsageTitle').toLocaleUpperCase('tr')}</Text>
          <View style={styles.statsCard}>
            <StatRow label={t('subscription.manageStoriesThisMonth')} value={String(storiesThisMonth)} />
            <StatRow label={t('subscription.manageVoices')} value={String(readyVoices)} />
            <StatRow label={t('subscription.manageBooks')} value={String(bookCount)} />
            <StatRow
              label={t('subscription.manageCreditsLeft')}
              value={creditsLeft == null ? '—' : t('credits.balanceValue', { count: creditsLeft })}
              last
            />
          </View>

          <View style={styles.actions}>
            <ListRow
              icon="🎟"
              label={t('profile.menu.credits')}
              sub={t('subscription.manageCreditsSub')}
              onPress={() => router.push('/subscription/quota' as never)}
            />
            <ListRow
              icon="🔁"
              label={t('subscription.manageChangePlan')}
              sub={t('subscription.manageChangePlanSub')}
              onPress={() => router.push('/subscription/paywall' as never)}
            />
            <ListRow
              icon="🏪"
              label={t('subscription.manage')}
              sub={MOCK_STORE ? t('subscription.manageStoreMock') : t('subscription.manageStoreSub')}
              variant={MOCK_STORE ? 'disabled' : 'default'}
              onPress={MOCK_STORE ? undefined : () => void Linking.openURL(STORE_SUBSCRIPTIONS_URL)}
              showDivider={false}
            />
          </View>
          <Text style={styles.footnote}>{t('subscription.manageFootnote')}</Text>
        </>
      )}
    </Screen>
  );
}

function StatRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.statRow, last ? null : styles.statRowBorder]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  heroEyebrow: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    letterSpacing: 1.1,
    color: premiumGold.text,
    marginBottom: 6,
  },
  heroTitle: { fontFamily: fontFamilies.display, fontSize: fontSizes.h2, color: colors.foreground },
  heroStatus: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    marginTop: 8,
  },
  heroPayment: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: premiumGold.text,
    marginTop: 4,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    letterSpacing: 1.1,
    color: colors.mutedForeground,
    marginBottom: spacing.xs,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
  },
  statRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  statLabel: { fontFamily: fontFamilies.body, fontSize: fontSizes.base, color: colors.mutedForeground },
  statValue: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg, color: colors.foreground },
  actions: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  footnote: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    lineHeight: 18,
    marginTop: spacing.md,
    marginBottom: spacing.xxl,
  },
});
