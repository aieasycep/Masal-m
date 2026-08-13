import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { UpdateStoryInput } from '@masalim/validation';
import { ApiError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { Button } from '../../../src/components/Button';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { ErrorState } from '../../../src/components/states';

interface EditablePage {
  pageNumber: number;
  text: string;
}

/**
 * Story text editor: title + per-page text. Saving bumps the story version
 * server-side (the previous revision is archived) — no version UI needed here.
 */
export default function StoryEdit() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [pages, setPages] = useState<EditablePage[]>([]);
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
        <ScreenHeader title={t('storyResult.edit')} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
        </View>
      </Screen>
    );
  }

  if (storyQuery.isError || story == null) {
    return (
      <Screen scroll={false}>
        <ScreenHeader title={t('storyResult.edit')} />
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

  return (
    <Screen>
      <ScreenHeader title={t('storyResult.edit')} eyebrow={story.title} />

      <View style={styles.form}>
        <Input
          label={t('storyResult.editTitleLabel')}
          value={title}
          onChangeText={setTitle}
          error={
            showErrors && title.trim().length === 0 ? t('errors.VALIDATION_FAILED') : undefined
          }
          accessibilityLabel={t('storyResult.editTitleLabel')}
          autoCapitalize="sentences"
          maxLength={120}
        />

        {pages.map((page) => (
          <Input
            key={page.pageNumber}
            label={t('storyResult.editPageLabel', { page: page.pageNumber })}
            value={page.text}
            onChangeText={(text) => setPageText(page.pageNumber, text)}
            error={
              showErrors && page.text.trim().length === 0
                ? t('errors.VALIDATION_FAILED')
                : undefined
            }
            multiline
            maxLength={2000}
            style={styles.pageInput}
            accessibilityLabel={t('storyResult.editPageLabel', { page: page.pageNumber })}
          />
        ))}

        {serverError != null ? <Text style={styles.error}>{serverError}</Text> : null}

        <Button label={t('common.save')} onPress={save} loading={updateMutation.isPending} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  form: { gap: spacing.xl },
  pageInput: {
    minHeight: 140,
    textAlignVertical: 'top',
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    lineHeight: 24,
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
});
