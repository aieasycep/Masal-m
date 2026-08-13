import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { AGE_RANGE_LABELS } from '@masalim/types';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { unregisterPush } from '../../src/lib/push';
import { useAuthStore } from '../../src/stores/auth';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { Avatar } from '../../src/components/Avatar';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { ChevronRightIcon } from '../../src/components/icons';

/** Deterministic child avatar emoji (name-hash) — keep in sync with Home. */
const CHILD_EMOJIS = ['🧒', '👧', '🦁', '🐻', '🦊', '🐰'] as const;

function childEmoji(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash + (char.codePointAt(0) ?? 0)) % 9973;
  }
  return CHILD_EMOJIS[hash % CHILD_EMOJIS.length] ?? CHILD_EMOJIS[0];
}

interface MenuItem {
  key: string;
  icon: string;
  label: string;
  sub: string;
  route: string;
}

/** Profile & family screen — pixel pass from docs/design-reference Profile.tsx. */
export default function Profile() {
  const { t } = useTranslation();
  const clearSession = useAuthStore((state) => state.clearSession);
  const selectedChildId = useAppPrefs((state) => state.selectedChildId);
  const setSelectedChildId = useAppPrefs((state) => state.setSelectedChildId);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });
  const voicesQuery = useQuery({ queryKey: ['voices'], queryFn: () => api.voices.list() });

  const me = meQuery.data;
  const isPremium = me?.subscriptionPlan === 'PREMIUM';
  const children = childrenQuery.data ?? [];
  const voiceCount = voicesQuery.data?.length ?? 0;

  const menuItems: MenuItem[] = [
    {
      key: 'voices',
      icon: '🎙',
      label: t('profile.menu.voices'),
      sub:
        voiceCount > 0
          ? t('profile.menu.voicesSub', { count: voiceCount })
          : t('profile.menu.voicesEmpty'),
      route: '/voice',
    },
    {
      key: 'orders',
      icon: '📦',
      label: t('profile.menu.orders'),
      sub: t('profile.menu.ordersEmpty'),
      route: '/orders',
    },
    {
      key: 'subscription',
      icon: '👑',
      label: t('profile.menu.subscription'),
      // The paywall shows the expiry date; the row keeps the date-less variant.
      sub: isPremium
        ? t('profile.menu.subscriptionPremiumNoDate')
        : t('profile.menu.subscriptionFree'),
      route: '/subscription/paywall',
    },
    {
      key: 'notifications',
      icon: '🔔',
      label: t('profile.menu.notifications'),
      sub: t('profile.menu.notificationsSub'),
      route: '/settings/notifications',
    },
    {
      key: 'privacy',
      icon: '🔒',
      label: t('profile.menu.privacy'),
      sub: t('profile.menu.privacySub'),
      // Voice-data detail lands in the voice phase — the settings hub hosts the
      // privacy/voice-data summary until then.
      route: '/settings',
    },
    {
      key: 'settings',
      icon: '⚙️',
      label: t('profile.menu.settings'),
      sub: t('profile.menu.settingsSub'),
      route: '/settings',
    },
  ];

  const signOut = async () => {
    setConfirmSignOut(false);
    // Best-effort: drop this device's push token while the session is still valid.
    await unregisterPush();
    try {
      await api.auth.logout();
    } catch {
      // Signing out locally always succeeds even if the API call fails.
    }
    await clearSession();
    router.replace('/(onboarding)/splash' as never);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with lavender wash */}
      <LinearGradient
        // rgba stops derive from colors.lavender (#B09CE0).
        colors={['rgba(176,156,224,0.12)', 'rgba(176,156,224,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.title} accessibilityRole="header">
          {t('profile.title')}
        </Text>

        {/* User card */}
        <LinearGradient
          colors={[colors.primary, colors.purpleSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.userCard, shadows.hero]}
        >
          <View style={styles.userAvatar}>
            <Text style={styles.userAvatarEmoji}>👩</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{me?.name ?? ''}</Text>
            <Text style={styles.userEmail}>{me?.email ?? ''}</Text>
            <View style={styles.planPill}>
              {isPremium ? <Text style={styles.planPillEmoji}>👑</Text> : null}
              <Text style={styles.planPillText}>
                {isPremium ? t('profile.premiumMember') : t('profile.freeMember')}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </LinearGradient>

      {/* Children */}
      <View style={styles.childrenSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>{t('profile.childrenSection')}</Text>
          <Pressable
            onPress={() => router.push('/children/new' as never)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.addChild')}
            hitSlop={8}
          >
            <Text style={styles.sectionLink}>{t('profile.addChild')}</Text>
          </Pressable>
        </View>
        <View style={styles.childrenRow}>
          {children.map((child) => {
            const isSelected = child.id === selectedChildId;
            return (
              <Pressable
                key={child.id}
                onPress={() => setSelectedChildId(child.id)}
                onLongPress={() => router.push(`/children/${child.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={child.name}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.childCard,
                  isSelected ? styles.childCardSelected : styles.childCardUnselected,
                ]}
              >
                {isSelected ? <View style={styles.childDot} /> : null}
                <Avatar emoji={childEmoji(child.name)} size={52} kind="child" />
                <Text style={styles.childName}>{child.name}</Text>
                <Text style={styles.childAge}>
                  {`${AGE_RANGE_LABELS[child.ageRange]} ${t('wizard.ageUnit')}`}
                </Text>
                <View style={styles.childStoriesRow}>
                  <Text style={styles.childStoriesEmoji}>📚</Text>
                  <Text style={styles.childStoriesText}>
                    {t('common.storyCount', { count: child.storyCount })}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Account menu */}
      <View style={styles.menuSection}>
        <Text style={styles.sectionLabel}>{t('profile.accountSection')}</Text>
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.key}
              onPress={() => router.push(item.route as never)}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.menuRow,
                index < menuItems.length - 1 && styles.menuRowBorder,
                pressed && styles.menuRowPressed,
              ]}
            >
              <View style={styles.menuIconTile}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
              </View>
              <View style={styles.menuTextBlock}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Text style={styles.menuSub}>{item.sub}</Text>
              </View>
              <ChevronRightIcon size={14} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Sign out */}
      <View style={styles.signOutSection}>
        <Pressable
          onPress={() => setConfirmSignOut(true)}
          accessibilityRole="button"
          accessibilityLabel={t('profile.signOut')}
          style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        >
          <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
        </Pressable>
      </View>

      <ConfirmSheet
        visible={confirmSignOut}
        title={t('profile.signOutConfirm')}
        confirmLabel={t('profile.signOut')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          void signOut();
        }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.tabBarClearance },
  header: {
    paddingTop: spacing.pageTop,
    paddingHorizontal: spacing.pageX,
    paddingBottom: 28,
  },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayLg,
    letterSpacing: -0.3,
    color: colors.foreground,
    marginBottom: spacing.lg,
  },
  userCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarEmoji: { fontSize: 28 },
  userInfo: { flex: 1 },
  userName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.primaryForeground,
    marginBottom: 2,
  },
  userEmail: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: spacing.xs,
  },
  planPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.sm,
    paddingVertical: spacing.xxs,
    paddingHorizontal: 10,
  },
  planPillEmoji: { fontSize: 12 },
  planPillText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primaryForeground,
  },
  childrenSection: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.72,
    marginBottom: 0,
  },
  sectionLink: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },
  childrenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  childCard: {
    flexGrow: 1,
    flexBasis: '40%',
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 2,
    alignItems: 'center',
    gap: spacing.xs,
  },
  childCardSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  childCardUnselected: { borderColor: colors.border, backgroundColor: colors.card },
  childDot: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  childName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  childAge: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  childStoriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  childStoriesEmoji: { fontSize: 12 },
  childStoriesText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  menuSection: { paddingHorizontal: spacing.pageX },
  menuCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuRowPressed: { backgroundColor: colors.muted },
  menuIconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuIcon: { fontSize: 20 },
  menuTextBlock: { flex: 1 },
  menuLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    marginBottom: 1,
  },
  menuSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  signOutSection: { paddingTop: spacing.md, paddingHorizontal: spacing.pageX },
  signOut: {
    width: '100%',
    padding: spacing.md,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  signOutPressed: { opacity: 0.85 },
  signOutText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.destructive,
  },
});
