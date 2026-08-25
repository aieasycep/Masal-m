import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '@masalim/ui';
import type { PreviewStatus } from '../lib/preview-player';
import { PauseIcon, PlayIcon } from './icons';

interface AudioPreviewButtonProps {
  status: PreviewStatus | 'disabled';
  onPress?: () => void;
  size?: 'sm' | 'md';
}

/**
 * `Audio/PreviewButton` from the final design: compact circular play control for
 * voice previews (idle ▶ / loading spinner / playing ⏸ / error retry / disabled).
 */
export function AudioPreviewButton({ status, onPress, size = 'md' }: AudioPreviewButtonProps) {
  const { t } = useTranslation();
  const dim = size === 'md' ? 40 : 32;
  const icon = size === 'md' ? 16 : 12;
  const disabled = status === 'disabled';
  const playing = status === 'playing';

  const background = disabled
    ? colors.muted
    : status === 'error'
      ? 'rgba(224, 84, 84, 0.1)'
      : playing
        ? colors.primary
        : colors.secondary;
  const tint = disabled
    ? colors.mutedForeground
    : status === 'error'
      ? colors.destructive
      : playing
        ? colors.primaryForeground
        : colors.primary;

  const label =
    status === 'playing'
      ? t('preview.pause')
      : status === 'loading'
        ? t('preview.loading')
        : status === 'error'
          ? t('preview.retry')
          : t('preview.play');

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: playing }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.root,
        { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: background },
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {status === 'loading' ? (
        <ActivityIndicator size="small" color={tint} />
      ) : playing ? (
        <PauseIcon size={icon} color={tint} />
      ) : (
        <View style={styles.playNudge}>
          <PlayIcon size={icon} color={tint} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.8 },
  playNudge: { marginLeft: 1 },
});
