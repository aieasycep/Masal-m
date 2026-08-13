import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@masalim/api-client';
import { StoryStatus } from '@masalim/types';
import type { StoryPage } from '@masalim/validation';
import { colors, coverTints, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { Button } from '../../../src/components/Button';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { storyThemeEmoji } from '../../../src/components/StorySheet';
import { ErrorState } from '../../../src/components/states';
import { api } from '../../../src/lib/api';

type ReaderSlide = { key: string; kind: 'page'; page: StoryPage } | { key: 'end'; kind: 'end' };

/** Digital storybook reader: one horizontally-paged spread per story page. */
export default function Reader() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [pageIndex, setPageIndex] = useState(0);

  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled: id != null && id.length > 0,
  });
  const story = storyQuery.data;

  const paddingTop = Math.max(insets.top, 20) + 8;

  if (storyQuery.isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (storyQuery.isError || story == null) {
    const errorTitle =
      storyQuery.error instanceof ApiError
        ? t(`errors.${storyQuery.error.code}`, { defaultValue: t('errors.GENERIC') })
        : t('errors.GENERIC');
    return (
      <View style={[styles.root, styles.padded, { paddingTop }]}>
        <ScreenHeader />
        <ErrorState
          emoji="🌧️"
          title={errorTitle}
          ctaLabel={t('common.retry')}
          onCta={() => void storyQuery.refetch()}
        />
      </View>
    );
  }

  const pages = [...story.pages].sort((a, b) => a.pageNumber - b.pageNumber);

  if (story.status !== StoryStatus.READY || pages.length === 0) {
    return (
      <View style={[styles.root, styles.padded, { paddingTop }]}>
        <ScreenHeader title={story.title} />
        <ErrorState
          emoji="📖"
          title={t('errors.STORY_NOT_READY')}
          ctaLabel={t('common.back')}
          onCta={() => router.back()}
        />
      </View>
    );
  }

  const slides: ReaderSlide[] = [
    ...pages.map((page) => ({ key: page.id, kind: 'page' as const, page })),
    { key: 'end', kind: 'end' as const },
  ];

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setPageIndex(Math.min(Math.max(index, 0), slides.length - 1));
  };

  const renderSlide = ({ item }: { item: ReaderSlide }) => {
    if (item.kind === 'end') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={styles.endWrap}>
            <Text style={styles.endStar}>⭐</Text>
            <Text style={styles.endTitle}>{t('reader.theEnd')}</Text>
            <Button
              label={t('common.done')}
              onPress={() => router.back()}
              style={styles.endButton}
              compact
            />
          </View>
        </View>
      );
    }

    const { page } = item;
    const tint = coverTints[page.pageNumber % coverTints.length] ?? coverTints[0];
    return (
      <View style={[styles.slide, { width }]}>
        <View style={styles.illustration}>
          {page.illustrationUrl != null ? (
            <Image
              source={{ uri: page.illustrationUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <LinearGradient
              colors={[tint, colors.warmWhite] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[StyleSheet.absoluteFill, styles.illustrationFallback]}
            >
              <Text style={styles.illustrationEmoji}>{storyThemeEmoji(story.themes)}</Text>
            </LinearGradient>
          )}
        </View>
        <ScrollView
          style={styles.textScroll}
          contentContainerStyle={styles.textContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageText}>{page.text}</Text>
        </ScrollView>
      </View>
    );
  };

  const showIndicator = pageIndex < pages.length;

  return (
    <View style={[styles.root, { paddingTop }]}>
      <View style={styles.headerWrap}>
        <ScreenHeader title={story.title} />
      </View>
      <FlatList
        data={slides}
        keyExtractor={(item) => item.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />
      {showIndicator ? (
        <View
          style={[styles.indicatorWrap, { bottom: Math.max(insets.bottom, 16) + 8 }]}
          pointerEvents="none"
        >
          <View style={[styles.indicator, shadows.cardSubtle]}>
            <Text style={styles.indicatorText}>
              {t('reader.pageOf', { current: pageIndex + 1, total: pages.length })}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingHorizontal: spacing.pageX },
  headerWrap: { paddingHorizontal: spacing.pageX },
  slide: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: 52,
  },
  illustration: {
    flex: 9,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  illustrationFallback: { alignItems: 'center', justifyContent: 'center' },
  illustrationEmoji: { fontSize: 64 },
  textScroll: { flex: 11 },
  textContent: { paddingTop: spacing.lg, paddingBottom: spacing.xl },
  pageText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xxl,
    lineHeight: 28,
    color: colors.foreground,
  },
  endWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  endStar: { fontSize: 28 },
  endTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h2,
    color: colors.foreground,
    textAlign: 'center',
  },
  endButton: { alignSelf: 'stretch', marginTop: spacing.lg },
  indicatorWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  indicator: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.round,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  indicatorText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
});
