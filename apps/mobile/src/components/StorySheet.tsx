import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@masalim/api-client';
import type { StoryTheme } from '@masalim/types';
import type { StorySummary } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { AppIcon, type AppIconName } from './AppIcon';
import { api } from '../lib/api';
import { ConfirmSheet } from './ConfirmSheet';

/** Fallback cover emoji per story theme (design shows themed emoji tiles). */
const THEME_EMOJIS: Record<StoryTheme, string> = {
  ADVENTURE: '⚔️',
  SLEEP: '🌙',
  FRIENDSHIP: '🤝',
  COURAGE: '🦁',
  ANIMALS: '🐻',
  SPACE: '🚀',
  FAIRY_TALE: '🏰',
  EMOTIONS: '💛',
  EDUCATIONAL: '📚',
  FANTASY: '🦄',
  SEA: '🐠',
  NATURE: '🌿',
  IMAGINATION: '✨',
};

/** Emoji for a story's tinted cover fallback — driven by its first theme. */
export function storyThemeEmoji(themes: readonly StoryTheme[]): string {
  const first = themes[0];
  return first != null ? THEME_EMOJIS[first] : '⭐';
}

type BusyAction = 'duplicate' | 'favorite' | 'delete';

interface StorySheetProps {
  /** Story the sheet acts on; null hides the sheet. */
  story: StorySummary | null;
  onClose: () => void;
  /** Called after a mutation succeeded (duplicate/favorite/delete). */
  onChanged?: () => void;
}

interface ActionRowProps {
  icon: AppIconName;
  filled?: boolean;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

/** 44px tappable action row: emoji + Nunito 15/600 label (+ spinner while mutating). */
function ActionRow({ icon, filled, label, onPress, destructive, disabled, loading }: ActionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      style={({ pressed }) => [styles.actionRow, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}
    >
      <AppIcon
        name={icon}
        size={20}
        color={destructive === true ? colors.error : colors.foreground}
        filled={filled === true}
      />
      <Text style={[styles.actionLabel, destructive === true && styles.actionLabelDestructive]}>
        {label}
      </Text>
      {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
    </Pressable>
  );
}

/**
 * Story action bottom sheet (Library kebab/long-press): listen (when a
 * narration exists), read, duplicate, favorite toggle and delete (with nested
 * confirmation). Follows the ConfirmSheet structure: backdrop + sheet + grabber.
 */
export function StorySheet({ story, onClose, onChanged }: StorySheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  // Keep the last story around so the slide-out animation still has content.
  const lastStoryRef = useRef<StorySummary | null>(null);
  if (story != null) lastStoryRef.current = story;
  const active = story ?? lastStoryRef.current;

  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (active == null) return null;

  const close = () => {
    setConfirmDelete(false);
    setError(null);
    onClose();
  };

  const errorMessage = (err: unknown): string =>
    err instanceof ApiError
      ? t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') })
      : t('errors.OFFLINE');

  const invalidateStories = async (storyId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['stories'] });
    await queryClient.invalidateQueries({ queryKey: ['story', storyId] });
  };

  const openReader = () => {
    const storyId = active.id;
    close();
    router.push(`/story/${storyId}/reader` as never);
  };

  const latestNarration = active.latestNarration;
  const openPlayer = () => {
    if (latestNarration == null) return;
    const storyId = active.id;
    close();
    router.push(`/story/${storyId}/player?narrationId=${latestNarration.id}` as never);
  };

  const duplicate = async () => {
    if (busy != null) return;
    setBusy('duplicate');
    setError(null);
    try {
      const copy = await api.stories.duplicate(active.id);
      await invalidateStories(active.id);
      onChanged?.();
      close();
      router.push(`/story/${copy.id}` as never);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const toggleFavorite = async () => {
    if (busy != null) return;
    setBusy('favorite');
    setError(null);
    try {
      if (active.isFavorite) {
        await api.stories.unfavorite(active.id);
      } else {
        await api.stories.favorite(active.id);
      }
      await invalidateStories(active.id);
      onChanged?.();
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const removeStory = async () => {
    if (busy != null) return;
    setBusy('delete');
    setError(null);
    try {
      await api.stories.remove(active.id);
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
      onChanged?.();
      close();
    } catch (err) {
      setConfirmDelete(false);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={story != null} transparent animationType="slide" onRequestClose={close}>
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.grabber} />
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {active.title}
        </Text>
        {error != null ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          {latestNarration != null ? (
            <ActionRow
              icon="audio"
              label={t('library.actions.listen')}
              onPress={openPlayer}
              disabled={busy != null}
            />
          ) : null}
          <ActionRow
            icon="story"
            label={t('library.actions.read')}
            onPress={openReader}
            disabled={busy != null}
          />
          <ActionRow
            icon="copy"
            label={t('library.actions.duplicate')}
            onPress={() => void duplicate()}
            disabled={busy != null}
            loading={busy === 'duplicate'}
          />
          <ActionRow
            icon="favorite"
            filled={active.isFavorite}
            label={t(active.isFavorite ? 'library.actions.unfavorite' : 'library.actions.favorite')}
            onPress={() => void toggleFavorite()}
            disabled={busy != null}
            loading={busy === 'favorite'}
          />
          <ActionRow
            icon="delete"
            label={t('library.actions.delete')}
            onPress={() => setConfirmDelete(true)}
            destructive
            disabled={busy != null}
            loading={busy === 'delete'}
          />
        </View>
      </View>
      <ConfirmSheet
        visible={confirmDelete}
        title={t('library.deleteConfirmTitle')}
        body={t(active.hasBook ? 'library.deleteConfirmBodyWithBook' : 'library.deleteConfirmBody')}
        confirmLabel={t('library.actions.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void removeStory()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 15, 35, 0.45)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.pageX,
    paddingTop: 12,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 20,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h3,
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
    marginBottom: spacing.xxs,
  },
  actions: { marginTop: spacing.xxs },
  actionRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionLabel: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  actionLabelDestructive: { color: colors.destructive },
});
