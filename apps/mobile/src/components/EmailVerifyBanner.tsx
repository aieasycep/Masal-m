import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';

/**
 * Lavender-tinted nudge in the QuotaBanner language: shown on Home while the
 * server mails for real and the account's address is still unconfirmed.
 * Tapping anywhere opens the verification screen.
 */
export function EmailVerifyBanner() {
  const { t } = useTranslation();
  const open = () => router.push('/settings/verify-email' as never);

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('emailVerify.bannerTitle')}
      style={({ pressed }) => [styles.root, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.emoji}>✉️</Text>
      <View style={styles.col}>
        <Text style={styles.title}>{t('emailVerify.bannerTitle')}</Text>
        <Text style={styles.body}>{t('emailVerify.bannerBody')}</Text>
      </View>
      <Text style={styles.cta}>{t('emailVerify.bannerCta')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.base,
    borderWidth: 1,
    // rgba stops derive from colors.lavender (#B09CE0).
    backgroundColor: 'rgba(176, 156, 224, 0.12)',
    borderColor: 'rgba(176, 156, 224, 0.35)',
  },
  emoji: { fontSize: 18 },
  col: { flex: 1, gap: 2 },
  title: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  cta: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
});
