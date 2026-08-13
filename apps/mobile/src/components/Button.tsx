import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fontFamilies, fontSizes, gradients, radius, shadows } from '@masalim/ui';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive' | 'ghostDark';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Optional leading element (e.g. play icon). */
  leading?: ReactNode;
  style?: ViewStyle;
  compact?: boolean;
}

/** Design-system button: Primary/Secondary/Tertiary/Destructive + Loading/Disabled states. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  leading,
  style,
  compact = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const paddingVertical = compact ? 14 : 18;

  const content = (
    <View style={styles.contentRow}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.primaryForeground : colors.primary} />
      ) : (
        <>
          {leading}
          <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
        </>
      )}
    </View>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
        style={({ pressed }) => [
          styles.base,
          shadows.primaryCta,
          { opacity: isDisabled ? 0.6 : pressed ? 0.92 : 1 },
          style,
        ]}
      >
        <LinearGradient
          colors={gradients.primaryCta as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, { paddingVertical }]}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        { paddingVertical },
        containerStyles[variant],
        { opacity: isDisabled ? 0.6 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, overflow: 'hidden' },
  gradient: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
  contentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { fontFamily: fontFamilies.bodyExtraBold, fontSize: fontSizes.xxl },
});

const containerStyles: Record<Exclude<ButtonVariant, 'primary'>, ViewStyle> = {
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tertiary: { backgroundColor: 'transparent', alignItems: 'center' },
  destructive: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  ghostDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
};

const labelStyles = StyleSheet.create({
  primary: { color: colors.primaryForeground },
  secondary: { color: colors.primary, fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg },
  tertiary: {
    color: colors.mutedForeground,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
  },
  destructive: {
    color: colors.destructive,
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
  },
  ghostDark: {
    color: 'rgba(255,255,255,0.7)',
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
  },
});
