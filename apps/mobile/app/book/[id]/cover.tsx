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
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ApiError } from '@masalim/api-client';
import type { Illustration, UpdateBookInput } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, gradients, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { CheckIcon } from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';

const AUTOSAVE_DEBOUNCE_MS = 800;
const SAVED_TICK_MS = 1_500;

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

/**
 * Cover editor (§31): title, subtitle, dedication and back-cover text plus a
 * cover-illustration picker. Everything autosaves; back returns to the builder.
 */
export default function CoverEditor() {
  const { t } = useTranslation();
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

  // Local editable fields — prefilled once; autosave responses never clobber them.
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [dedication, setDedication] = useState('');
  const [backCoverText, setBackCoverText] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const autosave = useBookAutosave(id);

  useEffect(() => {
    if (book != null && prefilledFor !== book.id) {
      setTitle(book.title);
      setSubtitle(book.subtitle ?? '');
      setDedication(book.dedication ?? '');
      setBackCoverText(book.backCoverText ?? '');
      setCoverUrl(book.coverImageUrl);
      setPrefilledFor(book.id);
    }
  }, [book, prefilledFor]);

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
  const selectCover = (illustration: Illustration) => {
    setCoverUrl(illustration.imageUrl);
    autosave.queue({ coverIllustrationId: illustration.id });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader title={t('book.coverTitle')} />
        <AutosaveTick visible={autosave.saved} error={autosave.error} />

        {/* Live cover preview: current image + typed title/subtitle. */}
        <View style={[styles.coverCard, shadows.cardMedium]}>
          {coverUrl != null ? (
            <Image
              source={{ uri: coverUrl }}
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
            style={styles.coverScrim}
          />
          <View style={styles.coverTextBlock}>
            <Text style={styles.coverTitleText} numberOfLines={2}>
              {title.trim().length > 0 ? title : book.title}
            </Text>
            {previewSubtitle.length > 0 ? (
              <Text style={styles.coverSubtitleText} numberOfLines={2}>
                {previewSubtitle}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Cover alternatives from the story's illustration sets. */}
        {coverAlternatives.length > 0 ? (
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
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.muted,
    justifyContent: 'flex-end',
  },
  coverScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  coverTextBlock: { padding: spacing.lg, gap: 6 },
  coverTitleText: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.h2,
    lineHeight: 30,
    color: colors.primaryForeground,
    letterSpacing: -0.3,
  },
  coverSubtitleText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: 'rgba(255,255,255,0.85)',
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

  form: { marginTop: spacing.xl, gap: spacing.lg },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },
});
