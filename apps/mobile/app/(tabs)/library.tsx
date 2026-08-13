import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';

/** Library shell; real list + filters land with the stories phase. */
export default function Library() {
  const { t } = useTranslation();
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('library.title')}</Text>
      <Text style={styles.empty}>{t('library.emptyTitle')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.pageTop,
    paddingHorizontal: spacing.pageX,
  },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayLg,
    color: colors.foreground,
  },
  empty: {
    marginTop: spacing.xl,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
  },
});
