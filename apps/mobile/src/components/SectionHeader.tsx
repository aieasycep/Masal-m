import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes } from '@masalim/ui';

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

/** Fraunces 18 section heading with optional "Tümü" link. */
export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button" style={styles.linkHit}>
          <Text style={styles.link}>{t('home.seeAll')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontFamily: fontFamilies.display, fontSize: fontSizes.h4, color: colors.foreground },
  linkHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.md, color: colors.primary },
});
