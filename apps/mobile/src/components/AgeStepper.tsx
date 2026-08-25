import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { AGE_YEARS_MAX, AGE_YEARS_MIN, clampAgeYears } from '../lib/age';

interface AgeStepperProps {
  value: number;
  onChange: (years: number) => void;
  /** "yaş" unit shown after the value (i18n `wizard.ageUnit`). */
  unitLabel: string;
  decrementLabel: string;
  incrementLabel: string;
}

/** −/+ exact-age stepper from Child/01: 44px circles, Fraunces value, 0–12. */
export function AgeStepper({
  value,
  onChange,
  unitLabel,
  decrementLabel,
  incrementLabel,
}: AgeStepperProps) {
  const atMin = value <= AGE_YEARS_MIN;
  const atMax = value >= AGE_YEARS_MAX;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(clampAgeYears(value - 1))}
        disabled={atMin}
        accessibilityRole="button"
        accessibilityLabel={decrementLabel}
        accessibilityState={{ disabled: atMin }}
        style={[styles.button, styles.buttonMinus, atMin && styles.buttonDisabled]}
      >
        <Text style={styles.minusGlyph}>−</Text>
      </Pressable>
      <View style={styles.valueBlock}>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unitLabel}</Text>
      </View>
      <Pressable
        onPress={() => onChange(clampAgeYears(value + 1))}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityLabel={incrementLabel}
        accessibilityState={{ disabled: atMax }}
        style={[styles.button, styles.buttonPlus, atMax && styles.buttonDisabled]}
      >
        <Text style={styles.plusGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMinus: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  buttonPlus: { backgroundColor: colors.secondary },
  buttonDisabled: { opacity: 0.4 },
  minusGlyph: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.h3,
    color: colors.foreground,
  },
  plusGlyph: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.h3,
    color: colors.primary,
  },
  valueBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  value: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.displayLg,
    color: colors.foreground,
  },
  unit: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
});
