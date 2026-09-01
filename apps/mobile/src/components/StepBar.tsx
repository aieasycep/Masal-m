import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamilies } from '@masalim/ui';

interface StepBarProps {
  /** Ordered step captions (final design: 3 segments — Kitap · Adres · Özet). */
  labels: string[];
  /** Zero-based index of the active step; earlier steps render as done. */
  activeIndex: number;
}

/** Shared checkout progress bar (labeled segments). */
export function StepBar({ labels, activeIndex }: StepBarProps) {
  return (
    <View style={styles.root} accessibilityRole="progressbar">
      {labels.map((label, i) => {
        const reached = i <= activeIndex;
        const active = i === activeIndex;
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.bar, reached ? styles.barReached : null]} />
            <Text
              style={[
                styles.caption,
                reached ? styles.captionReached : null,
                active ? styles.captionActive : null,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, gap: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  barReached: { backgroundColor: colors.primary },
  caption: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  captionReached: { color: colors.foreground },
  captionActive: { fontFamily: fontFamilies.bodyExtraBold, color: colors.primary },
});
