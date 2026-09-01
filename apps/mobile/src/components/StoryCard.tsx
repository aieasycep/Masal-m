import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { DURATION_TARGETS } from '@masalim/types';
import type { StorySummary } from '@masalim/validation';
import {
  colors,
  coverTints,
  fontFamilies,
  fontSizes,
  gradients,
  radius,
  shadows,
} from '@masalim/ui';

interface StoryCardVerticalProps {
  story: StorySummary;
  onPress: () => void;
  /** Position in the carousel — picks the fallback cover tint. */
  index?: number;
}

interface StoryCardWideProps {
  story: StorySummary;
  onPress: () => void;
  /** 0–100; renders the accent label + progress bar when provided. */
  progressPercent?: number;
}

/** "{X dk}" from the story's duration target. */
function useDurationLabel(story: StorySummary): string {
  const { t } = useTranslation();
  return t('common.minutesShort', { count: DURATION_TARGETS[story.durationTarget].minutes });
}

/**
 * 140px vertical story card ("En son oluşturdukların" carousel; reused by the
 * Library grid). Cover: image when available, otherwise tinted emoji block.
 */
export function StoryCardVertical({ story, onPress, index = 0 }: StoryCardVerticalProps) {
  const duration = useDurationLabel(story);
  const narrator = story.latestNarration?.narratorName ?? '';
  const meta = narrator ? `${duration} · ${narrator}` : duration;
  const tint = coverTints[index % coverTints.length] ?? coverTints[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={story.title}
      style={({ pressed }) => [styles.vCard, shadows.cardSubtle, { opacity: pressed ? 0.88 : 1 }]}
    >
      <View style={[styles.vCover, { backgroundColor: tint }]}>
        {story.coverImageUrl != null ? (
          <Image
            source={{ uri: story.coverImageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={styles.vCoverEmoji}>⭐</Text>
        )}
      </View>
      <View style={styles.vBody}>
        <Text style={styles.vTitle} numberOfLines={2}>
          {story.title}
        </Text>
        <Text style={styles.vMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </Pressable>
  );
}

/** Wide continue-listening card: gradient cover band, meta row, progress track. */
export function StoryCardWide({ story, onPress, progressPercent }: StoryCardWideProps) {
  const { t } = useTranslation();
  const duration = useDurationLabel(story);
  const narrator = story.latestNarration?.narratorName ?? '';
  const meta = narrator ? `${narrator} · ${duration}` : duration;
  const percent =
    progressPercent == null ? null : Math.round(Math.min(Math.max(progressPercent, 0), 100));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={story.title}
      style={({ pressed }) => [styles.wCard, shadows.cardMedium, { opacity: pressed ? 0.9 : 1 }]}
    >
      <LinearGradient
        colors={gradients.childAvatar as unknown as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.wCover}
      >
        <Text style={styles.wCoverEmoji}>⭐</Text>
      </LinearGradient>
      <View style={styles.wBody}>
        <Text style={styles.wTitle} numberOfLines={1}>
          {story.title}
        </Text>
        <View style={styles.wMetaRow}>
          <Text style={styles.wMeta} numberOfLines={1}>
            {meta}
          </Text>
          {percent != null ? (
            <>
              <View style={styles.wDot} />
              <Text style={styles.wPercent}>{t('home.percentCompleted', { percent })}</Text>
            </>
          ) : null}
        </View>
        {percent != null ? (
          <View style={styles.wTrack}>
            <LinearGradient
              colors={gradients.progress as unknown as [string, string]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.wFill, { width: `${percent}%` }]}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  vCard: {
    width: 140,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  vCover: { height: 100, alignItems: 'center', justifyContent: 'center' },
  vCoverEmoji: { fontSize: 36 },
  vBody: { paddingVertical: 10, paddingHorizontal: 12 },
  vTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.md,
    color: colors.foreground,
    lineHeight: 17,
    marginBottom: 4,
  },
  vMeta: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  wCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  wCover: { height: 80, alignItems: 'center', justifyContent: 'center' },
  wCoverEmoji: { fontSize: 36 },
  wBody: { paddingVertical: 14, paddingHorizontal: 16 },
  wTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.xl,
    color: colors.foreground,
    marginBottom: 4,
  },
  wMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wMeta: {
    flexShrink: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
  },
  wDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.mutedForeground,
    opacity: 0.4,
  },
  wPercent: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.accent,
  },
  wTrack: {
    marginTop: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
    overflow: 'hidden',
  },
  wFill: { height: '100%', borderRadius: 2 },
});
