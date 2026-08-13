import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@masalim/api-client';
import { BookPageLayout } from '@masalim/types';
import type { BookPage, Illustration, UpdateBookInput } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { Button } from '../../../src/components/Button';
import { Input } from '../../../src/components/Input';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { CheckIcon } from '../../../src/components/icons';
import { EmptyState, ErrorState } from '../../../src/components/states';

const AUTOSAVE_DEBOUNCE_MS = 800;
const SAVED_TICK_MS = 1_500;

const LAYOUT_OPTIONS = [
  BookPageLayout.IMAGE_TOP,
  BookPageLayout.IMAGE_FULL,
  BookPageLayout.TEXT_ONLY,
] as const;

type PagePatch = NonNullable<UpdateBookInput['pages']>[number];

/** Merge two autosave patches; `next` wins field-by-field, page patches merge by id. */
function mergePatches(base: UpdateBookInput, next: UpdateBookInput): UpdateBookInput {
  const merged: UpdateBookInput = { ...base, ...next };
  if (base.pages != null || next.pages != null) {
    const byId = new Map<string, PagePatch>();
    for (const page of base.pages ?? []) byId.set(page.id, page);
    for (const page of next.pages ?? []) byId.set(page.id, { ...byId.get(page.id), ...page });
    merged.pages = [...byId.values()];
  }
  return merged;
}

/**
 * Debounced (800ms) autosave queue for PATCH /books/:id. Pending field changes
 * merge into one patch; a failed patch is re-queued UNDER any newer pending
 * edits so keystrokes are never lost. Local screen state stays the source of
 * truth — the server response only refreshes the query cache.
 */
function useBookAutosave(bookId: string | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const pendingRef = useRef<UpdateBookInput>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: UpdateBookInput) => api.books.update(bookId as string, input),
    onSuccess: (book) => {
      queryClient.setQueryData(['book', bookId], book);
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      setSaved(true);
      if (tickTimerRef.current != null) clearTimeout(tickTimerRef.current);
      tickTimerRef.current = setTimeout(() => setSaved(false), SAVED_TICK_MS);
    },
    onError: (mutationError, variables) => {
      pendingRef.current = mergePatches(variables, pendingRef.current);
      setError(
        mutationError instanceof ApiError
          ? t(`errors.${mutationError.code}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.OFFLINE'),
      );
    },
  });

  const flush = () => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (bookId == null || bookId.length === 0) return;
    if (mutation.isPending) {
      // A save is in flight — retry shortly so patches stay ordered.
      timerRef.current = setTimeout(() => flushRef.current(), AUTOSAVE_DEBOUNCE_MS);
      return;
    }
    const pending = pendingRef.current;
    if (Object.keys(pending).length === 0) return;
    pendingRef.current = {};
    mutation.mutate(pending);
  };
  flushRef.current = flush;

  const queue = (patch: UpdateBookInput) => {
    pendingRef.current = mergePatches(pendingRef.current, patch);
    setError(null);
    if (timerRef.current != null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), AUTOSAVE_DEBOUNCE_MS);
  };

  // Flush pending edits when leaving the screen (the mutation survives unmount).
  useEffect(
    () => () => {
      if (tickTimerRef.current != null) clearTimeout(tickTimerRef.current);
      flushRef.current();
    },
    [],
  );

  return { queue, saved, error };
}

/** Tiny "Kaydedildi" confirmation that fades out after each successful autosave. */
function AutosaveTick({ visible, error }: { visible: boolean; error: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.tickSlot}>
      {error != null ? (
        <Text style={styles.tickError} numberOfLines={1}>
          {error}
        </Text>
      ) : visible ? (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(400)}
          style={styles.tickRow}
        >
          <CheckIcon size={10} color={colors.sage} />
          <Text style={styles.tickText}>{t('book.autosaved')}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Miniature glyph for the three page-layout options. */
function LayoutGlyph({ layout, active }: { layout: BookPageLayout; active: boolean }) {
  const lineColor = active ? colors.primary : colors.mutedForeground;
  const imageColor = active ? colors.lavenderLight : colors.muted;
  return (
    <View style={styles.glyphFrame}>
      {layout !== BookPageLayout.TEXT_ONLY ? (
        <View
          style={[
            styles.glyphImage,
            { backgroundColor: imageColor },
            layout === BookPageLayout.IMAGE_FULL && styles.glyphImageFull,
          ]}
        />
      ) : null}
      {layout !== BookPageLayout.IMAGE_FULL ? (
        <>
          {layout === BookPageLayout.TEXT_ONLY ? (
            <View style={[styles.glyphLine, { backgroundColor: lineColor }]} />
          ) : null}
          <View style={[styles.glyphLine, { backgroundColor: lineColor }]} />
          <View style={[styles.glyphLine, styles.glyphLineShort, { backgroundColor: lineColor }]} />
        </>
      ) : null}
    </View>
  );
}

/**
 * Book Builder canvas (§30): page strip (cover + numbered pages), per-page
 * image with alternative-illustration picker, editable text and layout
 * switcher — every change autosaves through one debounced patch queue.
 */
export default function BookBuilder() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const bookQuery = useQuery({
    queryKey: ['book', id],
    queryFn: () => api.books.get(id),
    enabled: id != null && id.length > 0,
  });
  const book = bookQuery.data;

  const storyQuery = useQuery({
    queryKey: ['story', book?.storyId],
    queryFn: () => api.stories.detail(book?.storyId as string),
    enabled: book?.storyId != null,
  });
  const heroName = storyQuery.data?.childName ?? storyQuery.data?.heroName ?? null;

  const illustrationsQuery = useQuery({
    queryKey: ['illustrations', book?.storyId],
    queryFn: () => api.illustrations.list(book?.storyId as string),
    enabled: book?.storyId != null,
  });

  // Alternative illustrations grouped by story page (across all sets).
  const alternativesByStoryPage = useMemo(() => {
    const map = new Map<string, Illustration[]>();
    for (const set of illustrationsQuery.data ?? []) {
      for (const illustration of set.illustrations) {
        if (illustration.isCover || illustration.storyPageId == null) continue;
        const list = map.get(illustration.storyPageId);
        if (list == null) map.set(illustration.storyPageId, [illustration]);
        else list.push(illustration);
      }
    }
    return map;
  }, [illustrationsQuery.data]);

  // Local editable copy — prefilled once per book; autosave responses never clobber it.
  const [pages, setPages] = useState<BookPage[]>([]);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const autosave = useBookAutosave(id);

  useEffect(() => {
    if (book != null && prefilledFor !== book.id) {
      setPages([...book.pages].sort((a, b) => a.pageNumber - b.pageNumber));
      setPrefilledFor(book.id);
    }
  }, [book, prefilledFor]);

  const paddingTop = Math.max(insets.top, 20) + 8;
  const headerTitle =
    heroName != null ? t('book.builderTitle', { name: heroName }) : t('book.builderTitleGeneric');

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
        <ScreenHeader title={t('book.builderTitleGeneric')} />
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

  if (pages.length === 0) {
    return (
      <View style={[styles.root, styles.padded, { paddingTop }]}>
        <ScreenHeader title={headerTitle} />
        <EmptyState
          emoji="📖"
          title={t('book.emptyTitle')}
          ctaLabel={t('common.back')}
          onCta={() => router.back()}
        />
      </View>
    );
  }

  const currentPage = pages[Math.min(pageIndex, pages.length - 1)] ?? null;
  const alternatives =
    currentPage?.storyPageId != null
      ? (alternativesByStoryPage.get(currentPage.storyPageId) ?? [])
      : [];

  const setPageText = (pageId: string, text: string) => {
    setPages((previous) =>
      previous.map((page) => (page.id === pageId ? { ...page, text } : page)),
    );
    // updateBookSchema requires non-empty page text — hold the patch until it is.
    if (text.trim().length > 0) autosave.queue({ pages: [{ id: pageId, text }] });
  };

  const setPageLayout = (pageId: string, layout: BookPageLayout) => {
    setPages((previous) =>
      previous.map((page) => (page.id === pageId ? { ...page, layout } : page)),
    );
    autosave.queue({ pages: [{ id: pageId, layout }] });
  };

  const selectAlternative = (pageId: string, illustration: Illustration) => {
    setPages((previous) =>
      previous.map((page) =>
        page.id === pageId ? { ...page, imageUrl: illustration.imageUrl } : page,
      ),
    );
    autosave.queue({ pages: [{ id: pageId, illustrationId: illustration.id }] });
  };

  const openCover = () => router.push(`/book/${book.id}/cover` as never);
  const openPreview = () => router.push(`/book/${book.id}/preview` as never);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop }]}>
        <View style={styles.headerWrap}>
          <ScreenHeader title={headerTitle} />
          <AutosaveTick visible={autosave.saved} error={autosave.error} />
        </View>

        {/* Page strip: cover routes to the cover editor; pages switch the canvas. */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.strip}
          >
            <Pressable
              onPress={openCover}
              accessibilityRole="button"
              accessibilityLabel={t('book.coverTitle')}
              style={styles.thumbColumn}
            >
              <View style={[styles.thumb, styles.thumbInactive]}>
                {book.coverImageUrl != null ? (
                  <Image
                    source={{ uri: book.coverImageUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={styles.thumbEmoji}>📕</Text>
                )}
              </View>
              <Text style={styles.thumbLabel} numberOfLines={1}>
                {t('illustrate.progressCover')}
              </Text>
            </Pressable>

            {pages.map((page, index) => (
              <Pressable
                key={page.id}
                onPress={() => {
                  setPageIndex(index);
                  setShowAlternatives(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: index === pageIndex }}
                accessibilityLabel={t('illustrate.progressPage', { number: page.pageNumber })}
                style={styles.thumbColumn}
              >
                <View
                  style={[
                    styles.thumb,
                    index === pageIndex ? styles.thumbActive : styles.thumbInactive,
                  ]}
                >
                  {page.imageUrl != null && page.layout !== BookPageLayout.TEXT_ONLY ? (
                    <Image
                      source={{ uri: page.imageUrl }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <View style={styles.thumbTextOnly}>
                      <View style={styles.thumbTextLine} />
                      <View style={[styles.thumbTextLine, styles.thumbTextLineShort]} />
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.thumbLabel, index === pageIndex && styles.thumbLabelActive]}
                  numberOfLines={1}
                >
                  {page.pageNumber}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Canvas: current page image + text + layout controls. */}
        {currentPage != null ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.canvas}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {currentPage.layout !== BookPageLayout.TEXT_ONLY ? (
              <View
                style={[
                  styles.canvasImage,
                  currentPage.layout === BookPageLayout.IMAGE_FULL && styles.canvasImageFull,
                ]}
              >
                {currentPage.imageUrl != null ? (
                  <Image
                    source={{ uri: currentPage.imageUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={styles.canvasImageEmoji}>🎨</Text>
                )}
              </View>
            ) : null}

            {currentPage.layout !== BookPageLayout.TEXT_ONLY && alternatives.length > 0 ? (
              <View style={styles.altBlock}>
                <Pressable
                  onPress={() => setShowAlternatives((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showAlternatives }}
                  style={({ pressed }) => [styles.altToggle, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.altToggleEmoji}>🎨</Text>
                  <Text style={styles.altToggleText}>{t('illustrate.chooseAlternative')}</Text>
                </Pressable>
                {showAlternatives ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.altRow}
                  >
                    {alternatives.map((illustration) => {
                      const isCurrent = illustration.imageUrl === currentPage.imageUrl;
                      return (
                        <Pressable
                          key={illustration.id}
                          onPress={() => selectAlternative(currentPage.id, illustration)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isCurrent }}
                          style={[styles.altTile, isCurrent && styles.altTileSelected]}
                        >
                          <Image
                            source={{ uri: illustration.imageUrl }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                            accessibilityIgnoresInvertColors
                          />
                          {isCurrent ? (
                            <View style={styles.altCheck}>
                              <CheckIcon />
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}

            {/* Layout switcher: IMAGE_TOP / IMAGE_FULL / TEXT_ONLY. */}
            <View style={styles.layoutRow}>
              {LAYOUT_OPTIONS.map((option) => {
                const active = currentPage.layout === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setPageLayout(currentPage.id, option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t(`book.layoutOptions.${option}`)}
                    style={[styles.layoutToggle, active && styles.layoutToggleActive]}
                  >
                    <LayoutGlyph layout={option} active={active} />
                  </Pressable>
                );
              })}
            </View>

            <Input
              label={t('book.editText')}
              value={currentPage.text}
              onChangeText={(text) => setPageText(currentPage.id, text)}
              multiline
              maxLength={2000}
              style={styles.textInput}
              accessibilityLabel={t('book.editText')}
            />
          </ScrollView>
        ) : null}

        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Button
            label={t('book.coverTitle')}
            variant="secondary"
            compact
            onPress={openCover}
            style={styles.bottomButton}
          />
          <Button
            label={t('book.previewTitle')}
            compact
            onPress={openPreview}
            style={styles.bottomButton}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingHorizontal: spacing.pageX },
  headerWrap: { paddingHorizontal: spacing.pageX },

  tickSlot: { height: 18, marginTop: -12, marginBottom: spacing.xxs, justifyContent: 'center' },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  tickText: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: colors.sage },
  tickError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    textAlign: 'right',
  },

  strip: {
    paddingHorizontal: spacing.pageX,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  thumbColumn: { alignItems: 'center', gap: 4, width: 56 },
  thumb: {
    width: 56,
    height: 72,
    borderRadius: radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbActive: { borderColor: colors.primary },
  thumbInactive: { borderColor: colors.border },
  thumbEmoji: { fontSize: 20 },
  thumbTextOnly: { gap: 4, alignSelf: 'stretch', paddingHorizontal: 10 },
  thumbTextLine: { height: 3, borderRadius: 2, backgroundColor: colors.border },
  thumbTextLineShort: { width: '60%' },
  thumbLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
  },
  thumbLabelActive: { color: colors.primary },

  canvas: { paddingHorizontal: spacing.pageX, paddingBottom: spacing.xl, gap: spacing.md },
  canvasImage: {
    height: 190,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvasImageFull: { height: 280 },
  canvasImageEmoji: { fontSize: 40 },

  altBlock: { gap: spacing.sm },
  altToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  altToggleEmoji: { fontSize: fontSizes.base },
  altToggleText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },
  altRow: { gap: spacing.xs },
  altTile: {
    width: 72,
    height: 72,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.muted,
  },
  altTileSelected: { borderColor: colors.primary },
  altCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  layoutRow: { flexDirection: 'row', gap: spacing.xs },
  layoutToggle: {
    width: 52,
    height: 52,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layoutToggleActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  glyphFrame: { width: 26, height: 34, gap: 3, justifyContent: 'center' },
  glyphImage: { height: 14, borderRadius: 3 },
  glyphImageFull: { flex: 1 },
  glyphLine: { height: 3, borderRadius: 2 },
  glyphLineShort: { width: '65%' },

  textInput: {
    minHeight: 140,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },

  bottomBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  bottomButton: { flex: 1 },
});
