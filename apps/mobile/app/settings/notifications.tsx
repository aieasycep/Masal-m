import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { NotificationType } from '@masalim/types';
import type { NotificationItem, NotificationPrefs } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, spacing } from '@masalim/ui';
import { Button } from '../../src/components/Button';
import { ListRow } from '../../src/components/ListRow';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { CheckIcon } from '../../src/components/icons';
import { EmptyState, ErrorState } from '../../src/components/states';
import { api } from '../../src/lib/api';
import { registerForPush } from '../../src/lib/push';

type PermissionState = 'loading' | 'undetermined' | 'denied' | 'granted' | 'unsupported';

const ALL_NOTIFICATION_TYPES = Object.values(NotificationType);

/** Per-category toggle rows (`Settings/04-Notifications`). The illustration
 * toggle governs both ILLUSTRATIONS_READY and BOOK_READY. */
const PREF_ROWS: ReadonlyArray<{
  key: string;
  icon: string;
  labelKey: string;
  subKey: string;
  types: NotificationType[];
}> = [
  {
    key: 'story',
    icon: '📖',
    labelKey: 'settings.notifStory',
    subKey: 'settings.notifStorySub',
    types: [NotificationType.STORY_READY],
  },
  {
    key: 'voice',
    icon: '🎙',
    labelKey: 'settings.notifVoice',
    subKey: 'settings.notifVoiceSub',
    types: [NotificationType.VOICE_READY],
  },
  {
    key: 'illustrations',
    icon: '🎨',
    labelKey: 'settings.notifIllustrations',
    subKey: 'settings.notifIllustrationsSub',
    types: [NotificationType.ILLUSTRATIONS_READY, NotificationType.BOOK_READY],
  },
  {
    key: 'orders',
    icon: '📦',
    labelKey: 'settings.notifOrders',
    subKey: 'settings.notifOrdersSub',
    types: [NotificationType.ORDER_SHIPPED],
  },
  {
    key: 'updates',
    icon: '✨',
    labelKey: 'settings.notifUpdates',
    subKey: 'settings.notifUpdatesSub',
    types: [NotificationType.GENERIC],
  },
];

/** Notification settings — push permission state, category toggles, inbox. */
export default function NotificationSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PermissionState>('loading');
  const [requesting, setRequesting] = useState(false);
  const [pendingPrefs, setPendingPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  // Optimistic overlay while a write is in flight; absent key = enabled.
  const prefs: NotificationPrefs = pendingPrefs ?? meQuery.data?.notificationPrefs ?? {};
  const groupEnabled = (types: NotificationType[]): boolean =>
    types.every((type) => prefs[type] !== false);

  const prefsMutation = useMutation({
    mutationFn: (next: NotificationPrefs) => api.users.updateMe({ notificationPrefs: next }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['me'], updated);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      setPendingPrefs(null);
    },
    onError: (error) => {
      // Revert the optimistic overlay and surface the failure.
      setPendingPrefs(null);
      if (error instanceof ApiError) {
        setPrefsError(t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (error instanceof NetworkError) {
        setPrefsError(t('errors.OFFLINE'));
      } else {
        setPrefsError(t('errors.GENERIC'));
      }
    },
  });

  const togglePrefs = (types: NotificationType[], value: boolean) => {
    setPrefsError(null);
    // Write the full explicit map so the server stores every current choice.
    const next: NotificationPrefs = {};
    for (const type of ALL_NOTIFICATION_TYPES) {
      next[type] = prefs[type] !== false;
    }
    for (const type of types) {
      next[type] = value;
    }
    setPendingPrefs(next);
    prefsMutation.mutate(next);
  };

  const refreshPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermission('unsupported');
      return;
    }
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) {
        setPermission('granted');
      } else if (current.status === 'undetermined' || current.canAskAgain) {
        setPermission('undetermined');
      } else {
        setPermission('denied');
      }
    } catch {
      setPermission('unsupported');
    }
  }, []);

  // Re-check whenever the screen gains focus (e.g. back from system settings).
  useFocusEffect(
    useCallback(() => {
      void refreshPermission();
    }, [refreshPermission]),
  );

  const enablePush = async () => {
    setRequesting(true);
    await registerForPush();
    await refreshPermission();
    setRequesting(false);
  };

  const showInbox = permission === 'granted' || permission === 'unsupported';
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    enabled: showInbox,
  });
  const items = notificationsQuery.data?.items ?? [];

  const openNotification = async (item: NotificationItem) => {
    if (item.readAt == null) {
      try {
        await api.notifications.markRead(item.id);
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch {
        // Read-state sync is cosmetic — never block navigation on it.
      }
    }
    const route = item.data['route'];
    if (typeof route === 'string' && route.startsWith('/')) {
      router.push(route as never);
    }
  };

  return (
    <Screen>
      <ScreenHeader title={t('settings.notifications')} />

      {permission === 'undetermined' ? (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionEmoji}>🔔</Text>
          <Text style={styles.permissionBody}>{t('settings.pushDisabled')}</Text>
          <Button
            label={t('settings.enablePush')}
            onPress={() => void enablePush()}
            loading={requesting}
            compact
          />
        </View>
      ) : null}

      {permission === 'denied' ? (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionEmoji}>🔕</Text>
          <Text style={styles.permissionBody}>{t('settings.pushPermissionDenied')}</Text>
          <Button
            label={t('voice.micTestOpenSettings')}
            onPress={() => void Linking.openSettings()}
            variant="secondary"
            compact
          />
        </View>
      ) : null}

      {permission === 'granted' ? (
        <View style={styles.enabledRow}>
          <View style={styles.enabledTile}>
            <Text style={styles.enabledEmoji}>🔔</Text>
          </View>
          <Text style={styles.enabledLabel}>{t('settings.pushEnabled')}</Text>
          <View style={styles.enabledCheck}>
            <CheckIcon />
          </View>
        </View>
      ) : null}

      {/* Masalım notification categories — bound to me.notificationPrefs. */}
      {meQuery.data != null ? (
        <View style={styles.prefsSection}>
          <Text style={styles.prefsLabel}>
            {t('settings.notifSection').toLocaleUpperCase('tr')}
          </Text>
          <View style={styles.prefsCard}>
            {PREF_ROWS.map((row, index) => (
              <ListRow
                key={row.key}
                icon={row.icon}
                label={t(row.labelKey)}
                sub={t(row.subKey)}
                variant="toggle"
                toggleValue={groupEnabled(row.types)}
                onToggle={(value) => togglePrefs(row.types, value)}
                showDivider={index < PREF_ROWS.length - 1}
              />
            ))}
          </View>
          {prefsError != null ? (
            <Text style={styles.prefsError} accessibilityLiveRegion="polite">
              {prefsError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showInbox ? (
        notificationsQuery.isError ? (
          <ErrorState
            emoji="🌧️"
            title={t('errors.GENERIC')}
            ctaLabel={t('common.retry')}
            onCta={() => void notificationsQuery.refetch()}
          />
        ) : notificationsQuery.isSuccess && items.length === 0 ? (
          <EmptyState emoji="🌙" title={t('notificationsScreen.empty')} />
        ) : items.length > 0 ? (
          <View style={styles.inboxCard}>
            {items.map((item, index) => {
              const unread = item.readAt == null;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => void openNotification(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  style={({ pressed }) => [
                    styles.inboxRow,
                    index < items.length - 1 && styles.inboxRowBorder,
                    pressed && styles.inboxRowPressed,
                  ]}
                >
                  <View style={[styles.inboxDot, !unread && styles.inboxDotRead]} />
                  <View style={styles.inboxTextBlock}>
                    <Text
                      style={[styles.inboxTitle, !unread && styles.inboxTitleRead]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.inboxBody} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  permissionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  prefsSection: { marginBottom: spacing.lg },
  prefsLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  prefsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  prefsError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.xs,
  },
  permissionEmoji: { fontSize: 40 },
  permissionBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 21,
  },
  enabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
    marginBottom: spacing.md,
  },
  enabledTile: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enabledEmoji: { fontSize: 20 },
  enabledLabel: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  enabledCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  inboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
  },
  inboxRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  inboxRowPressed: { backgroundColor: colors.muted },
  inboxDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  inboxDotRead: { backgroundColor: colors.border },
  inboxTextBlock: { flex: 1 },
  inboxTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    marginBottom: 2,
  },
  inboxTitleRead: { color: colors.mutedForeground },
  inboxBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    lineHeight: 18,
  },
});
