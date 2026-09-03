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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ApiError } from '@masalim/api-client';
import { AIJobStatus, ErrorCode, ILLUSTRATION_REGENERATE_CREDIT_COST } from '@masalim/types';
import type { Illustration, UpdateBookInput } from '@masalim/validation';
import {
  colors,
  coverPalettes,
  fontFamilies,
  fontSizes,
  gradients,
  radius,
  shadows,
  spacing,
  type CoverPaletteKey,
} from '@masalim/ui';
import { AppIcon } from '../../../src/components/AppIcon';
import { api } from '../../../src/lib/api';
import { useJobProgress } from '../../../src/lib/job-stream';
import { ConfirmSheet } from '../../../src/components/ConfirmSheet';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { CheckIcon } from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';
import { storyThemeEmoji } from '../../../src/components/StorySheet';

const AUTOSAVE_DEBOUNCE_MS = 800;
const SAVED_TICK_MS = 1_500;
/** Brief "✓ Kaydedildi" flash on the CTA before returning to the builder. */
const CTA_SAVED_MS = 900;

const PALETTE_KEYS = Object.keys(coverPalettes) as CoverPaletteKey[];
/** Decorative star dots on the cover preview (design `Book/02-CoverEditor`). */
const STAR_DOTS = [
  { x: '10%', y: '15%', s: 5 },
  { x: '85%', y: '20%', s: 4 },
  { x: '20%', y: '75%', s: 3 },
  { x: '90%', y: '80%', s: 5 },
  { x: '50%', y: '10%', s: 3 },
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
 * Debounced (800ms) autosave queue for PATCH /books/:id — same contract as the
 * builder: pending changes merge, failures re-queue under newer edits, local
 * state stays the source of truth.
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

  useEffect(
    () => () => {
      if (tickTimerRef.current != null) clearTimeout(tickTimerRef.current);
      flushRef.current();
    },
    [],
  );

  return { queue, flush, saved, error };
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

/**
 * Cover editor (§31, design `Book/02-CoverEditor`): live palette-gradient
 * preview, 5 cover-color swatches, title/subtitle/dedication (+ back-cover
 * text — kept beyond the design), cover regenerate / pick-from-alternatives,
 * and a bottom "Kapağı Kaydet" CTA. Everything autosaves.
 */
export default function CoverEditor() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

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
  const themeEmoji = storyThemeEmoji(storyQuery.data?.themes ?? []);

  const illustrationsQuery = useQuery({
    queryKey: ['illustrations', book?.storyId],
    queryFn: () => api.illustrations.list(book?.storyId as string),
    enabled: book?.storyId != null,
  });

  // Cover candidates across all illustration sets.
  const coverAlternatives = useMemo(() => {
    const list: Illustration[] = [];
    for (const set of illustrationsQuery.data ?? []) {
      for (const illustration of set.illustrations) {
        if (illustration.isCover) list.push(illustration);
      }
    }
    return list;
  }, [illustrationsQuery.data]);

  // The cover illustration a "Yeniden Oluştur" targets: the book's current one,
  // else the selected cover, else the first candidate.
  const coverIllustration = useMemo(() => {
    if (coverAlternatives.length === 0) return null;
    return (
      coverAlternatives.find((illustration) => illustration.id === book?.coverIllustrationId) ??
      coverAlternatives.find((illustration) => illustration.selected) ??
      coverAlternatives[0]
    );
  }, [coverAlternatives, book?.coverIllustrationId]);

  // Local editable fields — prefilled once; autosave responses never clobber them.
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [dedication, setDedication] = useState('');
  const [backCoverText, setBackCoverText] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  // null = user has not picked yet → show 'purple' visually, persist nothing.
  const [palette, setPalette] = useState<CoverPaletteKey | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [regenJobId, setRegenJobId] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);
  /** Cover regenerate is a credit spend — confirmed in a sheet before queuing. */
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [ctaSaved, setCtaSaved] = useState(false);
  const backTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosave = useBookAutosave(id);

  useEffect(() => {
    if (book != null && prefilledFor !== book.id) {
      setTitle(book.title);
      setSubtitle(book.subtitle ?? '');
      setDedication(book.dedication ?? '');
      setBackCoverText(book.backCoverText ?? '');
      setCoverUrl(book.coverImageUrl);
      setPalette(
        book.coverPalette != null && book.coverPalette in coverPalettes
          ? (book.coverPalette as CoverPaletteKey)
          : null,
      );
      setPrefilledFor(book.id);
    }
  }, [book, prefilledFor]);

  // Real progress for the single in-flight cover regenerate job.
  const regenJob = useJobProgress(regenJobId ?? undefined);
  const regenerating = regenJobId != null;
  const storyId = book?.storyId;

  useEffect(() => {
    if (regenJobId == null) return;
    if (regenJob.status === AIJobStatus.SUCCEEDED) {
      setRegenJobId(null);
      setShowAlternatives(true);
      void queryClient.invalidateQueries({ queryKey: ['illustrations', storyId] });
      void queryClient.invalidateQueries({ queryKey: ['book', id] });
    } else if (
      regenJob.status === AIJobStatus.FAILED ||
      regenJob.status === AIJobStatus.CANCELLED
    ) {
      setRegenError(
        regenJob.errorCode != null
          ? t(`errors.${regenJob.errorCode}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.GENERIC'),
      );
      setRegenJobId(null);
      void queryClient.invalidateQueries({ queryKey: ['illustrations', storyId] });
    }
  }, [regenJobId, regenJob.status, regenJob.errorCode, storyId, id, queryClient, t]);

  useEffect(
    () => () => {
      if (backTimerRef.current != null) clearTimeout(backTimerRef.current);
    },
    [],
  );

  if (bookQuery.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('book.coverTitle')} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      </Screen>
    );
  }

  if (bookQuery.isError || book == null) {
    const message =
      bookQuery.error instanceof ApiError
        ? t(`errors.${bookQuery.error.code}`, { defaultValue: t('errors.GENERIC') })
        : t('errors.OFFLINE');
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('book.coverTitle')} />
        <ErrorState
          emoji="🌧️"
          title={message}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void bookQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const defaultSubtitle =
    heroName != null ? t('book.coverSubtitleDefault', { name: heroName }) : '';
  const previewSubtitle = subtitle.trim().length > 0 ? subtitle : defaultSubtitle;
  // Visual default is 'purple' until the user actually picks a palette.
  const visualPalette: CoverPaletteKey = palette ?? 'purple';

  const changeTitle = (value: string) => {
    setTitle(value);
    // updateBookSchema requires a non-empty title — hold the patch until it is.
    if (value.trim().length > 0) autosave.queue({ title: value });
  };
  const changeSubtitle = (value: string) => {
    setSubtitle(value);
    autosave.queue({ subtitle: value.trim().length > 0 ? value : null });
  };
  const changeDedication = (value: string) => {
    setDedication(value);
    autosave.queue({ dedication: value.trim().length > 0 ? value : null });
  };
  const changeBackCoverText = (value: string) => {
    setBackCoverText(value);
    autosave.queue({ backCoverText: value.trim().length > 0 ? value : null });
  };
  const selectPalette = (key: CoverPaletteKey) => {
    setPalette(key);
    autosave.queue({ coverPalette: key });
  };
  const selectCover = (illustration: Illustration) => {
    setCoverUrl(illustration.imageUrl);
    autosave.queue({ coverIllustrationId: illustration.id });
  };

  const onRegenerate = async () => {
    if (coverIllustration == null || regenerating) return;
    setRegenError(null);
    try {
      const { jobId } = await api.illustrations.regenerate(coverIllustration.id);
      setRegenJobId(jobId);
    } catch (err) {
      if (err instanceof ApiError && err.code === ErrorCode.INSUFFICIENT_CREDITS) {
        // Regenerate costs a credit — send them to the wallet, keep the note here.
        setRegenError(t('subscription.quotaReachedIllustrations'));
        router.push('/subscription/quota' as never);
        return;
      }
      setRegenError(
        err instanceof ApiError
          ? t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') })
          : t('errors.OFFLINE'),
      );
    }
  };

  // Autosave already persisted everything — the CTA flushes stragglers, flashes
  // the saved state and returns to the builder (design onDone).
  const onSaveCover = () => {
    if (ctaSaved) return;
    autosave.flush();
    setCtaSaved(true);
    backTimerRef.current = setTimeout(() => router.back(), CTA_SAVED_MS);
  };

  const regenPercent = Math.round(Math.min(Math.max(regenJob.progress, 0), 100));

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        <Screen style={styles.screenContent}>
          <ScreenHeader title={t('book.coverTitle')} />
          <ConfirmSheet
            visible={regenConfirm}
            title={t('illustrate.regenerateConfirmTitle')}
            body={t('illustrate.regenerateConfirmBody', {
              count: ILLUSTRATION_REGENERATE_CREDIT_COST,
            })}
            confirmLabel={t('illustrate.regenerateConfirmCta')}
            cancelLabel={t('common.cancel')}
            onConfirm={() => {
              setRegenConfirm(false);
              void onRegenerate();
            }}
            onCancel={() => setRegenConfirm(false)}
          />
          <AutosaveTick visible={autosave.saved} error={autosave.error} />

          {/* Live cover preview: selected palette gradient, star dots, cover image on top. */}
          <View style={[styles.coverCard, shadows.cardMedium]}>
            <LinearGradient
              colors={coverPalettes[visualPalette] as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {STAR_DOTS.map((dot, index) => (
              <View
                key={index}
                style={[
                  styles.starDot,
                  { left: dot.x, top: dot.y, width: dot.s, height: dot.s },
                ]}
              />
            ))}
            {coverUrl != null ? (
              <>
                <Image
                  source={{ uri: coverUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
                {/* Legibility veil over the photo for the overlaid title block. */}
                <View style={styles.coverVeil} />
              </>
            ) : null}
            <View style={styles.coverCenter} pointerEvents="none">
              {coverUrl == null ? <Text style={styles.coverEmoji}>{themeEmoji}</Text> : null}
              <Text style={styles.coverTitleText} numberOfLines={2}>
                {title.trim().length > 0 ? title : t('book.coverTitleFallback')}
              </Text>
              {previewSubtitle.length > 0 ? (
                <Text style={styles.coverSubtitleText} numberOfLines={2}>
                  {previewSubtitle}
                </Text>
              ) : null}
            </View>
            {dedication.trim().length > 0 ? (
              <View style={styles.coverDedicationWrap} pointerEvents="none">
                <Text style={styles.coverDedicationText} numberOfLines={1}>
                  {dedication}
                </Text>
              </View>
            ) : null}
            {regenerating ? (
              <View style={styles.regenOverlay}>
                <ActivityIndicator color="#FFFFFF" />
                {regenPercent > 0 ? (
                  <Text style={styles.regenOverlayText}>%{regenPercent}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Cover color palette. */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {t('book.paletteSection').toLocaleUpperCase('tr')}
            </Text>
            <View style={styles.paletteRow}>
              {PALETTE_KEYS.map((key) => {
                const selected = visualPalette === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => selectPalette(key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(`book.palettes.${key}`)}
                    style={styles.paletteItem}
                  >
                    <View style={[styles.swatch, selected && styles.swatchSelected]}>
                      <LinearGradient
                        colors={coverPalettes[key] as unknown as [string, string]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                    <Text
                      style={[styles.swatchLabel, selected && styles.swatchLabelSelected]}
                      numberOfLines={1}
                    >
                      {t(`book.palettes.${key}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.form}>
            <Input
              label={t('book.coverBookTitle')}
              value={title}
              onChangeText={changeTitle}
              maxLength={120}
              autoCapitalize="sentences"
              error={
                prefilledFor != null && title.trim().length === 0
                  ? t('errors.VALIDATION_FAILED')
                  : undefined
              }
              accessibilityLabel={t('book.coverBookTitle')}
            />
            <Input
              label={t('book.coverSubtitle')}
              value={subtitle}
              onChangeText={changeSubtitle}
              placeholder={defaultSubtitle.length > 0 ? defaultSubtitle : undefined}
              maxLength={160}
              autoCapitalize="sentences"
              accessibilityLabel={t('book.coverSubtitle')}
            />
            <Input
              label={t('book.dedicationLabel')}
              value={dedication}
              onChangeText={changeDedication}
              placeholder={t('book.dedicationPlaceholder')}
              multiline
              maxLength={300}
              style={styles.multilineInput}
              accessibilityLabel={t('book.dedicationLabel')}
            />
            {/* Deviation: the design omits the back-cover field — kept for parity with the print pipeline. */}
            <Input
              label={t('book.backCoverLabel')}
              value={backCoverText}
              onChangeText={changeBackCoverText}
              multiline
              maxLength={600}
              style={styles.multilineInput}
              accessibilityLabel={t('book.backCoverLabel')}
            />
          </View>

          {/* Cover image: regenerate or pick another cover alternative. */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>
              {t('book.changeCoverSection').toLocaleUpperCase('tr')}
            </Text>
            <View style={styles.changeRow}>
              <Pressable
                onPress={() => setRegenConfirm(true)}
                disabled={coverIllustration == null || regenerating}
                accessibilityRole="button"
                accessibilityState={{ disabled: coverIllustration == null || regenerating }}
                style={({ pressed }) => [
                  styles.changeButton,
                  (coverIllustration == null || regenerating) && styles.changeButtonDisabled,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {regenerating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <View style={styles.changeButtonInner}>
                    <View style={styles.changeButtonLabelRow}>
                      <AppIcon name="retry" size={16} color={colors.foreground} />
                      <Text style={styles.changeButtonText}>{t('book.regenerateCover')}</Text>
                    </View>
                    <Text style={styles.changeButtonCost}>
                      {t('credits.regenerateCost', { count: ILLUSTRATION_REGENERATE_CREDIT_COST })}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => setShowAlternatives((value) => !value)}
                disabled={coverAlternatives.length === 0}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: coverAlternatives.length === 0,
                  expanded: showAlternatives,
                }}
                style={({ pressed }) => [
                  styles.changeButton,
                  coverAlternatives.length === 0 && styles.changeButtonDisabled,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <View style={styles.changeButtonLabelRow}>
                  <AppIcon name="image" size={16} color={colors.foreground} />
                  <Text style={styles.changeButtonText}>{t('book.pickFromAlternatives')}</Text>
                </View>
              </Pressable>
            </View>
            {regenError != null ? (
              <Text style={styles.regenErrorText}>{regenError}</Text>
            ) : null}

            {/* Cover alternatives from the story's illustration sets. */}
            {showAlternatives && coverAlternatives.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.altRow}
                style={styles.altScroll}
              >
                {coverAlternatives.map((illustration) => {
                  const isCurrent = illustration.imageUrl === coverUrl;
                  return (
                    <Pressable
                      key={illustration.id}
                      onPress={() => selectCover(illustration)}
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
        </Screen>

        {/* Pinned "Kapağı Kaydet" CTA over a background fade. */}
        <View
          style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 16) + spacing.sm }]}
          pointerEvents="box-none"
        >
          <LinearGradient
            // Fade from transparent into the page background (colors.background).
            colors={['rgba(250,248,244,0)', colors.background] as [string, string]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Pressable
            onPress={onSaveCover}
            disabled={ctaSaved}
            accessibilityRole="button"
            accessibilityState={{ disabled: ctaSaved }}
            style={({ pressed }) => [
              styles.ctaButton,
              !ctaSaved && shadows.primaryCta,
              { opacity: pressed && !ctaSaved ? 0.92 : 1 },
            ]}
          >
            {ctaSaved ? (
              <View style={styles.ctaSavedFill}>
                <Text style={styles.ctaSavedText}>✓ {t('book.autosaved')}</Text>
              </View>
            ) : (
              <LinearGradient
                colors={gradients.primaryCta as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>{t('book.saveCover')}</Text>
              </LinearGradient>
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screenContent: { paddingBottom: 132 },

  tickSlot: { height: 18, marginTop: -12, marginBottom: spacing.xxs, justifyContent: 'center' },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-end' },
  tickText: { fontFamily: fontFamilies.bodySemiBold, fontSize: fontSizes.sm, color: colors.sage },
  tickError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    textAlign: 'right',
  },

  coverCard: {
    height: 280,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.purpleDeep,
    justifyContent: 'center',
  },
  starDot: { position: 'absolute', borderRadius: radius.round, backgroundColor: 'rgba(255,255,255,0.6)' },
  coverVeil: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,15,60,0.35)',
  },
  coverCenter: { alignItems: 'center', gap: spacing.xs },
  coverEmoji: { fontSize: 64 },
  coverTitleText: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 20, // design: Fraunces 20/700
    lineHeight: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  coverSubtitleText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    paddingHorizontal: 28,
  },
  coverDedicationWrap: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' },
  coverDedicationText: {
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing.lg,
  },
  regenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(26,15,60,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  regenOverlayText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
  },

  section: { marginTop: spacing.lg },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: 0.8,
    marginBottom: spacing.xs + 2,
  },
  paletteRow: { flexDirection: 'row', gap: 10 },
  paletteItem: { flex: 1 },
  swatch: {
    height: 48,
    borderRadius: radius.chip,
    borderWidth: 3,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  swatchSelected: { borderColor: colors.primary },
  swatchLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xxs,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  swatchLabelSelected: { color: colors.primary },

  form: { marginTop: spacing.lg, gap: spacing.lg },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },

  changeRow: { flexDirection: 'row', gap: 10 },
  changeButton: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeButtonDisabled: { opacity: 0.5 },
  changeButtonInner: { alignItems: 'center', gap: 2 },
  changeButtonLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeButtonCost: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.primary,
  },
  changeButtonText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
    textAlign: 'center',
  },
  regenErrorText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    marginTop: spacing.xs,
  },

  altScroll: { marginTop: spacing.sm, flexGrow: 0 },
  altRow: { gap: spacing.xs },
  altTile: {
    width: 72,
    height: 96,
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

  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.pageX,
    paddingTop: spacing.sm,
  },
  ctaButton: { borderRadius: radius.lg, overflow: 'hidden' },
  ctaGradient: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  ctaSavedFill: {
    // colors.sage at 15% — the design's saved-state tint.
    backgroundColor: 'rgba(141,184,154,0.15)',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.primaryForeground,
  },
  ctaSavedText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.sage,
  },
});
