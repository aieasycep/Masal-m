import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** "999.99" (server decimal string) → "₺999,99" the Turkish store way. */
function formatTRY(priceTRY: string): string {
  const value = Number(priceTRY);
  if (!Number.isFinite(value)) return `₺${priceTRY}`;
  const fixed = value.toFixed(2);
  const intPart = fixed.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₺${intPart},${fixed.slice(-2)}`;
}

/**
 * "Kredilerim" — the INSUFFICIENT_CREDITS stop and the wallet screen: monthly
 * quota state + purchased balance, quick credit-pack purchase (server-priced
 * for this user's tier) and the premium upsell.
 */
export default function Credits() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [busyProduct, setBusyProduct] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });
  const entitlements = entitlementsQuery.data;
  const isPremium = entitlements?.plan === SubscriptionPlan.PREMIUM;
  const quota = entitlements?.credits.quota ?? null;
  const balance = entitlements?.credits.balance ?? 0;
  const quotaRemaining = quota == null ? 0 : Math.max(0, quota.limit - quota.used);
  const total = quotaRemaining + balance;

  const offeringsQuery = useQuery({
    queryKey: ['offerings', isPremium],
    queryFn: () => api.subscription.offerings(),
  });
  const packs = offeringsQuery.data?.packs ?? [];

  const buy = async (productId: string) => {
    if (busyProduct != null) return;
    setError(null);
    setNote(null);
    setBusyProduct(productId);
    try {
      const result = await purchases.purchase(productId);
      if (result.cancelled === true) return;
      if (!result.success) {
        setError(t('errors.GENERIC'));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['entitlements'] });
      setNote(t('subscription.creditsAdded'));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setError(t('errors.OFFLINE'));
      } else {
        setError(t('errors.GENERIC'));
      }
    } finally {
      setBusyProduct(null);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: Math.max(insets.top, 20) + 8,
        paddingBottom: Math.max(insets.bottom, 24) + spacing.xl,
      }}
      showsVerticalScrollIndicator={false}
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
        <View style={styles.ticketCircle}>
          <Text style={styles.ticketEmoji}>🎟</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            {total <= 0 ? t('credits.emptyTitle') : t('credits.title')}
          </Text>
          <Text style={styles.subtitle}>
            {total <= 0 ? t('credits.emptySubtitle') : t('credits.subtitle')}
          </Text>
        </View>

        {/* Wallet card: monthly quota + purchased balance */}
        <View style={styles.walletCard}>
          <View style={styles.walletRow}>
            <Text style={styles.walletLabel}>{t('credits.quotaLabel')}</Text>
            <Text style={styles.walletValue}>
              {quota == null ? '—' : t('credits.quotaValue', { left: quotaRemaining, limit: quota.limit })}
            </Text>
          </View>
          <View style={styles.walletDivider} />
          <View style={styles.walletRow}>
            <Text style={styles.walletLabel}>{t('credits.balanceLabel')}</Text>
            <Text style={styles.walletValue}>{t('credits.balanceValue', { count: balance })}</Text>
          </View>
          <Text style={styles.walletHint}>{t('credits.costsHint')}</Text>
        </View>

        {/* Credit packs — tier prices from server config */}
        {packs.length > 0 ? (
          <View style={styles.packList}>
            {packs.map((pack) => (
              <View key={pack.productId} style={styles.packCard}>
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
                  onPress={() => void buy(pack.productId)}
                />
              </View>
            ))}
          </View>
        ) : null}

        {note != null ? <Text style={styles.noteText}>{`🎉 ${note}`}</Text> : null}
        {error != null ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.footer}>
        {!isPremium ? (
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
              <Text style={styles.ctaLabel}>{t('credits.premiumCta')}</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('subscription.later')}
          style={({ pressed }) => [styles.laterButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={styles.laterLabel}>{t('subscription.later')}</Text>
        </Pressable>
      </View>
    </ScrollView>
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    alignItems: 'center',
    paddingHorizontal: spacing.pageX,
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  ticketCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(240,139,110,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(240,139,110,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketEmoji: { fontSize: 42 },
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

  walletCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  walletLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  walletValue: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  walletDivider: { height: 1, backgroundColor: colors.border },
  walletHint: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    lineHeight: 16,
    paddingTop: 8,
  },

  packList: { alignSelf: 'stretch', gap: 10 },
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

  noteText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
  },

  footer: { paddingHorizontal: spacing.pageX, gap: 10, paddingTop: spacing.xl },
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
