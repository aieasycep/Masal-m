import { StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '@masalim/ui';

type AvatarKind = 'child' | 'systemVoice' | 'parentVoice';

const KIND_GRADIENTS: Record<AvatarKind, readonly string[]> = {
  child: gradients.childAvatar,
  systemVoice: gradients.systemVoiceAvatar,
  parentVoice: gradients.parentVoiceAvatar,
};

interface AvatarProps {
  emoji: string;
  size?: number;
  kind?: AvatarKind;
}

/** Gradient emoji avatar circle (children, voices). */
export function Avatar({ emoji, size = 48, kind = 'child' }: AvatarProps) {
  return (
    <LinearGradient
      colors={KIND_GRADIENTS[kind] as unknown as [string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={{ fontSize: size / 2 }}>{emoji}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
