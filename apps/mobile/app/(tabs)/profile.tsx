import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

/** Profile shell with a working sign-out; full sections land in the design pass. */
export default function Profile() {
  const { t } = useTranslation();
  const clearSession = useAuthStore((state) => state.clearSession);

  const signOut = async () => {
    try {
      await api.auth.logout();
    } catch {
      // Signing out locally always succeeds even if the API call fails.
    }
    await clearSession();
    router.replace('/(onboarding)/splash');
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{t('profile.title')}</Text>
      <Pressable style={styles.signOut} onPress={signOut} accessibilityRole="button">
        <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: spacing.pageTop,
    paddingHorizontal: spacing.pageX,
  },
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayLg,
    color: colors.foreground,
  },
  signOut: {
    marginTop: spacing.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signOutText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.destructive,
  },
});
