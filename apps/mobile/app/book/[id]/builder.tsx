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
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@masalim/api-client';
import { withSuffix } from '@masalim/localization';
import { BookPageLayout } from '@masalim/types';
import type { BookPage, Illustration, UpdateBookInput } from '@masalim/validation';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  letterSpacing,
  radius,
  shadows,
  spacing,
} from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { Button } from '../../../src/components/Button';
import { Input } from '../../../src/components/Input';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { Starfield } from '../../../src/components/Starfield';
import { CheckIcon, ChevronLeftIcon } from '../../../src/components/icons';
import { EmptyState, ErrorState } from '../../../src/components/states';

const AUTOSAVE_DEBOUNCE_MS = 800;
const SAVED_TICK_MS = 1_500;

const LAYOUT_OPTIONS = [
  BookPageLayout.IMAGE_TOP,
  BookPageLayout.IMAGE_FULL,
  BookPageLayout.TEXT_ONLY,
] as const;

/** Which editing panel is expanded above the toolbar. */
type EditorPanel = 'layout' | 'alternatives' | 'text';

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
 * Book Builder canvas (§30): editor header with preview shortcut, page strip
 * (cover + numbered pages), a 3:4 storybook page canvas, and a bottom edit
 * toolbar (layout / alternative illustration / text panels) above the print
 * CTA — every change autosaves through one debounced patch queue.
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
  const [activePanel, setActivePanel] = useState<EditorPanel | null>(null);
  const autosave = useBookAutosave(id);

  useEffect(() => {
    if (book != null && prefilledFor !== book.id) {
      setPages([...book.pages].sort((a, b) => a.pageNumber - b.pageNumber));
      setPrefilledFor(book.id);
    }
  }, [book, prefilledFor]);

  const paddingTop = Math.max(insets.top, 20) + 8;
  const headerTitle =
    heroName != null
      ? t('book.builderTitlePossessive', { name: heroName, nameGen: withSuffix(heroName, 'gen') })
      : t('book.builderTitleGeneric');

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

  const toolActions: { key: EditorPanel; emoji: string; label: string; disabled: boolean }[] = [
    { key: 'layout', emoji: '📐', label: t('book.layoutLabel'), disabled: currentPage == null },
    {
      key: 'alternatives',
      emoji: '🔄',
      label: t('illustrate.chooseAlternative'),
      disabled:
        currentPage == null ||
        currentPage.layout === BookPageLayout.TEXT_ONLY ||
        alternatives.length === 0,
    },
    { key: 'text', emoji: '✏️', label: t('book.editText'), disabled: currentPage == null },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.root, { paddingTop }]}>
        {/* Editor header: back + eyebrow/title + preview shortcut, page strip below. */}
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <ChevronLeftIcon color={colors.foreground} />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={styles.headerEyebrow} numberOfLines={1}>
                {t('book.builderEyebrow').toLocaleUpperCase('tr')}
              </Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {headerTitle}
              </Text>
            </View>
            <Pressable
              onPress={openPreview}
              accessibilityRole="button"
              accessibilityLabel={t('book.previewCta')}
              style={({ pressed }) => [styles.previewChip, pressed && styles.pressed]}
            >
              <Text style={styles.previewChipText}>{t('book.previewCta')}</Text>
            </Pressable>
          </View>

          <AutosaveTick visible={autosave.saved} error={autosave.error} />

          {/* Page strip: cover routes to the cover editor; pages switch the canvas. */}
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
                  <LinearGradient
                    colors={gradients.playerCover as unknown as [string, string]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[StyleSheet.absoluteFill, styles.thumbFallback]}
                  >
                    <Text style={styles.thumbEmoji}>⭐</Text>
                  </LinearGradient>
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
                  setActivePanel(null);
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
                  ) : page.layout === BookPageLayout.TEXT_ONLY ? (
                    <View style={styles.thumbTextOnly}>
                      <View style={styles.thumbTextLine} />
                      <View style={[styles.thumbTextLine, styles.thumbTextLineShort]} />
                    </View>
                  ) : (
                    <LinearGradient
                      colors={gradients.playerCover as unknown as [string, string]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[StyleSheet.absoluteFill, styles.thumbFallback]}
                    >
                      <Text style={styles.thumbEmoji}>🎨</Text>
                    </LinearGradient>
                  )}
                </View>
                <Text
                  style={[styles.thumbLabel, index === pageIndex && styles.thumbLabelActive]}
                  numberOfLines={1}
                >
                  {t('book.pageShort', { number: page.pageNumber })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Canvas: current page as a 3:4 storybook card. */}
        {currentPage != null ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.canvas}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={[styles.pageCard, shadows.hero]}>
              {currentPage.layout === BookPageLayout.TEXT_ONLY ? (
                <View style={styles.cardTextOnly}>
                  <Text style={styles.cardStar}>✦</Text>
                  <Text style={styles.cardTextCenter} numberOfLines={12}>
                    {currentPage.text}
                  </Text>
                </View>
              ) : (
                <>
                  <View
                    style={
                      currentPage.layout === BookPageLayout.IMAGE_FULL
                        ? StyleSheet.absoluteFill
                        : styles.cardImageTop
                    }
                  >
                    {currentPage.imageUrl != null ? (
                      <Image
                        source={{ uri: currentPage.imageUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <LinearGradient
                        colors={gradients.playerCover as unknown as [string, string]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[StyleSheet.absoluteFill, styles.cardImageFallback]}
                      >
                        <Starfield count={10} />
                        <Text style={styles.cardFallbackEmoji}>🎨</Text>
                      </LinearGradient>
                    )}
                  </View>
                  {currentPage.layout === BookPageLayout.IMAGE_FULL ? (
                    <View style={styles.cardOverlayPanel}>
                      <Text style={styles.cardOverlayText} numberOfLines={5}>
                        {currentPage.text}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.cardTextArea}>
                      <Text style={styles.cardText} numberOfLines={8}>
                        {currentPage.text}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </ScrollView>
        ) : null}

        {/* Edit toolbar + expanding panels + print CTA. */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {currentPage != null && activePanel === 'layout' ? (
            <Animated.View entering={FadeIn.duration(150)} style={styles.layoutRow}>
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
            </Animated.View>
          ) : null}

          {currentPage != null && activePanel === 'alternatives' && alternatives.length > 0 ? (
            <Animated.View entering={FadeIn.duration(150)}>
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
            </Animated.View>
          ) : null}

          {currentPage != null && activePanel === 'text' ? (
            <Animated.View entering={FadeIn.duration(150)}>
              <Input
                label={t('book.editText')}
                value={currentPage.text}
                onChangeText={(text) => setPageText(currentPage.id, text)}
                multiline
                autoFocus
                maxLength={2000}
                style={styles.textInput}
                accessibilityLabel={t('book.editText')}
              />
            </Animated.View>
          ) : null}

          <View style={styles.toolbar}>
            {toolActions.map((action) => {
              const active = activePanel === action.key;
              return (
                <Pressable
                  key={action.key}
                  onPress={() =>
                    setActivePanel((current) => (current === action.key ? null : action.key))
                  }
                  disabled={action.disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: action.disabled }}
                  accessibilityLabel={action.label}
                  style={({ pressed }) => [
                    styles.toolButton,
                    active && styles.toolButtonActive,
                    action.disabled && styles.toolButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.toolEmoji}>{action.emoji}</Text>
                  <Text
                    style={[styles.toolLabel, active && styles.toolLabelActive]}
                    numberOfLines={2}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Button
            label={t('book.previewBookCta')}
            leading={<Text style={styles.ctaEmoji}>📦</Text>}
            onPress={openPreview}
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
  pressed: { opacity: 0.8 },

  headerBlock: {
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.round,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerEyebrow: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
  },
  headerTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
  },
  previewChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    backgroundColor: colors.secondary,
  },
  previewChipText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.primary,
  },

  tickSlot: { height: 16, justifyContent: 'center' },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  tickText: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: colors.sage },
  tickError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    textAlign: 'right',
  },

  strip: { gap: spacing.xs, paddingBottom: spacing.sm, alignItems: 'flex-start' },
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
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  thumbEmoji: { fontSize: fontSizes.h4 },
  thumbTextOnly: { gap: 4, alignSelf: 'stretch', paddingHorizontal: 10 },
  thumbTextLine: { height: 3, borderRadius: 2, backgroundColor: colors.border },
  thumbTextLineShort: { width: '60%' },
  thumbLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xxs,
    color: colors.mutedForeground,
  },
  thumbLabelActive: { color: colors.primary },

  canvas: {
    flexGrow: 1,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageCard: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: 3 / 4,
    borderRadius: radius.base,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardImageTop: { height: '55%', backgroundColor: colors.muted },
  cardImageFallback: { alignItems: 'center', justifyContent: 'center' },
  cardFallbackEmoji: { fontSize: 48 },
  cardTextArea: { flex: 1, padding: spacing.md },
  cardText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.md,
    lineHeight: 20,
    color: colors.foreground,
  },
  cardOverlayPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    padding: spacing.md,
  },
  cardOverlayText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.md,
    lineHeight: 20,
    color: colors.primaryForeground,
  },
  cardTextOnly: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardStar: { fontSize: fontSizes.h4, color: colors.lavender },
  cardTextCenter: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.base,
    lineHeight: 22,
    color: colors.foreground,
    textAlign: 'center',
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  toolbar: { flexDirection: 'row', gap: spacing.xs },
  toolButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: 6,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  toolButtonActive: { borderColor: colors.primary, backgroundColor: colors.secondary },
  toolButtonDisabled: { opacity: 0.4 },
  toolEmoji: { fontSize: fontSizes.h4 },
  toolLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xxs,
    lineHeight: 12,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  toolLabelActive: { color: colors.primary },
  ctaEmoji: { fontSize: 20 },

  layoutRow: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
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

  textInput: {
    minHeight: 120,
    maxHeight: 180,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },
});
