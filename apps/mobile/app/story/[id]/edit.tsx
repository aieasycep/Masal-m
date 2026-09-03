import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { UpdateStoryInput } from '@masalim/validation';
import { ApiError } from '@masalim/api-client';
import {
  colors,
  fontFamilies,
  fontSizes,
  gradients,
  letterSpacing,
  radius,
  spacing,
} from '@masalim/ui';
import { AppIcon } from '../../../src/components/AppIcon';
import { api } from '../../../src/lib/api';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { ChevronLeftIcon } from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';

interface EditablePage {
  pageNumber: number;
  text: string;
}

/** Fallback emoji cycle for pages without an illustration (design reference). */
const PAGE_EMOJI = ['🌌', '🚀', '⭐', '🌟', '🌙'] as const;

/**
 * Story text editor: inline title + per-page text behind page tabs. Saving
 * bumps the story version server-side (the previous revision is archived) —
 * no version UI needed here.
 */
export default function StoryEdit() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [pages, setPages] = useState<EditablePage[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);

  const storyQuery = useQuery({
    queryKey: ['story', id],
    queryFn: () => api.stories.detail(id),
    enabled: id != null && id.length > 0,
  });
  const story = storyQuery.data;

  useEffect(() => {
    if (story != null && prefilledFor !== story.id) {
      setTitle(story.title);
      setPages(
        [...story.pages]
          .sort((a, b) => a.pageNumber - b.pageNumber)
          .map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
      );
      setSelectedIndex(0);
      setPrefilledFor(story.id);
    }
  }, [story, prefilledFor]);

  const apiErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    return t('errors.OFFLINE');
  };

  const updateMutation = useMutation({
    mutationFn: (input: UpdateStoryInput) => api.stories.update(id, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['story', id] });
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
      router.back();
    },
    onError: (error) => setServerError(apiErrorMessage(error)),
  });

  const setPageText = (pageNumber: number, text: string) => {
    setPages((previous) =>
      previous.map((page) => (page.pageNumber === pageNumber ? { ...page, text } : page)),
    );
  };

  const save = () => {
    setServerError(null);
    const trimmedTitle = title.trim();
    const hasEmptyPage = pages.some((page) => page.text.trim().length === 0);
    if (trimmedTitle.length === 0 || hasEmptyPage) {
      setShowErrors(true);
      return;
    }
    updateMutation.mutate({
      title: trimmedTitle,
      pages:
        pages.length > 0
          ? pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text.trim() }))
          : undefined,
    });
  };

  if (storyQuery.isPending) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('storyResult.editEyebrow')} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      </Screen>
    );
  }

  if (storyQuery.isError || story == null) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('storyResult.editEyebrow')} />
        <ErrorState
          emoji="🌧️"
          title={apiErrorMessage(storyQuery.error)}
          ctaLabel={t('common.retry')}
          onCta={() => {
            void storyQuery.refetch();
          }}
        />
      </Screen>
    );
  }

  const activeIndex = Math.min(selectedIndex, Math.max(pages.length - 1, 0));
  const activePage = pages[activeIndex] ?? null;
  const activeIllustrationUrl =
    activePage != null
      ? (story.pages.find((page) => page.pageNumber === activePage.pageNumber)
          ?.illustrationUrl ?? null)
      : null;
  const titleError = showErrors && title.trim().length === 0;

  return (
    <Screen scroll={false} padded={false}>
      {/* Header: back + eyebrow/title + save, page tabs below. */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            style={styles.backButton}
          >
            <ChevronLeftIcon color={colors.foreground} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>
              {t('storyResult.editEyebrow').toLocaleUpperCase('tr')}
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[styles.titleInput, titleError && styles.titleInputError]}
              accessibilityLabel={t('storyResult.editTitleLabel')}
              placeholder={t('storyResult.editTitleLabel')}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="sentences"
              maxLength={120}
            />
          </View>
          <Pressable
            onPress={save}
            disabled={updateMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('common.save')}
            accessibilityState={{ disabled: updateMutation.isPending, busy: updateMutation.isPending }}
            style={({ pressed }) => [styles.saveButton, { opacity: pressed ? 0.85 : 1 }]}
          >
            {updateMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={styles.saveLabel}>{t('common.save')}</Text>
            )}
          </Pressable>
        </View>

        {titleError ? (
          <Text style={styles.fieldError}>{t('errors.VALIDATION_FAILED')}</Text>
        ) : null}

        {pages.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabRow}
          >
            {pages.map((page, index) => {
              const selected = index === activeIndex;
              const invalid = showErrors && page.text.trim().length === 0;
              return (
                <Pressable
                  key={page.pageNumber}
                  onPress={() => setSelectedIndex(index)}
                  accessibilityRole="button"
                  accessibilityLabel={t('illustrate.progressPage', { number: page.pageNumber })}
                  accessibilityState={{ selected }}
                  style={[
                    styles.tab,
                    selected ? styles.tabSelected : styles.tabIdle,
                    invalid && styles.tabInvalid,
                  ]}
                >
                  <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>
                    {t('illustrate.progressPage', { number: page.pageNumber })}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* Edit area */}
      <ScrollView
        style={styles.editArea}
        contentContainerStyle={styles.editContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activePage != null ? (
          <>
            <View style={styles.illustration}>
              <LinearGradient
                colors={gradients.childAvatar as unknown as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {activeIllustrationUrl != null ? (
                <Image
                  source={{ uri: activeIllustrationUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.illustrationEmoji}>
                  {PAGE_EMOJI[(activePage.pageNumber - 1) % PAGE_EMOJI.length]}
                </Text>
              )}
              <Pressable
                onPress={() => router.push(`/story/${story.id}/illustrate` as never)}
                accessibilityRole="button"
                accessibilityLabel={t('storyResult.editIllustrationCta')}
                style={({ pressed }) => [styles.regenButton, { opacity: pressed ? 0.7 : 1 }]}
              >
                <AppIcon name="palette" size={14} color={colors.primary} />
                <Text style={styles.regenLabel}>{t('storyResult.editIllustrationCta')}</Text>
              </Pressable>
            </View>

            <Input
              label={t('storyResult.editPageTextLabel', { page: activePage.pageNumber })}
              value={activePage.text}
              onChangeText={(text) => setPageText(activePage.pageNumber, text)}
              error={
                showErrors && activePage.text.trim().length === 0
                  ? t('errors.VALIDATION_FAILED')
                  : undefined
              }
              multiline
              maxLength={2000}
              style={styles.pageInput}
              accessibilityLabel={t('storyResult.editPageTextLabel', {
                page: activePage.pageNumber,
              })}
            />
            <Text style={styles.charCount}>
              {t('storyResult.editCharCount', { count: activePage.text.length })}
            </Text>
          </>
        ) : null}

        {serverError != null ? <Text style={styles.serverError}>{serverError}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
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
  eyebrow: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.xs,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
    marginBottom: 2,
  },
  titleInput: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.foreground,
    padding: 0,
  },
  titleInputError: {
    borderBottomWidth: 1,
    borderBottomColor: colors.destructive,
  },
  saveButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.chip,
    backgroundColor: colors.primary,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.md,
    color: colors.primaryForeground,
  },
  fieldError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    marginBottom: spacing.xs,
  },
  tabRow: { gap: 6 },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10 },
  tabSelected: { backgroundColor: colors.primary },
  tabIdle: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  tabInvalid: { borderWidth: 1, borderColor: colors.destructive },
  tabLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  tabLabelSelected: { color: colors.primaryForeground },
  editArea: { flex: 1 },
  editContent: { padding: spacing.lg },
  illustration: {
    height: 200,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  illustrationEmoji: { fontSize: 60 },
  regenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  regenLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  pageInput: {
    minHeight: 160,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.displayItalic,
    fontSize: fontSizes.xl,
    lineHeight: 26,
  },
  charCount: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    marginTop: 6,
  },
  serverError: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
