import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

/** Design-system text input: white fill, 2px border, radius 16; error tint. */
export function Input({ label, error, style, ...rest }: InputProps) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label.toLocaleUpperCase('tr')}</Text> : null}
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, error != null && styles.inputError, style]}
        {...rest}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.xl,
    color: colors.foreground,
  },
  inputError: { borderColor: colors.destructive },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
  },
});
