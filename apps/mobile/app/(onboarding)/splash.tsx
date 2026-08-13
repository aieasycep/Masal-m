import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, gradients, letterSpacing } from '@masalim/ui';

/**
 * Splash — night sky, floating book logo, wordmark, tap to continue.
 * Visual details (starfield, moon, book SVG) are completed in the design pass.
 */
export default function Splash() {
  const { t } = useTranslation();

  return (
    <Pressable style={styles.root} onPress={() => router.push('/(auth)/welcome')}>
      <LinearGradient
        colors={gradients.nightSky as unknown as [string, string, ...string[]]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <Text style={styles.wordmark}>{t('common.appName')}</Text>
        <Text style={styles.tagline}>{t('common.tagline').toLocaleUpperCase('tr')}</Text>
      </View>
      <Text style={styles.hint}>{t('splash.tapToStart')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6 },
  wordmark: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.wordmark,
    color: colors.card,
    letterSpacing: -1,
  },
  tagline: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(176, 156, 224, 0.9)',
    letterSpacing: letterSpacing.wide,
  },
  hint: {
    position: 'absolute',
    bottom: 60,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.35)',
  },
});
