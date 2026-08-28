import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, shadows, spacing } from '@masalim/ui';
import { Avatar } from './Avatar';

/** Avatar emoji choices from the design (Child/01). */
export const AVATAR_EMOJIS = ['🧒', '👧', '👦', '🐣', '⭐', '🌸', '🦋', '🐻'] as const;

/** Default avatar when a child has no `preferences.avatarEmoji` yet. */
export const DEFAULT_AVATAR_EMOJI = AVATAR_EMOJIS[0];

interface AvatarEmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

/**
 * Child avatar block from Child/01: 88px gradient circle with a white ring,
 * plus 8 selectable emoji swatches beneath it.
 */
export function AvatarEmojiPicker({ value, onChange }: AvatarEmojiPickerProps) {
  return (
    <View style={styles.root}>
      <View style={[styles.avatarRing, shadows.selectedCard]}>
        <Avatar emoji={value} size={88} kind="child" />
      </View>
      <View style={styles.row}>
        {AVATAR_EMOJIS.map((emoji) => {
          const selected = value === emoji;
          return (
            <Pressable
              key={emoji}
              onPress={() => onChange(emoji)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={emoji}
              style={[styles.swatch, selected ? styles.swatchSelected : styles.swatchUnselected]}
            >
              <Text style={styles.swatchEmoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.sm },
  // No overflow:hidden — it would clip the iOS shadow; the inner Avatar rounds itself.
  avatarRing: {
    borderWidth: 3,
    borderColor: colors.card,
    borderRadius: 50,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  swatchUnselected: { borderColor: colors.border, backgroundColor: colors.card },
  swatchEmoji: { fontSize: 20 },
});
