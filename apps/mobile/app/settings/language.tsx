import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, NetworkError } from '@masalim/api-client';
import { supportedLocales, type SupportedLocale } from '@masalim/localization';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { CheckIcon } from '../../src/components/icons';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

const LANGUAGE_EMOJI: Record<SupportedLocale, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
};

/**
 * Language picker — `Settings/03-Language` option rows (flag + label + check
 * circle). Both locales are selectable (product decision: EN is live).
 */
export default function LanguageSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLocale: SupportedLocale = i18n.language === 'en' ? 'en' : 'tr';

  const selectLanguage = async (code: SupportedLocale) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    await i18n.changeLanguage(code);
    try {
      const updated = await api.users.updateMe({ locale: code });
      setUser(updated);
      queryClient.setQueryData(['me'], updated);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      // The UI language already switched; surface the sync failure and stay.
      if (err instanceof ApiError) {
        setError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setError(t('errors.OFFLINE'));
      } else {
        setError(t('errors.GENERIC'));
      }
      setBusy(false);
      return;
    }
    router.back();
  };

  return (
    <Screen>
      <ScreenHeader title={t('settings.language')} />
      <View style={styles.list} accessibilityRole="radiogroup">
        {supportedLocales.map((code) => {
          const active = currentLocale === code;
          return (
            <Pressable
              key={code}
              onPress={() => void selectLanguage(code)}
              accessibilityRole="radio"
              accessibilityLabel={t(`settings.languages.${code}`)}
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.row,
                active ? styles.rowActive : null,
                pressed && !active ? styles.rowPressed : null,
              ]}
            >
              <Text style={styles.flag}>{LANGUAGE_EMOJI[code]}</Text>
              <Text style={[styles.label, active ? styles.labelActive : null]}>
                {t(`settings.languages.${code}`)}
              </Text>
              {active ? (
                <View style={styles.checkCircle}>
                  <CheckIcon />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {error != null ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  rowActive: { borderColor: colors.primary },
  rowPressed: { backgroundColor: colors.muted },
  flag: { fontSize: 28 },
  label: {
    flex: 1,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  labelActive: { color: colors.primary },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.md,
  },
});
