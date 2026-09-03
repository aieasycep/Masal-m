import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@masalim/api-client';
import { AIJobStatus, BookPageLayout, BookStatus } from '@masalim/types';
import type { BookPage } from '@masalim/validation';
import {
  colors,
  coverPalettes,
  fontFamilies,
  night,
  fontSizes,
  gradients,
  premiumGold,
  radius,
  spacing,
  type CoverPaletteKey,
} from '@masalim/ui';
import { AppIcon } from '../../../src/components/AppIcon';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { Button } from '../../../src/components/Button';
import { ChevronLeftIcon, ChevronRightIcon } from '../../../src/components/icons';

/** Design `Book/03-Preview` dark mockup background — a design literal that is
 *  not part of the @masalim/ui palette (night.bg is a different blue). */
const PREVIEW_BG = '#1A1A2E';
/** Fixed book-page canvas size from the design. */
const PAGE_W = 270;
const PAGE_H = 360;
/** Decorative star particles on the gradient (cover/back) pages. */
const STAR_DOTS = [
  { x: '15%', y: '12%', s: 3 },
  { x: '80%', y: '18%', s: 2 },
  { x: '70%', y: '75%', s: 3 },
  { x: '20%', y: '80%', s: 2 },
  { x: '90%', y: '45%', s: 2 },
] as const;

type PreviewSlide =
  | { key: string; kind: 'cover' }
  | { key: string; kind: 'page'; page: BookPage }
  | { key: string; kind: 'back' };

/** Star particle overlay for the gradient book pages. */
function StarDots() {
  return (
    <>
      {STAR_DOTS.map((dot, index) => (
        <View
          key={index}
          style={[styles.starDot, { left: dot.x, top: dot.y, width: dot.s, height: dot.s }]}
        />
      ))}
    </>
  );
}

/**
 * Digital book preview (§31/§34, design `Book/03-Preview`): triggers a
 * digital_preview render when the book is a fresh DRAFT (real job progress via
 * SSE/polling), then shows a dark page-by-page book mockup — spine, page dots,
 * prev/next — built from the real book data. The print CTA hands off to
 * checkout (address step first).
 */
export default function BookPreview() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [slideIndex, setSlideIndex] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [printSoonNote, setPrintSoonNote] = useState(false);
  const triggeredRef = useRef(false);
  const listRef = useRef<FlatList<PreviewSlide>>(null);

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

  const header = (counter?: string) => (
    <View style={styles.headerRow}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        style={styles.backCircle}
      >
        <ChevronLeftIcon color="#FFFFFF" />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {t('book.previewTitle')}
      </Text>
      {counter != null ? <Text style={styles.headerCounter}>{counter}</Text> : null}
    </View>
  );

  if (bookQuery.isPending) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#FFFFFF" accessibilityLabel={t('common.loading')} />
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
        {header()}
        <View style={styles.stateFill}>
          <Text style={styles.stateEmoji}>🌧️</Text>
          <Text style={styles.stateTitle}>{message}</Text>
          <Button
            label={t('common.retry')}
            onPress={() => {
              void bookQuery.refetch();
            }}
            style={styles.stateButton}
          />
        </View>
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
        {header()}
        <View style={styles.stateFill}>
          <Text style={styles.stateEmoji}>🌧️</Text>
          <Text style={styles.stateTitle}>{message}</Text>
          <Button
            label={t('common.retry')}
            onPress={() => {
              setJobId(null);
              renderMutation.reset();
              renderMutation.mutate();
            }}
            style={styles.stateButton}
          />
        </View>
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
        {header()}
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
            <ActivityIndicator color={colors.purpleSoft} />
          )}
        </View>
      </View>
    );
  }

  const pages = [...book.pages].sort((a, b) => a.pageNumber - b.pageNumber);
  // Dedication lives on the front cover (design) — no separate dedication slide.
  const slides: PreviewSlide[] = [
    { key: 'cover', kind: 'cover' },
    ...pages.map((page) => ({ key: page.id, kind: 'page' as const, page })),
    { key: 'back', kind: 'back' },
  ];

  const paletteKey: CoverPaletteKey =
    book.coverPalette != null && book.coverPalette in coverPalettes
      ? (book.coverPalette as CoverPaletteKey)
      : 'purple';

  const goToSlide = (index: number) => {
    const next = Math.min(Math.max(index, 0), slides.length - 1);
    setSlideIndex(next);
    listRef.current?.scrollToIndex({ index: next, animated: true });
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / width);
    setSlideIndex(Math.min(Math.max(index, 0), slides.length - 1));
  };

  const slideLabel = (slide: PreviewSlide | undefined): string => {
    if (slide == null || slide.kind === 'cover') return t('book.frontCoverLabel');
    if (slide.kind === 'back') return t('book.backCoverPageLabel');
    return t('book.pageLabel', { number: slide.page.pageNumber });
  };

  const renderPage = (page: BookPage) => {
    if (page.layout === BookPageLayout.IMAGE_FULL) {
      return (
        <View style={[styles.pageCard, styles.pageShadow]}>
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
            <Text style={styles.fullText} numberOfLines={6}>
              {page.text}
            </Text>
          </View>
          <Text style={styles.pageNumberLight}>{page.pageNumber}</Text>
          <View style={[styles.spine, styles.spineDark]} />
        </View>
      );
    }

    if (page.layout === BookPageLayout.TEXT_ONLY) {
      return (
        <View style={[styles.pageCard, styles.pageCardLight, styles.pageShadow]}>
          <ScrollView
            contentContainerStyle={styles.textOnlyWrap}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.textOnlyStar}>✦</Text>
            <Text style={styles.textOnlyText}>{page.text}</Text>
          </ScrollView>
          <Text style={styles.pageNumberDark}>{page.pageNumber}</Text>
          <View style={[styles.spine, styles.spineLight]} />
        </View>
      );
    }

    // IMAGE_TOP (default)
    return (
      <View style={[styles.pageCard, styles.pageCardLight, styles.pageShadow]}>
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
        <Text style={styles.pageNumberDark}>{page.pageNumber}</Text>
        <View style={[styles.spine, styles.spineLight]} />
      </View>
    );
  };

  const renderSlide = ({ item }: { item: PreviewSlide }) => {
    if (item.kind === 'cover') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={[styles.pageCard, styles.pageShadow]}>
            <LinearGradient
              colors={coverPalettes[paletteKey] as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <StarDots />
            {book.coverImageUrl != null ? (
              <>
                <Image
                  source={{ uri: book.coverImageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
                <LinearGradient
                  colors={['transparent', 'rgba(26,15,60,0.85)'] as [string, string]}
                  style={styles.fullScrim}
                />
              </>
            ) : null}
            <View
              style={book.coverImageUrl != null ? styles.coverBottomBlock : styles.coverCenterBlock}
            >
              {book.coverImageUrl == null ? <Text style={styles.coverEmoji}>⭐</Text> : null}
              <Text style={styles.coverTitle} numberOfLines={3}>
                {book.title}
              </Text>
              {book.subtitle != null && book.subtitle.trim().length > 0 ? (
                <Text style={styles.coverSubtitle} numberOfLines={2}>
                  {book.subtitle}
                </Text>
              ) : null}
              {book.dedication != null && book.dedication.trim().length > 0 ? (
                <Text style={styles.coverDedication} numberOfLines={2}>
                  {book.dedication}
                </Text>
              ) : null}
            </View>
            <View style={[styles.spine, styles.spineDark]} />
          </View>
        </View>
      );
    }

    if (item.kind === 'back') {
      return (
        <View style={[styles.slide, { width }]}>
          <View style={[styles.pageCard, styles.pageShadow]}>
            <LinearGradient
              colors={[PREVIEW_BG, colors.purpleDeep] as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <StarDots />
            <View style={styles.backCenter}>
              <Text style={styles.backEmoji}>📚</Text>
              <Text style={styles.backQuote} numberOfLines={6}>
                {book.backCoverText != null && book.backCoverText.trim().length > 0
                  ? book.backCoverText
                  : t('book.backQuote')}
              </Text>
              <View style={styles.backDivider} />
              <Text style={styles.backBrand}>{t('common.appName').toLocaleUpperCase('tr')}</Text>
            </View>
            <View style={[styles.spine, styles.spineDark]} />
          </View>
        </View>
      );
    }

    return <View style={[styles.slide, { width }]}>{renderPage(item.page)}</View>;
  };

  return (
    <View style={[styles.root, { paddingTop }]}>
      <View style={styles.padded}>{header(`${slideIndex + 1}/${slides.length}`)}</View>

      <View style={styles.canvasWrap}>
        <FlatList
          ref={listRef}
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
        {slideIndex > 0 ? (
          <Pressable
            onPress={() => goToSlide(slideIndex - 1)}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={[styles.navCircle, styles.navLeft]}
          >
            <ChevronLeftIcon size={16} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        ) : null}
        {slideIndex < slides.length - 1 ? (
          <Pressable
            onPress={() => goToSlide(slideIndex + 1)}
            accessibilityRole="button"
            accessibilityLabel={slideLabel(slides[slideIndex + 1])}
            style={[styles.navCircle, styles.navRight]}
          >
            <ChevronRightIcon size={16} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>

      {/* Page dots + label. */}
      <View style={styles.dotsRow}>
        {slides.map((slide, index) => (
          <Pressable
            key={slide.key}
            onPress={() => goToSlide(index)}
            accessibilityRole="button"
            accessibilityLabel={slideLabel(slide)}
            hitSlop={6}
            style={[styles.dot, index === slideIndex && styles.dotActive]}
          />
        ))}
      </View>
      <Text style={styles.pageLabel}>{slideLabel(slides[slideIndex])}</Text>

      {/* CTA stack. Launch decision (Sep 2026): print ordering is "Yakında" —
          the CTA shows the coming-soon note instead of entering checkout (the
          API refuses orders too while the physical_books flag is off). */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + spacing.xs }]}>
        {printSoonNote ? (
          <Animated.Text entering={FadeInUp.duration(220)} style={styles.printSoonNote}>
            {t('book.printSoonBody')}
          </Animated.Text>
        ) : null}
        <Pressable
          onPress={() => setPrintSoonNote(true)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.printCta,
            styles.printShadow,
            { opacity: pressed ? 0.92 : 1 },
          ]}
        >
          <LinearGradient
            // Design coral CTA #F0A56E→#F08B6E == premiumGold.mid → colors.coral.
            colors={[premiumGold.mid, colors.coral] as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.printGradient}
          >
            <View style={styles.printIcon}>
              <AppIcon name="printer" size={18} color={colors.primaryForeground} />
            </View>
            <Text style={styles.printText}>{t('book.printCta')}</Text>
            <View style={styles.printSoonBadge}>
              <Text style={styles.printSoonBadgeText}>{t('book.printSoonBadge')}</Text>
            </View>
          </LinearGradient>
        </Pressable>
        <Button label={t('book.backToEdit')} variant="ghostDark" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: PREVIEW_BG },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingHorizontal: spacing.pageX },

  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  backCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: fontFamilies.display,
    fontSize: 20, // design: Fraunces 20/600
    color: '#FFFFFF',
  },
  headerCounter: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.5)',
  },

  stateFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  stateEmoji: { fontSize: 44 },
  stateTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 26,
  },
  stateButton: { alignSelf: 'stretch', marginTop: spacing.md },

  progressBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  progressEmoji: { fontSize: 48 },
  progressTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    maxWidth: 280,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
  progressPercent: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.7)',
  },

  canvasWrap: { flex: 1, justifyContent: 'center' },
  slide: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  pageCard: {
    width: PAGE_W,
    height: PAGE_H,
    // Book spread: tight radius on the spine edge, generous on the fore edge.
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: radius.base,
    borderBottomRightRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.purpleDeep,
  },
  pageCardLight: { backgroundColor: colors.card },
  pageShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 12, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 16,
  },
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 14,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  spineDark: { backgroundColor: 'rgba(0,0,0,0.25)' },
  spineLight: { backgroundColor: 'rgba(0,0,0,0.08)' },
  starDot: {
    position: 'absolute',
    borderRadius: radius.round,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  navCircle: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  navLeft: { left: spacing.xs },
  navRight: { right: spacing.xs },

  coverCenterBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingLeft: spacing.xl + 8,
    gap: spacing.xs,
  },
  coverBottomBlock: {
    position: 'absolute',
    left: 14,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.xxs,
  },
  coverEmoji: { fontSize: 72, marginBottom: spacing.xs },
  coverTitle: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h3,
    lineHeight: 27,
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  coverSubtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  coverDedication: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  backCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingLeft: spacing.xl + 8,
  },
  backEmoji: { fontSize: 48, marginBottom: spacing.md },
  backQuote: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.lg,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  backDivider: {
    width: 60,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  backBrand: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },

  pageImageTop: { height: '45%', backgroundColor: colors.muted },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  imageFallbackEmoji: { fontSize: 40 },
  pageTextScroll: { flex: 1 },
  pageTextWrap: { paddingVertical: spacing.md, paddingRight: spacing.md, paddingLeft: spacing.md + 8 },
  pageText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    lineHeight: 21,
    color: colors.foreground,
  },
  pageNumberDark: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  pageNumberLight: {
    position: 'absolute',
    bottom: 10,
    right: 14,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.6)',
  },

  fullScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  fullTextBlock: {
    position: 'absolute',
    left: 14,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg + 4,
  },
  fullText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    lineHeight: 21,
    color: colors.primaryForeground,
  },

  textOnlyWrap: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingRight: spacing.xl,
    paddingLeft: spacing.xl + 8,
    gap: spacing.md,
  },
  textOnlyStar: { fontSize: fontSizes.h4, color: colors.lavender },
  textOnlyText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xl,
    lineHeight: 26,
    color: colors.foreground,
    textAlign: 'center',
  },

  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.25)' },
  dotActive: { width: 20, backgroundColor: '#FFFFFF' },
  pageLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  footer: { paddingHorizontal: spacing.pageX, gap: 10 },
  printCta: { borderRadius: radius.lg, overflow: 'hidden' },
  printSoonNote: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: night.text,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 10,
  },
  printSoonBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: radius.xs,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  printSoonBadgeText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xs,
    color: colors.primaryForeground,
    letterSpacing: 0.5,
  },
  printShadow: {
    shadowColor: colors.coral,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 6,
  },
  printIcon: { marginRight: 8 },
  printGradient: {
    flexDirection: 'row',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.accentForeground,
  },
});
