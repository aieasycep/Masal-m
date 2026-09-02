import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AuthSession } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, gradients, radius, shadows, spacing } from '@masalim/ui';
import { AppIcon } from '../../src/components/AppIcon';
import { Starfield } from '../../src/components/Starfield';
import { SocialAuthCancelled, signInWithApple, signInWithGoogle } from '../../src/lib/social-auth';
import { useAuthStore } from '../../src/stores/auth';

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

/** Gentle vertical float (±6px), matching the design's `float` keyframes. */
function useFloatStyle(duration: number) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withRepeat(
      withTiming(-6, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [duration, offset]);

  return useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
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

/** Welcome — 280px night-gradient art header + Apple/Google/E-mail auth entry points. */
export default function Welcome() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const logoFloatStyle = useFloatStyle(3000);
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

  const busy = pendingProvider != null;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Night-gradient art header (design: 280px, 160deg). */}
      <LinearGradient
        colors={gradients.storyCover as unknown as [string, string, ...string[]]}
        locations={[0, 0.6, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.hero, { height: 280 + insets.top, paddingTop: insets.top }]}
      >
        <Starfield count={16} />
        <Animated.View style={[styles.logoTile, logoFloatStyle]}>
          <Text style={styles.logoEmoji}>📖</Text>
        </Animated.View>
        <Text style={styles.wordmark} accessibilityRole="header">
          {t('common.appName')}
        </Text>
      </LinearGradient>

      {/* Content */}
      <View style={styles.content}>
        <View>
          <Text style={styles.headline} accessibilityRole="header">
            {t('auth.welcomeHeadline')}
          </Text>
          <Text style={styles.body}>{t('auth.welcomeBody')}</Text>
        </View>

        <View style={styles.buttons}>
          {Platform.OS === 'ios' ? (
            <ProviderButton
              label={t('auth.continueWithApple')}
              onPress={() => void handleProvider('apple')}
              loading={pendingProvider === 'apple'}
              disabled={busy}
              dark
              icon={<AppleLogo />}
            />
          ) : null}
          <ProviderButton
            label={t('auth.continueWithGoogle')}
            onPress={() => void handleProvider('google')}
            loading={pendingProvider === 'google'}
            disabled={busy}
            icon={<GoogleGlyph />}
          />
          <Pressable
            onPress={() => router.push({ pathname: '/(auth)/email', params: { mode: 'signUp' } })}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('auth.continueWithEmail')}
            style={({ pressed }) => [
              styles.emailButton,
              shadows.primaryCta,
              { opacity: busy ? 0.6 : pressed ? 0.92 : 1 },
            ]}
          >
            <LinearGradient
              colors={gradients.primaryCta as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emailGradient}
            >
              <Text style={styles.emailLabel}>{t('auth.continueWithEmail')}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <View style={styles.signInRow}>
          <Text style={styles.signInText}>{t('auth.haveAccount')}</Text>
          <Pressable
            onPress={() => router.push('/(auth)/email')}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.signInLink}>{t('auth.signIn')}</Text>
          </Pressable>
        </View>

        {serverError != null ? (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <AppIcon name="alert" size={16} color={colors.error} />
            <Text style={styles.errorBannerText}>{serverError}</Text>
          </View>
        ) : null}

        <View style={styles.spacer} />
        <Text style={[styles.terms, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          {t('auth.termsNotice')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Floating glass tile — rgba whites over the night gradient, per the design.
  logoTile: {
    width: 88,
    height: 88,
    borderRadius: radius.hero + 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoEmoji: { fontSize: 44 },
  wordmark: {
    fontFamily: fontFamilies.display,
    // Design: 40px hero wordmark (between the displayXl and wordmark tokens).
    fontSize: 40,
    color: colors.primaryForeground,
    letterSpacing: -0.8,
  },
  content: {
    flex: 1,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.pageX,
    gap: spacing.xl,
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h1,
    color: colors.foreground,
    letterSpacing: -0.3,
    lineHeight: 32,
    marginBottom: 10,
  },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    lineHeight: 22,
  },
  buttons: { gap: 10 },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: radius.card,
  },
  // Apple HIG requires the pure-black "Continue with Apple" button.
  providerButtonDark: { backgroundColor: '#000000' },
  providerButtonLight: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
  },
  providerLabel: { fontFamily: fontFamilies.bodyBold, fontSize: fontSizes.lg },
  providerLabelDark: { color: colors.primaryForeground },
  providerLabelLight: { color: colors.foreground },
  emailButton: { borderRadius: radius.card, overflow: 'hidden' },
  emailGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius.card,
  },
  emailLabel: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.lg,
    color: colors.primaryForeground,
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  signInText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  signInLink: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  // Banner tints derive from colors.destructive (#E05454).
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(224,84,84,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224,84,84,0.2)',
  },
  errorBannerText: {
    flex: 1,
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
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
