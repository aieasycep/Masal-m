import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, NetworkError } from '@masalim/api-client';
import { supportedLocales, type SupportedLocale } from '@masalim/localization';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SelectableCard } from '../../src/components/SelectableCard';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

const LANGUAGE_EMOJI: Record<SupportedLocale, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
};

/** Language picker — switches the UI locale and persists it on the account. */
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
        {supportedLocales.map((code) => (
          <SelectableCard
            key={code}
            selected={currentLocale === code}
            glow
            onPress={() => void selectLanguage(code)}
            accessibilityLabel={t(`settings.languages.${code}`)}
          >
            <Text style={styles.flag}>{LANGUAGE_EMOJI[code]}</Text>
            <Text style={styles.label}>{t(`settings.languages.${code}`)}</Text>
          </SelectableCard>
        ))}
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
  list: { gap: spacing.sm },
  flag: { fontSize: 24 },
  label: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.md,
  },
});
