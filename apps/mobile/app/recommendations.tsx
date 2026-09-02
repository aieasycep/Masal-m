import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StoryTheme } from '@masalim/types';
import type { Recommendation } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../src/lib/api';
import { useWizardStore } from '../src/stores/wizard';
import { Screen } from '../src/components/Screen';
import { ScreenHeader } from '../src/components/ScreenHeader';
import { LoadingState } from '../src/components/LoadingState';
import { EmptyState, ErrorState } from '../src/components/states';
import { ChevronRightIcon } from '../src/components/icons';

const FULL_LIST_LIMIT = 12;

function isStoryTheme(value: unknown): value is StoryTheme {
  return typeof value === 'string' && (Object.values(StoryTheme) as string[]).includes(value);
}

/**
 * "Ege için tüm öneriler" — the full recommendation list behind Home's
 * "Tümü" (design: recommendations are not the library). Tapping a card seeds
 * the wizard with child + themes + idea exactly like the Home cards do.
 */
export default function AllRecommendations() {
  const { t } = useTranslation();
  const { childId, name } = useLocalSearchParams<{ childId?: string; name?: string }>();
  const enabled = childId != null && childId.length > 0;

  const query = useQuery({
    queryKey: ['recommendations', childId, FULL_LIST_LIMIT],
    queryFn: () => api.children.recommendations(childId as string, FULL_LIST_LIMIT),
    enabled,
  });

  const open = (rec: Recommendation) => {
    const store = useWizardStore.getState();
    store.reset();
    store.applySuggestion(rec.themes.filter(isStoryTheme), rec.promptSeed);
    router.push('/story/create' as never);
  };

  const title = name != null && name.length > 0 ? t('home.suggestionsTitle', { name }) : t('recommendations.title');

  return (
    <Screen>
      <ScreenHeader title={title} onBack={() => router.back()} />
      <Text style={styles.lead}>{t('recommendations.lead')}</Text>
      {!enabled || query.isError ? (
        <ErrorState kind="server" onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <LoadingState variant="list" rows={5} />
      ) : query.data.length === 0 ? (
        <EmptyState
          emoji="✨"
          title={t('recommendations.emptyTitle')}
          body={t('recommendations.emptyBody')}
          variant="card"
        />
      ) : (
        <View style={styles.list}>
          {query.data.map((rec) => {
            const firstTheme = rec.themes[0];
            return (
              <Pressable
                key={rec.promptSeed}
                onPress={() => open(rec)}
                accessibilityRole="button"
                accessibilityLabel={rec.title}
                style={({ pressed }) => [styles.card, shadows.cardSubtle, { opacity: pressed ? 0.85 : 1 }]}
              >
                <View style={styles.tile}>
                  <Text style={styles.emoji}>{rec.emoji}</Text>
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.title} numberOfLines={2}>
                    {rec.title}
                  </Text>
                  {firstTheme != null ? (
                    <Text style={styles.sub} numberOfLines={1}>
                      {t('home.suggestionTheme', { theme: t(`wizard.themes.${firstTheme}`) })}
                    </Text>
                  ) : null}
                </View>
                <ChevronRightIcon />
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  list: { gap: spacing.xs, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 22 },
  textWrap: { flex: 1 },
  title: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.base, color: colors.foreground },
  sub: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: colors.mutedForeground, marginTop: 2 },
});
