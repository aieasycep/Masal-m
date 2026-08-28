import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StoryTheme, SubscriptionPlan } from '@masalim/types';
import type { StorySummary } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, gradients, radius, shadows, spacing } from '@masalim/ui';
import { Avatar } from '../../src/components/Avatar';
import { ChildSwitcherSheet, childAvatarEmoji } from '../../src/components/ChildSwitcherSheet';
import { QuotaBanner } from '../../src/components/QuotaBanner';
import { Screen } from '../../src/components/Screen';
import { SectionHeader } from '../../src/components/SectionHeader';
import { StoryCardVertical, StoryCardWide } from '../../src/components/StoryCard';
import { ChevronRightIcon } from '../../src/components/icons';
import { EmptyState, ErrorState } from '../../src/components/states';
import { api } from '../../src/lib/api';
import { useAppPrefs } from '../../src/stores/app-prefs';
import { useWizardStore } from '../../src/stores/wizard';

/** Soft lavender wash behind the header — rgba stops derive from colors.lavender (#B09CE0). */
const HEADER_WASH = ['rgba(176,156,224,0.15)', 'rgba(176,156,224,0)'] as const;

const CATEGORIES = [
  { key: 'sleep', emoji: '🌙', theme: StoryTheme.SLEEP },
  { key: 'adventure', emoji: '⚔️', theme: StoryTheme.ADVENTURE },
  { key: 'educational', emoji: '📚', theme: StoryTheme.EDUCATIONAL },
  { key: 'emotions', emoji: '💛', theme: StoryTheme.EMOTIONS },
  { key: 'friendship', emoji: '🤝', theme: StoryTheme.FRIENDSHIP },
  { key: 'imagination', emoji: '✨', theme: StoryTheme.IMAGINATION },
] as const;

function greetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.greetingMorning';
  if (hour < 18) return 'home.greetingDay';
  return 'home.greetingEvening';
}

/** Home — pixel pass from docs/design-reference Home.tsx (+ child switcher, §13). */
export default function Home() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const selectedChildId = useAppPrefs((state) => state.selectedChildId);
  const setSelectedChildId = useAppPrefs((state) => state.setSelectedChildId);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });

  // Cold-start gate (QA P0): a restored session may reach Home before the
  // user record is known. Once /users/me resolves and shows child setup was
  // never finished, send the user back into it instead of a personalized Home.
  const onboardingCompleted = meQuery.data?.onboardingCompleted;
  useEffect(() => {
    if (onboardingCompleted === false) {
      router.replace('/children/new' as never);
    }
  }, [onboardingCompleted]);
  const entitlementsQuery = useQuery({
    queryKey: ['entitlements'],
    queryFn: () => api.subscription.entitlements(),
  });

  // Quota banner (final design): warning at ≤2 remaining, exhausted at 0.
  // Premium plans never see it — their quota headroom is not a sales surface.
  const entitlements = entitlementsQuery.data;
  const storyQuota = entitlements?.quotas.story_monthly_limit;
  const quotaRemaining = storyQuota == null ? null : storyQuota.limit - storyQuota.used;
  const quotaVariant: 'warning' | 'exhausted' | null =
    entitlements == null ||
    entitlements.plan === SubscriptionPlan.PREMIUM ||
    quotaRemaining == null
      ? null
      : quotaRemaining <= 0
        ? 'exhausted'
        : quotaRemaining <= 2
          ? 'warning'
          : null;

  const childList = childrenQuery.data ?? [];
  const selectedChild = childList.find((child) => child.id === selectedChildId) ?? childList[0];
  const childrenData = childrenQuery.data;

  useEffect(() => {
    const firstChild = childrenData?.[0];
    if (selectedChildId == null && firstChild != null) {
      setSelectedChildId(firstChild.id);
    }
  }, [childrenData, selectedChildId, setSelectedChildId]);

  const recommendationsChildId = selectedChild?.id ?? null;
  const recommendationsQuery = useQuery({
    queryKey: ['recommendations', recommendationsChildId],
    queryFn: () =>
      recommendationsChildId == null
        ? Promise.resolve([])
        : api.children.recommendations(recommendationsChildId),
    enabled: recommendationsChildId != null,
  });
  const recommendations = recommendationsQuery.data ?? [];

  const storiesQuery = useQuery({
    queryKey: ['stories', 'recent'],
    queryFn: () => api.stories.list({ pageSize: 10 }),
  });
  const stories: StorySummary[] = storiesQuery.data?.items ?? [];

  const continueStory = stories.find((story) => story.latestNarration != null);
  const continueNarration = continueStory?.latestNarration ?? null;
  const showEmptyState = storiesQuery.isSuccess && stories.length === 0;
  const hasError = meQuery.isError || childrenQuery.isError;

  const goCreate = () => router.push('/story/create' as never);
  // Category tiles start a FRESH draft so the tapped theme always lands in the
  // wizard (its one-time prefill would otherwise skip an in-session draft).
  const goCreateWithTheme = (theme: StoryTheme) => {
    useWizardStore.getState().reset();
    router.push(`/story/create?theme=${theme}` as never);
  };
  const openStory = (storyId: string) => router.push(`/story/${storyId}` as never);

  const retry = () => {
    void meQuery.refetch();
    void childrenQuery.refetch();
    void storiesQuery.refetch();
  };

  const header = (
    <LinearGradient
      colors={HEADER_WASH as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[styles.header, { paddingTop: Math.max(insets.top + 12, 56) }]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{t(greetingKey())}</Text>
          <Text style={styles.headline} accessibilityRole="header">
            {t('home.headline')}
          </Text>
        </View>
        {selectedChild != null ? (
          <Pressable
            onPress={() => setSwitcherVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('profile.childrenSection')}
            hitSlop={8}
            style={({ pressed }) => [styles.childChip, { opacity: pressed ? 0.8 : 1 }]}
          >
            <View style={styles.childAvatarRing}>
              <Avatar emoji={childAvatarEmoji(selectedChild.name)} size={44} kind="child" />
            </View>
            <Text style={styles.childChipName}>{selectedChild.name}</Text>
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );

  if (hasError) {
    return (
      <Screen withTabBar padded={false} style={styles.content}>
        {header}
        <ErrorState
          emoji="🌧️"
          title={t('errors.GENERIC')}
          ctaLabel={t('common.retry')}
          onCta={retry}
        />
      </Screen>
    );
  }

  return (
    <Screen withTabBar padded={false} style={styles.content}>
      {header}

      {/* Quota banner — between header and hero CTA (final design). */}
      {quotaVariant != null ? (
        <View style={styles.quotaSection}>
          <QuotaBanner
            variant={quotaVariant}
            remaining={Math.max(quotaRemaining ?? 0, 0)}
            onSeePremium={() => router.push('/subscription/paywall' as never)}
          />
        </View>
      ) : null}

      {/* Hero CTA */}
      <View style={styles.section}>
        <Pressable
          onPress={goCreate}
          accessibilityRole="button"
          accessibilityLabel={t('home.heroCta')}
          style={({ pressed }) => [
            styles.heroShadow,
            { transform: [{ scale: pressed ? 0.99 : 1 }] },
          ]}
        >
          <LinearGradient
            colors={gradients.homeHero as unknown as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroCircleLarge} />
            <View style={styles.heroCircleSmall} />
            <Text style={styles.heroSparkle}>✨</Text>
            <Text style={styles.heroStar}>⭐</Text>
            <Text style={styles.heroEyebrow}>
              {t('home.newStoryEyebrow').toLocaleUpperCase('tr-TR')}
            </Text>
            <Text style={styles.heroTitle}>
              {selectedChild != null
                ? t('home.heroTitle', { name: selectedChild.name })
                : t('home.heroTitleGeneric')}
            </Text>
            <View style={styles.heroPill}>
              <Text style={styles.heroPillEmoji}>✨</Text>
              <Text style={styles.heroPillLabel}>{t('home.heroCta')}</Text>
            </View>
          </LinearGradient>
        </Pressable>
      </View>

      {/* AI suggestions */}
      {selectedChild != null && recommendations.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title={t('home.suggestionsTitle', { name: selectedChild.name })}
            onSeeAll={() => router.push('/(tabs)/library' as never)}
          />
          <View style={styles.suggestionList}>
            {recommendations.map((suggestion) => {
              const firstTheme = suggestion.themes[0];
              return (
                <Pressable
                  key={suggestion.promptSeed}
                  onPress={goCreate}
                  accessibilityRole="button"
                  accessibilityLabel={suggestion.title}
                  style={({ pressed }) => [
                    styles.suggestionCard,
                    shadows.cardSubtle,
                    { opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <View style={styles.suggestionTile}>
                    <Text style={styles.suggestionEmoji}>{suggestion.emoji}</Text>
                  </View>
                  <View style={styles.suggestionTextWrap}>
                    <Text style={styles.suggestionTitle} numberOfLines={1}>
                      {suggestion.title}
                    </Text>
                    {firstTheme != null ? (
                      <Text style={styles.suggestionSub} numberOfLines={1}>
                        {t('home.suggestionTheme', { theme: t(`wizard.themes.${firstTheme}`) })}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRightIcon />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Continue listening — opens the player on the story's latest narration. */}
      {continueStory != null && continueNarration != null ? (
        <View style={styles.section}>
          <SectionHeader title={t('home.continueListening')} />
          <StoryCardWide
            story={continueStory}
            onPress={() =>
              router.push(
                `/story/${continueStory.id}/player?narrationId=${continueNarration.id}` as never,
              )
            }
          />
        </View>
      ) : null}

      {/* Recent stories carousel */}
      {stories.length > 0 ? (
        <View style={styles.carouselSection}>
          <View style={styles.carouselHeader}>
            <SectionHeader
              title={t('home.recentStories')}
              onSeeAll={() => router.push('/(tabs)/library' as never)}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContent}
          >
            {stories.map((story, index) => (
              <StoryCardVertical
                key={story.id}
                story={story}
                index={index}
                onPress={() => openStory(story.id)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {showEmptyState ? (
        <EmptyState
          emoji="📖"
          title={t('library.emptyTitle')}
          ctaLabel={t('library.emptyCta')}
          onCta={goCreate}
        />
      ) : null}

      {/* Tonight's categories */}
      <View style={styles.lastSection}>
        <SectionHeader title={t('home.tonightTitle')} />
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => (
            <Pressable
              key={category.key}
              onPress={() => goCreateWithTheme(category.theme)}
              accessibilityRole="button"
              accessibilityLabel={t(`home.categories.${category.key}`)}
              style={({ pressed }) => [
                styles.categoryTile,
                shadows.cardSubtle,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.categoryEmoji}>{category.emoji}</Text>
              <Text style={styles.categoryLabel}>{t(`home.categories.${category.key}`)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ChildSwitcherSheet visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  /* The header wash starts at the very top of the scroll — Screen's safe-area
     padding moves into the header itself. */
  content: { paddingTop: 0 },
  header: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.md,
  },
  quotaSection: { paddingHorizontal: spacing.pageX, marginBottom: spacing.md },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerText: { flex: 1, paddingRight: spacing.sm },
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
    lineHeight: 31,
    letterSpacing: -0.26,
  },
  childChip: { alignItems: 'center', gap: 4 },
  childAvatarRing: {
    borderRadius: radius.round,
    borderWidth: 2,
    borderColor: colors.card,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  childChipName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  section: { paddingHorizontal: spacing.pageX, marginBottom: spacing.xl },
  heroShadow: { borderRadius: radius.hero, ...shadows.hero },
  heroCard: {
    borderRadius: radius.hero,
    paddingVertical: 28,
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  heroCircleLarge: {
    position: 'absolute',
    right: -20,
    top: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroCircleSmall: {
    position: 'absolute',
    right: 30,
    bottom: -30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroSparkle: { position: 'absolute', top: 16, right: 20, fontSize: 20, opacity: 0.8 },
  heroStar: { position: 'absolute', bottom: 16, right: 60, fontSize: 14, opacity: 0.6 },
  heroEyebrow: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.72,
    marginBottom: spacing.xs,
  },
  heroTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: colors.primaryForeground,
    lineHeight: 29,
    maxWidth: 200,
    marginBottom: spacing.lg,
  },
  heroPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
  },
  heroPillEmoji: { fontSize: 16 },
  heroPillLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  suggestionList: { gap: spacing.xs },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionTile: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionEmoji: { fontSize: 20 },
  suggestionTextWrap: { flex: 1 },
  suggestionTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
    marginBottom: 2,
  },
  suggestionSub: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  carouselSection: { marginBottom: spacing.xl },
  carouselHeader: { paddingHorizontal: spacing.pageX },
  carouselContent: { paddingHorizontal: spacing.pageX, gap: spacing.sm },
  lastSection: { paddingHorizontal: spacing.pageX, paddingBottom: spacing.xs },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  categoryTile: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    gap: 6,
  },
  categoryEmoji: { fontSize: 22 },
  categoryLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.foreground,
    textAlign: 'center',
  },
});
