import { useEffect, useRef, useState } from 'react';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@masalim/api-client';
import { AIJobStatus, BookPageLayout, BookStatus } from '@masalim/types';
import type { BookPage } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, gradients, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { Button } from '../../../src/components/Button';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { ErrorState } from '../../../src/components/states';

type PreviewSlide =
  | { key: string; kind: 'cover' }
  | { key: string; kind: 'dedication' }
  | { key: string; kind: 'page'; page: BookPage }
  | { key: string; kind: 'back' };

/**
 * Digital book preview (§31/§34): triggers a digital_preview render when the
 * book is a fresh DRAFT (real job progress via SSE/polling), then shows a
 * swipeable native page-by-page mockup built from the book data. The print
 * CTA hands off to the checkout configurator.
 */
export default function BookPreview() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [slideIndex, setSlideIndex] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const triggeredRef = useRef(false);

  const bookQuery = useQuery({
    queryKey: ['book', id],
    queryFn: () => api.books.get(id),
    enabled: id != null && id.length > 0,
    // While the server renders (e.g. re-entering without a job id) keep the status fresh.
    refetchInterval: (query) =>
      query.state.data?.status === BookStatus.RENDERING ? 2_500 : false,
  });
  const book = bookQuery.data;

  const job = useJobProgress(jobId ?? undefined);
  const jobFailed = job.status === AIJobStatus.FAILED || job.status === AIJobStatus.CANCELLED;

  const renderMutation = useMutation({
    mutationFn: () => api.books.render(id, { kind: 'digital_preview' }),
    onSuccess: async ({ jobId: newJobId }) => {
      setJobId(newJobId);
      await queryClient.invalidateQueries({ queryKey: ['book', id] });
      await queryClient.invalidateQueries({ queryKey: ['books'] });
    },
  });

  // A DRAFT book has no fresh preview — kick off the render once on mount.
  useEffect(() => {
    if (book == null || triggeredRef.current) return;
    if (book.status === BookStatus.DRAFT) {
      triggeredRef.current = true;
      renderMutation.mutate();
    }
  }, [book, renderMutation]);

  // Terminal job → refetch so the READY book (or failure) is reflected.
  useEffect(() => {
    if (
      job.status === AIJobStatus.SUCCEEDED ||
      job.status === AIJobStatus.FAILED ||
      job.status === AIJobStatus.CANCELLED
    ) {
      void queryClient.invalidateQueries({ queryKey: ['book', id] });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
    }
  }, [job.status, queryClient, id]);

  const paddingTop = Math.max(insets.top, 20) + 8;

  if (bookQuery.isPending) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (bookQuery.isError || book == null) {
    const message =
      bookQuery.error instanceof ApiError
        ? t(`errors.${bookQuery.error.code}`, { defaultValue: t('errors.GENERIC') })
        : t('errors.OFFLINE');
    return (
      <View style={[styles.root, styles.padded, { paddingTop }]}>
        <ScreenHeader title={t('book.previewTitle')} />
        <ErrorState
          emoji="🌧️"
          title={message}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void bookQuery.refetch();
          }}
        />
      </View>
    );
  }

  // Render failure (job or trigger call) → mapped error + retry.
  if (jobFailed || renderMutation.isError) {
    const message =
      jobFailed && job.errorCode != null
        ? t(`errors.${job.errorCode}`, { defaultValue: t('errors.BOOK_RENDER_FAILED') })
        : renderMutation.error instanceof ApiError
          ? t(`errors.${renderMutation.error.code}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.BOOK_RENDER_FAILED');
    return (
      <View style={[styles.root, styles.padded, { paddingTop }]}>
        <ScreenHeader title={t('book.previewTitle')} />
        <ErrorState
          emoji="🌧️"
          title={message}
          ctaLabel={t('common.retry')}
          onCta={() => {
            setJobId(null);
            renderMutation.reset();
            renderMutation.mutate();
          }}
        />
      </View>
    );
  }

  // DRAFT auto-triggers a render, so anything not READY is "preparing".
  const jobActive = jobId != null && job.status !== AIJobStatus.SUCCEEDED;
  const preparing =
    renderMutation.isPending || jobActive || book.status !== BookStatus.READY;

  if (preparing) {
    const percent = Math.round(Math.min(Math.max(job.progress, 0), 100));
    return (
      <View style={[styles.root, styles.padded, { paddingTop }]}>
        <ScreenHeader title={t('book.previewTitle')} />
        <View style={styles.progressBlock}>
          <Text style={styles.progressEmoji}>📖</Text>
          <Text style={styles.progressTitle}>{t('book.renderPreparing')}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percent}%` }]}>
              <LinearGradient
                colors={gradients.progress as unknown as [string, string]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>
          {percent > 0 ? (
            <Text style={styles.progressPercent}>%{percent}</Text>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  const pages = [...book.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  const slides: PreviewSlide[] = [
    { key: 'cover', kind: 'cover' },
    ...(book.dedication != null && book.dedication.trim().length > 0
      ? [{ key: 'dedication', kind: 'dedication' as const }]
      : []),
    ...pages.map((page) => ({ key: page.id, kind: 'page' as const, page })),
    { key: 'back', kind: 'back' },
  ];

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setSlideIndex(Math.min(Math.max(index, 0), slides.length - 1));
  };

  const renderPage = (page: BookPage) => {
    if (page.layout === BookPageLayout.IMAGE_FULL) {
      return (
        <View style={[styles.pageCard, shadows.cardMedium]}>
          {page.imageUrl != null ? (
            <Image
              source={{ uri: page.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
              <Text style={styles.imageFallbackEmoji}>🎨</Text>
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(26,15,60,0.75)'] as [string, string]}
            style={styles.fullScrim}
          />
          <View style={styles.fullTextBlock}>
            <Text style={styles.fullText} numberOfLines={8}>
              {page.text}
            </Text>
            <Text style={styles.fullPageNumber}>{page.pageNumber}</Text>
          </View>
        </View>
      );
    }

    if (page.layout === BookPageLayout.TEXT_ONLY) {
      return (
        <View style={[styles.pageCard, shadows.cardMedium]}>
          <ScrollView
            contentContainerStyle={styles.textOnlyWrap}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.textOnlyStar}>✦</Text>
            <Text style={styles.textOnlyText}>{page.text}</Text>
          </ScrollView>
          <Text style={styles.pageNumber}>{page.pageNumber}</Text>
        </View>
      );
    }

    // IMAGE_TOP (default)
    return (
      <View style={[styles.pageCard, shadows.cardMedium]}>
        <View style={styles.pageImageTop}>
          {page.imageUrl != null ? (
            <Image
              source={{ uri: page.imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.imageFallback]}>
              <Text style={styles.imageFallbackEmoji}>🎨</Text>
            </View>
          )}
        </View>
        <ScrollView
          style={styles.pageTextScroll}
          contentContainerStyle={styles.pageTextWrap}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.pageText}>{page.text}</Text>
        </ScrollView>
        <Text style={styles.pageNumber}>{page.pageNumber}</Text>
      </View>
    );
  };

  const renderSlide = ({ item }: { item: PreviewSlide }) => {
    if (item.kind === 'cover') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={[styles.pageCard, shadows.cardMedium]}>
            {book.coverImageUrl != null ? (
              <Image
                source={{ uri: book.coverImageUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <LinearGradient
                colors={gradients.storyCover as unknown as [string, string, ...string[]]}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(26,15,60,0.8)'] as [string, string]}
              style={styles.fullScrim}
            />
            <View style={styles.coverTextBlock}>
              <Text style={styles.coverTitle}>{book.title}</Text>
              {book.subtitle != null && book.subtitle.trim().length > 0 ? (
                <Text style={styles.coverSubtitle}>{book.subtitle}</Text>
              ) : null}
            </View>
          </View>
        </View>
      );
    }

    if (item.kind === 'dedication') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={[styles.pageCard, styles.dedicationCard, shadows.cardMedium]}>
            <Text style={styles.dedicationText}>“{book.dedication}”</Text>
          </View>
        </View>
      );
    }

    if (item.kind === 'back') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={[styles.pageCard, styles.backCard, shadows.cardMedium]}>
            {book.backCoverText != null && book.backCoverText.trim().length > 0 ? (
              <Text style={styles.backText}>{book.backCoverText}</Text>
            ) : null}
            <View style={styles.brandBlock}>
              <Text style={styles.brandMoon}>🌙</Text>
              <Text style={styles.brandName}>{t('common.appName')}</Text>
              <Text style={styles.brandTagline}>{t('common.tagline')}</Text>
            </View>
          </View>
        </View>
      );
    }

    return <View style={[styles.slide, { width }]}>{renderPage(item.page)}</View>;
  };

  return (
    <View style={[styles.root, { paddingTop }]}>
      <View style={styles.headerWrap}>
        <ScreenHeader title={t('book.previewTitle')} />
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
        style={styles.flex}
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.indicatorText}>
          {t('reader.pageOf', { current: slideIndex + 1, total: slides.length })}
        </Text>
        <Button
          label={t('book.printCta')}
          onPress={() => router.push(`/checkout/${book.id}/configure` as never)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingHorizontal: spacing.pageX },
  headerWrap: { paddingHorizontal: spacing.pageX },

  progressBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  progressEmoji: { fontSize: 48 },
  progressTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    maxWidth: 280,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  progressPercent: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
  },

  slide: { paddingHorizontal: spacing.pageX, paddingBottom: spacing.md },
  pageCard: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },

  coverTextBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.xl,
    gap: 6,
  },
  coverTitle: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.display,
    lineHeight: 34,
    letterSpacing: -0.3,
    color: colors.primaryForeground,
  },
  coverSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: 'rgba(255,255,255,0.85)',
  },

  dedicationCard: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  dedicationText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.h3,
    lineHeight: 32,
    color: colors.foreground,
    textAlign: 'center',
  },

  pageImageTop: { height: '45%', backgroundColor: colors.muted },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  imageFallbackEmoji: { fontSize: 40 },
  pageTextScroll: { flex: 1 },
  pageTextWrap: { padding: spacing.lg },
  pageText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xl,
    lineHeight: 26,
    color: colors.foreground,
  },
  pageNumber: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },

  fullScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  fullTextBlock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  fullText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xl,
    lineHeight: 26,
    color: colors.primaryForeground,
  },
  fullPageNumber: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

  textOnlyWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
  },
  textOnlyStar: { fontSize: fontSizes.h4, color: colors.lavender },
  textOnlyText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xxl,
    lineHeight: 30,
    color: colors.foreground,
    textAlign: 'center',
  },

  backCard: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  backText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.h4,
    lineHeight: 28,
    color: colors.foreground,
    textAlign: 'center',
  },
  brandBlock: { position: 'absolute', bottom: spacing.xl, alignItems: 'center', gap: 2 },
  brandMoon: { fontSize: fontSizes.h4 },
  brandName: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  brandTagline: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },

  footer: {
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.xs,
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  indicatorText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
