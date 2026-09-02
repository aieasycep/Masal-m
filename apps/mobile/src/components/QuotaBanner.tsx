import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';
import { AppIcon } from './AppIcon';
import { Button } from './Button';

interface QuotaBannerProps {
  variant: 'warning' | 'exhausted';
  /** Total credits still spendable (monthly quota left + purchased balance). */
  remaining?: number;
  onSeePremium: () => void;
}

/**
 * `Banner/Quota` from the final design. `warning`: peach-tinted single-line
 * banner with a "Premium'u Gör" link; `exhausted`: red-tinted banner with a
 * filled CTA. Numbers always come from real entitlement data.
 */
export function QuotaBanner({ variant, remaining = 0, onSeePremium }: QuotaBannerProps) {
  const { t } = useTranslation();

  if (variant === 'warning') {
    return (
      <View style={[styles.root, styles.warning]}>
        <AppIcon name="alert" size={18} color={colors.warning} />
        <Text style={styles.warningText}>
          {t('quotaBanner.warningPrefix')}
          <Text style={styles.warningStrong}>
            {t('quotaBanner.warningCount', { n: remaining })}
          </Text>
          {t('quotaBanner.warningSuffix')}
        </Text>
        <Pressable onPress={onSeePremium} hitSlop={8} accessibilityRole="button">
          <Text style={styles.warningLink}>{t('quotaBanner.getCredits')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.exhausted]}>
      <AppIcon name="alert" size={20} color={colors.error} />
      <View style={styles.exhaustedCol}>
        <Text style={styles.exhaustedTitle}>{t('quotaBanner.exhaustedTitle')}</Text>
        <Text style={styles.exhaustedBody}>{t('quotaBanner.exhaustedBody')}</Text>
      </View>
      <Button label={t('quotaBanner.getCredits')} onPress={onSeePremium} compact />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.base,
    borderWidth: 1,
  },
  warning: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(240, 139, 110, 0.08)',
    borderColor: 'rgba(240, 139, 110, 0.25)',
  },
  exhausted: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(224, 84, 84, 0.08)',
    borderColor: 'rgba(224, 84, 84, 0.2)',
  },
  warningText: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  warningStrong: { fontFamily: fontFamilies.bodyBold, color: colors.accent },
  warningLink: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.sm,
    color: colors.accent,
  },
  exhaustedCol: { flex: 1, gap: 2 },
  exhaustedTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  exhaustedBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
});
