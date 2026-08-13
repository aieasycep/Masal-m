import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NotificationItem } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { Button } from '../../src/components/Button';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { CheckIcon } from '../../src/components/icons';
import { EmptyState, ErrorState } from '../../src/components/states';
import { api } from '../../src/lib/api';
import { registerForPush } from '../../src/lib/push';

type PermissionState = 'loading' | 'undetermined' | 'denied' | 'granted' | 'unsupported';

/** Notification settings — push permission state + a modest inbox preview. */
export default function NotificationSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PermissionState>('loading');
  const [requesting, setRequesting] = useState(false);

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
