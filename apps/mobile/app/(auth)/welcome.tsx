import { useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import type { AuthSession } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, gradients, radius, spacing } from '@masalim/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../src/components/Button';
import { SocialAuthCancelled, signInWithApple, signInWithGoogle } from '../../src/lib/social-auth';
import { useAuthStore } from '../../src/stores/auth';
import { Screen } from '../../src/components/Screen';

type Provider = 'apple' | 'google';

function AppleLogo() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08ZM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25Z"
        fill={colors.primaryForeground}
      />
    </Svg>
  );
}

function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
        fill="#4285F4"
      />
      <Path
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24Z"
        fill="#34A853"
      />
      <Path
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09Z"
        fill="#FBBC05"
      />
      <Path
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
        fill="#EA4335"
      />
    </Svg>
  );
}

/** Soft lavender radial glow behind the hero block (mirrors the Home header). */
function HeroGlow() {
  return (
    <View style={styles.glowWrap} pointerEvents="none">
      <Svg width={320} height={320}>
        <Defs>
          <RadialGradient id="welcomeGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.lavender} stopOpacity={0.28} />
            <Stop offset="70%" stopColor={colors.lavender} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={colors.lavender} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={160} cy={160} r={160} fill="url(#welcomeGlow)" />
      </Svg>
    </View>
  );
}

interface ProviderButtonProps {
  label: string;
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  dark?: boolean;
  icon: ReactNode;
}

function ProviderButton({ label, onPress, loading, disabled, dark = false, icon }: ProviderButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.providerButton,
        dark ? styles.providerButtonDark : styles.providerButtonLight,
        { opacity: disabled && !loading ? 0.6 : pressed ? 0.88 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={dark ? colors.primaryForeground : colors.primary} />
      ) : (
        <>
          {icon}
          <Text style={[styles.providerLabel, dark ? styles.providerLabelDark : styles.providerLabelLight]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Welcome — warm cream landing with Apple/Google/E-mail auth entry points. */
export default function Welcome() {
  const { t } = useTranslation();
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const completeSession = async (session: AuthSession) => {
    await useAuthStore.getState().setSession(session);
    if (session.user.onboardingCompleted) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/children/new');
    }
  };

  const handleProvider = async (provider: Provider) => {
    if (pendingProvider != null) return;
    setServerError(null);
    setPendingProvider(provider);
    try {
      const session = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      await completeSession(session);
    } catch (err) {
      if (err instanceof SocialAuthCancelled) {
        // User dismissed the provider sheet — stay silent.
      } else if (err instanceof ApiError) {
        setServerError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof NetworkError) {
        setServerError(t('errors.OFFLINE'));
      } else {
        setServerError(t('errors.GENERIC'));
      }
    } finally {
      setPendingProvider(null);
    }
  };

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.hero}>
        <HeroGlow />
        <LinearGradient
          colors={gradients.childAvatar as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoBadge}
        >
          <Text style={styles.logoEmoji}>📖</Text>
        </LinearGradient>
        <Text style={styles.title} accessibilityRole="header">
          {t('auth.welcomeTitle')}
        </Text>
        <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>
      </View>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' ? (
          <ProviderButton
            label={t('auth.continueWithApple')}
            onPress={() => void handleProvider('apple')}
            loading={pendingProvider === 'apple'}
            disabled={pendingProvider != null}
            dark
            icon={<AppleLogo />}
          />
        ) : null}
        <ProviderButton
          label={t('auth.continueWithGoogle')}
          onPress={() => void handleProvider('google')}
          loading={pendingProvider === 'google'}
          disabled={pendingProvider != null}
          icon={<GoogleGlyph />}
        />
        <Button
          label={t('auth.continueWithEmail')}
          variant="secondary"
          onPress={() => router.push('/(auth)/email')}
          disabled={pendingProvider != null}
        />
        {serverError != null ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {serverError}
          </Text>
        ) : null}
      </View>

      <View style={styles.spacer} />
      <Text style={styles.terms}>{t('auth.termsNotice')}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.pageXWide },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl,
    marginBottom: spacing.xxl,
  },
  glowWrap: {
    position: 'absolute',
    top: -40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoEmoji: { fontSize: 44 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
  buttons: { gap: spacing.sm },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: radius.lg,
  },
  // Apple HIG requires the pure-black "Continue with Apple" button.
  providerButtonDark: { backgroundColor: '#000000' },
  providerButtonLight: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerLabel: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.xl },
  providerLabelDark: { color: colors.primaryForeground },
  providerLabelLight: { color: colors.foreground },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    textAlign: 'center',
    marginTop: spacing.xxs,
  },
  spacer: { flex: 1 },
  terms: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
