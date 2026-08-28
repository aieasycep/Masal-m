import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { VoiceProfileStatus } from '@masalim/types';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, spacing } from '@masalim/ui';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { ListRow } from '../../src/components/ListRow';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ChevronRightIcon } from '../../src/components/icons';
import { api } from '../../src/lib/api';
import { unregisterPush } from '../../src/lib/push';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { useAuthStore } from '../../src/stores/auth';

/** Labeled section card from `Settings/01-Main`: uppercase eyebrow + white r18 card. */
function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title.toLocaleUpperCase('tr')}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/**
 * Collapsible info row (privacy policy / terms / AI disclosure) — the inline
 * static-copy approach: tapping expands the body instead of a dead link row.
 */
function ExpandableRow({
  icon,
  label,
  body,
  showDivider = true,
}: {
  icon: string;
  label: string;
  body: string;
  showDivider?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.expandRow, pressed && styles.expandRowPressed]}
      >
        <View style={styles.expandIconTile}>
          <Text style={styles.expandIcon}>{icon}</Text>
        </View>
        <Text style={styles.expandLabel} numberOfLines={1}>
          {label}
        </Text>
        <View style={open ? styles.chevronOpen : null}>
          <ChevronRightIcon size={14} color={colors.mutedForeground} />
        </View>
      </Pressable>
      {open ? <Text style={styles.expandBody}>{body}</Text> : null}
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
}

/** Settings hub — `Settings/01-Main` from the final design. */
export default function SettingsIndex() {
  const { t, i18n } = useTranslation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });
  const voicesQuery = useQuery({ queryKey: ['voices'], queryFn: () => api.voices.list() });

  const me = meQuery.data;
  const childCount = childrenQuery.data?.length;
  const voiceCount = voicesQuery.data?.filter(
    (voice) => voice.status !== VoiceProfileStatus.DELETED,
  ).length;

  const languageCode = i18n.language === 'en' ? 'en' : 'tr';
  const defaultPlaybackRate = useAppPrefs((state) => state.defaultPlaybackRate);
  const rateLabel = `${defaultPlaybackRate}x`.replace('.', ',');
  const version = Constants.expoConfig?.version ?? '0.1.0';

  const signOut = async () => {
    setConfirmSignOut(false);
    // Best-effort: drop this device's push token while the session is still valid.
    await unregisterPush();
    try {
      await api.auth.logout();
    } catch {
      // Signing out locally always succeeds even if the API call fails.
    }
    await useAuthStore.getState().clearSession();
    router.replace('/(onboarding)/splash' as never);
  };

  return (
    <Screen>
      <ScreenHeader title={t('settings.title')} />

      <SectionCard title={t('settings.account')}>
        <ListRow
          icon="👤"
          label={t('settings.accountInfo')}
          sub={me?.name}
          onPress={() => router.push('/settings/account' as never)}
        />
        <ListRow
          icon="🧒"
          label={t('profile.childrenSection')}
          sub={childCount == null ? undefined : t('settings.childrenSub', { count: childCount })}
          onPress={() => router.push('/children' as never)}
        />
        <ListRow
          icon="🎙"
          label={t('settings.voices')}
          sub={
            voiceCount == null
              ? undefined
              : voiceCount > 0
                ? t('profile.menu.voicesSub', { count: voiceCount })
                : t('profile.menu.voicesEmpty')
          }
          onPress={() => router.push('/voice' as never)}
          showDivider={false}
        />
      </SectionCard>

      <SectionCard title={t('settings.sectionPreferences')}>
        <ListRow
          icon="🔔"
          label={t('settings.notifications')}
          onPress={() => router.push('/settings/notifications' as never)}
        />
        <ListRow
          icon="🌍"
          label={t('settings.language')}
          sub={t(`settings.languages.${languageCode}`)}
          onPress={() => router.push('/settings/language' as never)}
        />
        <ListRow
          icon="🔊"
          label={t('settings.audio')}
          sub={t('settings.audioSub', { rate: rateLabel })}
          onPress={() => router.push('/settings/audio' as never)}
          showDivider={false}
        />
      </SectionCard>

      <SectionCard title={t('settings.sectionPrivacy')}>
        <ListRow
          icon="🔒"
          label={t('settings.voiceData')}
          onPress={() => router.push('/settings/voice-data' as never)}
        />
        <ExpandableRow icon="📄" label={t('settings.privacy')} body={t('settings.privacyBody')} />
        <ExpandableRow icon="📋" label={t('settings.terms')} body={t('settings.termsBody')} />
        <ExpandableRow
          icon="🤖"
          label={t('settings.aiInfo')}
          body={t('settings.aiInfoBody')}
          showDivider={false}
        />
      </SectionCard>

      <SectionCard title={t('settings.account')}>
        <ListRow icon="🚪" label={t('profile.signOut')} onPress={() => setConfirmSignOut(true)} />
        <ListRow
          icon="🗑"
          label={t('settings.deleteAccount')}
          variant="destructive"
          onPress={() => router.push('/settings/account?delete=1' as never)}
          showDivider={false}
        />
      </SectionCard>

      <Text style={styles.version}>{t('settings.version', { version })}</Text>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  expandRowPressed: { backgroundColor: colors.muted },
  expandIconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandIcon: { fontSize: 18 },
  expandLabel: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  expandBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    lineHeight: 20,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: 18,
  },
  version: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
