import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, radius } from '@masalim/ui';
import { EyeIcon, EyeOffIcon } from './icons';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

/**
 * Design-system text input: white fill, 2px border, radius 16; error tint.
 * `secureTextEntry` fields get the QA-mandated show/hide toggle (44×44 target).
 */
export function Input({ label, error, style, secureTextEntry, ...rest }: InputProps) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const isPassword = secureTextEntry === true;

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label.toLocaleUpperCase('tr')}</Text> : null}
      <View>
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={isPassword && !revealed}
          style={[
            styles.input,
            isPassword && styles.inputWithToggle,
            error != null && styles.inputError,
            style,
          ]}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setRevealed((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            style={styles.eyeButton}
          >
            {revealed ? (
              <EyeOffIcon color={colors.mutedForeground} />
            ) : (
              <EyeIcon color={colors.mutedForeground} />
            )}
          </Pressable>
        ) : null}
      </View>
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
  inputWithToggle: { paddingRight: 52 },
  eyeButton: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputError: { borderColor: colors.destructive },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.destructive,
  },
});
