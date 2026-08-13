import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';

function greetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 18) return 'home.greetingDay';
  return 'home.greetingEvening';
}

/** Home shell wired to real data; full Figma layout lands in the design pass. */
export default function Home() {
  const { t } = useTranslation();
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });

  return (
    <View style={styles.root}>
      <Text style={styles.greeting}>{t(greetingKey())}</Text>
      <Text style={styles.headline}>{t('home.headline')}</Text>
      {meQuery.data ? <Text style={styles.meta}>{meQuery.data.name}</Text> : null}
      {childrenQuery.data ? (
        <Text style={styles.meta}>
          {t('common.storyCount', { count: childrenQuery.data.length })}
        </Text>
      ) : null}
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
  greeting: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h1,
    color: colors.foreground,
    lineHeight: 32,
  },
  meta: {
    marginTop: spacing.md,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
});
