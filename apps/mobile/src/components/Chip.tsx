import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  emoji?: string;
}

/** Selectable chip (hero types, interests): 2px border flips to primary + text tint. */
export function Chip({ label, selected, onPress, emoji }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
    >
      {emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 2,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.secondary },
  chipUnselected: { borderColor: colors.border, backgroundColor: colors.card },
  emoji: { fontSize: 16 },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.foreground,
  },
  labelSelected: { color: colors.primary, fontFamily: fontFamilies.bodyBold },
});
