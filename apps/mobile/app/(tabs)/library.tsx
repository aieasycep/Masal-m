import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { TFunction } from 'i18next';
import { NetworkError } from '@masalim/api-client';
import { DURATION_TARGETS, StoryStatus } from '@masalim/types';
import type { ListStoriesQuery, StorySummary } from '@masalim/validation';
import { colors, coverTints, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { DEFAULT_AVATAR_EMOJI } from '../../src/components/AvatarEmojiPicker';
import { Badge } from '../../src/components/Badge';
import { Input } from '../../src/components/Input';
import { StorySheet, storyThemeEmoji } from '../../src/components/StorySheet';
import { KebabIcon, PlayIcon, SearchIcon } from '../../src/components/icons';
import { LoadingState } from '../../src/components/LoadingState';
import { EmptyState, ErrorState } from '../../src/components/states';
import { api } from '../../src/lib/api';

type LibraryFilter = ListStoriesQuery['filter'];

const FILTERS: LibraryFilter[] = ['all', 'audio', 'books', 'favorites'];

const DAY_MS = 86_400_000;

/** Relative creation date per the design ("Bugün", "Dün", "3 gün önce"…). */
function relativeDate(t: TFunction, iso: string): string {
  const created = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(created)) / DAY_MS);
  if (days <= 0) return t('library.dates.today');
  if (days === 1) return t('library.dates.yesterday');
  if (days < 7) return t('library.dates.daysAgo', { count: days });
  if (days < 31) return t('library.dates.weeksAgo', { count: Math.max(1, Math.floor(days / 7)) });
  if (days < 366) return t('library.dates.monthsAgo', { count: Math.max(1, Math.floor(days / 30)) });
  return created.toLocaleDateString('tr-TR');
}

/** Subtle pulsing "…" shown in place of the play button while generating. */
function GeneratingPulse() {
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={[styles.playCircle, styles.generatingCircle]}>
      <Animated.Text style={[styles.generatingDots, pulseStyle]}>…</Animated.Text>
    </View>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

/** Filter pill: purple fill + white label when active, white card otherwise. */
function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active ? [styles.chipActive, shadows.selectedCard] : styles.chipInactive]}
    >
      <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{label}</Text>
    </Pressable>
  );
}

interface StoryRowProps {
  story: StorySummary;
  index: number;
  onPress: () => void;
  onMore: () => void;
}

/** Library row card: 72×90 cover tile, title/meta/themes, badges, date + play. */
function StoryRow({ story, index, onPress, onMore }: StoryRowProps) {
  const { t } = useTranslation();
  const tint = coverTints[index % coverTints.length] ?? coverTints[0];
  const latestNarration = story.latestNarration;
  const duration = t('common.minutesShort', {
    count: DURATION_TARGETS[story.durationTarget].minutes,
  });
  const metaParts = [story.childName ?? story.heroName, duration];
  if (latestNarration != null) metaParts.push(latestNarration.narratorName);
  const themesLabel = story.themes
    .slice(0, 2)
    .map((theme) => t(`wizard.themes.${theme}`))
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMore}
      accessibilityRole="button"
      accessibilityLabel={story.title}
      style={({ pressed }) => [styles.rowCard, shadows.cardSubtle, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={[styles.cover, { backgroundColor: tint }]}>
        {story.coverImageUrl != null ? (
          <Image
            source={{ uri: story.coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.coverEmoji}>{storyThemeEmoji(story.themes)}</Text>
        )}
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {story.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {metaParts.join(' · ')}
        </Text>
        {themesLabel.length > 0 ? (
          <Text style={styles.rowThemes} numberOfLines={1}>
            {themesLabel}
          </Text>
        ) : null}
        {story.latestNarration != null || story.hasBook ? (
          <View style={styles.badgeRow}>
            {story.latestNarration != null ? (
              <Badge label={story.latestNarration.narratorName} variant="personal" />
            ) : null}
            {story.hasBook ? <Badge label={t('library.badgeBookReady')} variant="primary" /> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.rowRight}>
        <Text style={styles.rowDate}>{relativeDate(t, story.createdAt)}</Text>
        <View style={styles.rowRightBottom}>
          {story.status === StoryStatus.GENERATING ? (
            <GeneratingPulse />
          ) : story.status === StoryStatus.FAILED ? (
            <View style={styles.failedDot} />
          ) : latestNarration != null ? (
            <Pressable
              onPress={() =>
                router.push(
                  `/story/${story.id}/player?narrationId=${latestNarration.id}` as never,
                )
              }
              accessibilityRole="button"
              accessibilityLabel={t('library.actions.listen')}
              hitSlop={6}
              style={({ pressed }) => [styles.playCircle, { opacity: pressed ? 0.7 : 1 }]}
            >
              <PlayIcon size={12} color={colors.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onMore}
            accessibilityRole="button"
            hitSlop={8}
            style={({ pressed }) => [styles.kebab, { opacity: pressed ? 0.6 : 1 }]}
          >
            <KebabIcon />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/** Library tab — pixel pass from docs/design-reference Library.tsx. */
export default function Library() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [childFilter, setChildFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [sheetStory, setSheetStory] = useState<StorySummary | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const childrenQuery = useQuery({ queryKey: ['children'], queryFn: () => api.children.list() });

  const storiesQuery = useInfiniteQuery({
    queryKey: ['stories', { filter, childId: childFilter, search: debouncedSearch }],
    queryFn: ({ pageParam }) =>
      api.stories.list({
        page: pageParam,
        filter,
        childId: childFilter ?? undefined,
        search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.meta.page < lastPage.meta.totalPages ? lastPage.meta.page + 1 : undefined,
  });

  const storiesData = storiesQuery.data;
  const stories = useMemo(
    () => storiesData?.pages.flatMap((page) => page.items) ?? [],
    [storiesData],
  );
  const totalItems = storiesData?.pages[0]?.meta.totalItems ?? stories.length;
  const childCount = childrenQuery.data?.length ?? 0;

  const openStory = (storyId: string) => router.push(`/story/${storyId}` as never);
  const goCreate = () => router.push('/story/create' as never);

  const loadMore = () => {
    if (storiesQuery.hasNextPage && !storiesQuery.isFetchingNextPage) {
      void storiesQuery.fetchNextPage();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([storiesQuery.refetch(), childrenQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const isDefaultView =
    filter === 'all' && childFilter == null && debouncedSearch.length === 0;
  const childList = childrenQuery.data ?? [];

  const header = (
    <View>
      <Text style={styles.title} accessibilityRole="header">
        {t('library.title')}
      </Text>
      <Text style={styles.subtitle}>
        {t('library.subtitle', { storyCount: totalItems, childCount })}
      </Text>

      <View style={styles.searchWrap}>
        <View style={styles.searchIcon} pointerEvents="none">
          <SearchIcon />
        </View>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder={t('library.searchPlaceholder')}
          accessibilityLabel={t('common.search')}
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {FILTERS.map((value) => (
          <FilterChip
            key={value}
            label={t(`library.filters.${value}`)}
            active={filter === value}
            onPress={() => setFilter(value)}
          />
        ))}
      </ScrollView>

      {childList.length >= 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.chips, styles.childChips]}
        >
          <FilterChip
            label={t('library.allChildren')}
            active={childFilter == null}
            onPress={() => setChildFilter(null)}
          />
          {childList.map((child) => (
            <FilterChip
              key={child.id}
              label={`${child.preferences.avatarEmoji ?? DEFAULT_AVATAR_EMOJI} ${child.name}`}
              active={childFilter === child.id}
              onPress={() => setChildFilter(childFilter === child.id ? null : child.id)}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const listEmpty = storiesQuery.isLoading ? (
    <View style={styles.skeletonBleed}>
      <LoadingState variant="list" />
    </View>
  ) : storiesQuery.isError ? (
    <ErrorState
      kind={storiesQuery.error instanceof NetworkError ? 'network' : 'server'}
      onRetry={() => void storiesQuery.refetch()}
    />
  ) : isDefaultView ? (
    <EmptyState
      emoji="📚"
      title={t('library.emptyTitle')}
      body={t('library.emptyLibraryBody')}
      ctaLabel={t('library.emptyCta')}
      onCta={goCreate}
    />
  ) : filter === 'favorites' ? (
    <EmptyState
      variant="card"
      emoji="🤍"
      title={t('library.noFavoritesTitle')}
      body={t('library.noFavoritesBody')}
    />
  ) : (
    <EmptyState
      variant="card"
      emoji="🔍"
      title={t('library.noResultsTitle')}
      body={t('library.noResultsBody')}
    />
  );

  const footer = storiesQuery.isFetchingNextPage ? (
    <View style={styles.footerLoading}>
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : null;

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
      <FlatList
        data={stories}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <StoryRow
            story={item}
            index={index}
            onPress={() => openStory(item.id)}
            onMore={() => setSheetStory(item)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={footer}
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
      <StorySheet story={sheetStory} onClose={() => setSheetStory(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  listContent: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.tabBarClearance,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayLg,
    color: colors.foreground,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    marginBottom: spacing.md,
  },
  searchWrap: { marginBottom: 14 },
  searchIcon: {
    position: 'absolute',
    left: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    zIndex: 1,
  },
  searchInput: {
    paddingLeft: 40,
    paddingVertical: 14,
    fontSize: fontSizes.lg,
  },
  chips: { flexDirection: 'row', gap: spacing.xs, paddingBottom: 18 },
  childChips: { paddingBottom: 18, marginTop: -6 },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 18,
    borderRadius: radius.chip,
  },
  chipActive: { backgroundColor: colors.primary },
  chipInactive: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },
  chipLabelActive: { color: colors.primaryForeground },
  rowCard: {
    flexDirection: 'row',
    gap: 14,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: {
    width: 72,
    height: 90,
    borderRadius: radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverEmoji: { fontSize: 32 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    color: colors.foreground,
    lineHeight: 21,
    marginBottom: 4,
  },
  rowMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  rowThemes: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    opacity: 0.7,
    marginBottom: spacing.xs,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  rowDate: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  rowRightBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  playCircle: {
    width: 44,
    height: 44,
    borderRadius: radius.round,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatingCircle: { backgroundColor: colors.muted },
  generatingDots: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    lineHeight: 16,
  },
  failedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.destructive,
    opacity: 0.45,
    marginHorizontal: spacing.sm,
  },
  kebab: {
    width: 24,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Cancels the list gutter so LoadingState's own pageX padding aligns skeletons with rows. */
  skeletonBleed: { marginHorizontal: -spacing.pageX },
  footerLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
});
