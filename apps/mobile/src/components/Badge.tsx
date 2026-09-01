import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamilies, radius } from '@masalim/ui';

type BadgeVariant = 'personal' | 'primary' | 'success' | 'premium';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  uppercase?: boolean;
}

/** Small pill badges: "Kişisel" (coral), "Kitap hazır" (purple), "Hazır" (sage), "Premium". */
export function Badge({ label, variant = 'primary', uppercase = false }: BadgeProps) {
  return (
    <View style={[styles.badge, containerStyles[variant]]}>
      <Text style={[styles.text, textStyles[variant]]}>
        {uppercase ? label.toLocaleUpperCase('tr') : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.xs, paddingVertical: 2, paddingHorizontal: 8, alignSelf: 'flex-start' },
  text: { fontFamily: fontFamilies.bodyBold, fontSize: 11, letterSpacing: 0.4 },
});

const containerStyles = StyleSheet.create({
  personal: { backgroundColor: 'rgba(240,139,110,0.12)' },
  primary: { backgroundColor: colors.secondary },
  success: { backgroundColor: 'rgba(141,184,154,0.15)' },
  premium: { backgroundColor: 'rgba(255,217,125,0.25)' },
});

const textStyles = StyleSheet.create({
  personal: { color: colors.coral },
  primary: { color: colors.primary },
  success: { color: colors.sageText },
  premium: { color: '#A67C00' },
});
