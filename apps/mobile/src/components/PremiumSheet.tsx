import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, premiumGold, radius, spacing } from '@masalim/ui';
import { Button } from './Button';
import { CheckIcon } from './icons';
import { SheetContainer } from './SheetContainer';

interface PremiumSheetProps {
  visible: boolean;
  featureName: string;
  description?: string;
  onUpgrade: () => void;
  onDismiss: () => void;
}

/**
 * Premium gate bottom sheet (`Sheet/Premium` in the final design): crown badge,
 * feature explanation and the three headline premium perks, leading to the
 * paywall. Shown BEFORE a premium action starts (§design rule: no surprise
 * paywalls after work is done).
 */
export function PremiumSheet({
  visible,
  featureName,
  description,
  onUpgrade,
  onDismiss,
}: PremiumSheetProps) {
  const { t } = useTranslation();
  const perks = [
    t('premiumSheet.perkParentVoice'),
    t('premiumSheet.perkUnlimitedStories'),
    t('premiumSheet.perkIllustrations'),
  ];
  return (
    <SheetContainer visible={visible} onDismiss={onDismiss}>
      <View style={styles.content}>
        <LinearGradient
          colors={[premiumGold.light, premiumGold.mid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.crown}
        >
          <Text style={styles.crownEmoji}>👑</Text>
        </LinearGradient>
        <Text style={styles.title}>{t('premiumSheet.title')}</Text>
        <Text style={styles.body}>
          <Text style={styles.bodyStrong}>{featureName}</Text>
          {' — '}
          {description ?? t('premiumSheet.bodyFallback')}
        </Text>
        <View style={styles.perks}>
          {perks.map((perk) => (
            <View key={perk} style={styles.perkRow}>
              <LinearGradient
                colors={[premiumGold.light, premiumGold.mid]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.perkTick}
              >
                <CheckIcon size={11} color={colors.primaryForeground} />
              </LinearGradient>
              <Text style={styles.perkText}>{perk}</Text>
            </View>
          ))}
        </View>
        <Button label={t('premiumSheet.cta')} onPress={onUpgrade} leading="✨" />
        <Button label={t('premiumSheet.dismiss')} onPress={onDismiss} variant="tertiary" compact />
      </View>
    </SheetContainer>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs },
  crown: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: premiumGold.mid,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  crownEmoji: { fontSize: 30 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    textAlign: 'center',
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 21,
  },
  bodyStrong: { fontFamily: fontFamilies.bodyBold, color: colors.foreground },
  perks: {
    alignSelf: 'stretch',
    backgroundColor: colors.muted,
    borderRadius: radius.base,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkTick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  perkText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    flex: 1,
  },
});
