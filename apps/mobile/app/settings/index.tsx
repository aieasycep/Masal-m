import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { ChevronRightIcon } from '../../src/components/icons';
import { api } from '../../src/lib/api';

/** Settings hub — account/language/notifications rows + AI & voice-data info. */
export default function SettingsIndex() {
  const { t, i18n } = useTranslation();
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  const [aiInfoOpen, setAiInfoOpen] = useState(false);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const me = meQuery.data;

  // Re-check on every focus — the user may grant/revoke on the next screen.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (Platform.OS !== 'web') {
        Notifications.getPermissionsAsync()
          .then((permission) => {
            if (active) setPushGranted(permission.granted);
          })
          .catch(() => undefined);
      }
      return () => {
        active = false;
      };
    }, []),
  );

  const languageCode = i18n.language === 'en' ? 'en' : 'tr';
  const version = Constants.expoConfig?.version ?? '0.1.0';

  const rows = [
    {
      key: 'account',
      icon: '👤',
      label: t('settings.account'),
      sub: me?.email ?? t('settings.editProfile'),
      route: '/settings/account',
    },
    {
      key: 'language',
      icon: '🌐',
      label: t('settings.language'),
      sub: t(`settings.languages.${languageCode}`),
      route: '/settings/language',
    },
    {
      key: 'notifications',
      icon: '🔔',
      label: t('settings.notifications'),
      // No dedicated off-state copy exists yet — the neutral prefs line stands in.
      sub: pushGranted === true ? t('settings.pushEnabled') : t('settings.pushDisabled'),
      route: '/settings/notifications',
    },
  ] as const;

  return (
    <Screen>
      <ScreenHeader title={t('settings.title')} />

      <View style={styles.menuCard}>
        {rows.map((row, index) => (
          <Pressable
            key={row.key}
            onPress={() => router.push(row.route as never)}
            accessibilityRole="button"
            accessibilityLabel={row.label}
            style={({ pressed }) => [
              styles.menuRow,
              index < rows.length - 1 && styles.menuRowBorder,
              pressed && styles.menuRowPressed,
            ]}
          >
            <View style={styles.iconTile}>
              <Text style={styles.icon}>{row.icon}</Text>
            </View>
            <View style={styles.textBlock}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                {row.sub}
              </Text>
            </View>
            <ChevronRightIcon size={14} />
          </Pressable>
        ))}
      </View>

      {/* AI content disclosure — collapsible inline info (§ transparency). */}
      <View style={styles.infoCard}>
        <Pressable
          onPress={() => setAiInfoOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={t('settings.aiInfo')}
          accessibilityState={{ expanded: aiInfoOpen }}
          style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
        >
          <View style={styles.iconTile}>
            <Text style={styles.icon}>🤖</Text>
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.label}>{t('settings.aiInfo')}</Text>
          </View>
          <View style={aiInfoOpen ? styles.chevronOpen : styles.chevronClosed}>
            <ChevronRightIcon size={14} />
          </View>
        </Pressable>
        {aiInfoOpen ? <Text style={styles.infoBody}>{t('settings.aiInfoBody')}</Text> : null}
      </View>

      {/* Voice data — informational only; the management screen lands with the voice phase. */}
      <View style={styles.infoCard}>
        <View style={styles.menuRow}>
          <View style={styles.iconTile}>
            <Text style={styles.icon}>🎙</Text>
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.label}>{t('settings.voiceData')}</Text>
          </View>
        </View>
        <Text style={styles.infoBody}>{t('settings.voiceDataBody')}</Text>
      </View>

      <Text style={styles.version}>{t('settings.version', { version })}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  menuCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
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
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  textBlock: { flex: 1 },
  label: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    marginBottom: 1,
  },
  sub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  chevronClosed: { transform: [{ rotate: '0deg' }] },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  infoBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    lineHeight: 20,
    paddingHorizontal: 18,
    paddingBottom: spacing.md,
  },
  version: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
