import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, fontFamilies, fontSizes } from '@masalim/ui';
import { ChevronLeftIcon } from './icons';

interface ScreenHeaderProps {
  title?: string;
  /** Small uppercase eyebrow above/beside the title (e.g. "YENİ HİKÂYE"). */
  eyebrow?: string;
  onBack?: () => void;
  /** Dark (night-mode) styling. */
  dark?: boolean;
}

/** Standard header: 44px circular back button (a11y hit area) + eyebrow/title. */
export function ScreenHeader({ title, eyebrow, onBack, dark = false }: ScreenHeaderProps) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        accessibilityRole="button"
        accessibilityLabel="Geri"
        style={[styles.backButton, dark ? styles.backButtonDark : styles.backButtonLight]}
      >
        <ChevronLeftIcon color={dark ? '#FFFFFF' : colors.foreground} />
      </Pressable>
      <View style={styles.textBlock}>
        {eyebrow ? (
          <Text style={[styles.eyebrow, dark && styles.eyebrowDark]}>
            {eyebrow.toLocaleUpperCase('tr')}
          </Text>
        ) : null}
        {title ? <Text style={[styles.title, dark && styles.titleDark]}>{title}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonLight: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  backButtonDark: { backgroundColor: 'rgba(255,255,255,0.1)' },
  textBlock: { flex: 1 },
  eyebrow: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  eyebrowDark: { color: 'rgba(176,156,224,0.7)' },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h1,
    color: colors.foreground,
    letterSpacing: -0.3,
  },
  titleDark: { color: '#FFFFFF', fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg },
});
