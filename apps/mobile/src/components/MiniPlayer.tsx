import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useActiveTrack, useIsPlaying } from 'react-native-track-player';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { MINI_PLAYER_HEIGHT } from '../lib/dock';
import { togglePlay, usePlayerProgress } from '../lib/player';
import { usePlayerStore } from '../stores/player';
import { PauseIcon, PlayIcon } from './icons';

/**
 * `Audio/MiniPlayer` (design Components): pinned above the tab bar whenever a
 * narration is loaded in the single RNTP queue — the parent keeps listening
 * while browsing. Hidden for voice previews (they carry no story) and when
 * the queue no longer holds the recorded narration.
 */
export function MiniPlayer() {
  const { t } = useTranslation();
  const nowPlaying = usePlayerStore((state) => state.nowPlaying);
  const activeTrack = useActiveTrack();
  const { playing } = useIsPlaying();
  const { position, duration } = usePlayerProgress(1000);

  if (nowPlaying == null || activeTrack == null || activeTrack.id !== nowPlaying.narrationId) {
    return null;
  }
  const percent = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const isPlaying = playing === true;

  return (
    <View style={styles.bar} accessibilityRole="toolbar">
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>
      <Pressable
        onPress={() =>
          router.push(
            `/story/${nowPlaying.storyId}/player?narrationId=${nowPlaying.narrationId}` as never,
          )
        }
        accessibilityRole="button"
        accessibilityLabel={t('miniPlayer.open')}
        style={({ pressed }) => [styles.body, { opacity: pressed ? 0.85 : 1 }]}
      >
        <View style={styles.artwork}>
          {nowPlaying.artworkUrl != null ? (
            <Image
              source={{ uri: nowPlaying.artworkUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={styles.artworkEmoji}>📖</Text>
          )}
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {nowPlaying.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {nowPlaying.subtitle}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() => void togglePlay().catch(() => {})}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? t('miniPlayer.pause') : t('miniPlayer.play')}
        hitSlop={8}
        style={({ pressed }) => [styles.playButton, { opacity: pressed ? 0.8 : 1 }]}
      >
        {isPlaying ? (
          <PauseIcon size={18} color={colors.primaryForeground} />
        ) : (
          <PlayIcon size={18} color={colors.primaryForeground} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: MINI_PLAYER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.muted,
  },
  progressFill: { height: 2, backgroundColor: colors.primary },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkEmoji: { fontSize: 22 },
  textBlock: { flex: 1 },
  title: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.base, color: colors.foreground },
  subtitle: { fontFamily: fontFamilies.body, fontSize: fontSizes.md, color: colors.mutedForeground },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
