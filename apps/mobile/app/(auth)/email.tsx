import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LinearGradient } from 'expo-linear-gradient';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@masalim/validation';
import type { AuthSession } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';

/** Soft lavender wash behind the header — rgba stops derive from colors.lavender (#B09CE0). */
const HEADER_WASH = ['rgba(176,156,224,0.1)', 'rgba(176,156,224,0)'] as const;

const formSchema = z.object({
  name: z.string(),
  email: z.string().trim().toLowerCase().email('VALIDATION_FAILED'),
  password: z.string().min(1, 'VALIDATION_FAILED'),
});
type FormValues = z.infer<typeof formSchema>;

type Mode = 'signIn' | 'signUp';
type ViewState = 'auth' | 'forgot';
type ForgotStep = 'request' | 'reset';

/** Error banner card (design form spec) — tints derive from colors.destructive (#E05454). */
function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner} accessibilityLiveRegion="polite">
      <Text style={styles.errorBannerText}>⚠ {message}</Text>
    </View>
  );
}

/** Success notice in the same banner language — tints derive from colors.sage (#8DB89A). */
function NoticeBanner({ message }: { message: string }) {
  return (
    <View style={styles.noticeBanner} accessibilityLiveRegion="polite">
      <Text style={styles.noticeBannerText}>{message}</Text>
    </View>
  );
}

/** E-mail sign-in / sign-up + inline two-step forgot-password flow. */
export default function EmailAuth() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string }>();
  const setSession = useAuthStore((state) => state.setSession);

  const [view, setView] = useState<ViewState>('auth');
  const [mode, setMode] = useState<Mode>(params.mode === 'signUp' ? 'signUp' : 'signIn');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [forgotStep, setForgotStep] = useState<ForgotStep>('request');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const { control, handleSubmit, getValues } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const messageFor = (err: unknown): string => {
    if (err instanceof ApiError) {
      return t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (err instanceof z.ZodError) return t('errors.VALIDATION_FAILED');
    if (err instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  const completeSession = async (session: AuthSession) => {
    await setSession(session);
    if (session.user.onboardingCompleted) {
      router.replace('/(tabs)/home');
    } else {
      router.replace('/children/new');
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        const input = registerSchema.parse({
          email: values.email,
          password: values.password,
          name: values.name,
        });
        await completeSession(await api.auth.register(input));
      } else {
        const input = loginSchema.parse({ email: values.email, password: values.password });
        await completeSession(await api.auth.login(input));
      }
    } catch (err) {
      setServerError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  });

  const openForgot = () => {
    setServerError(null);
    setNotice(null);
    setForgotStep('request');
    setForgotEmail(getValues('email'));
    setView('forgot');
  };

  const submitForgotRequest = async () => {
    setServerError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const input = forgotPasswordSchema.parse({ email: forgotEmail });
      await api.auth.forgotPassword(input);
      setForgotStep('reset');
      setNotice(t('auth.codeSent'));
    } catch (err) {
      setServerError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitReset = async () => {
    setServerError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const input = resetPasswordSchema.parse({
        email: forgotEmail,
        code: resetCode,
        newPassword,
      });
      await api.auth.resetPassword(input);
      setResetCode('');
      setNewPassword('');
      setForgotStep('request');
      setView('auth');
      setMode('signIn');
      setNotice(t('auth.passwordResetSuccess'));
    } catch (err) {
      setServerError(messageFor(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    setServerError(null);
    setNotice(null);
    if (view === 'forgot') {
      if (forgotStep === 'reset') {
        setForgotStep('request');
      } else {
        setView('auth');
      }
      return;
    }
    router.back();
  };

  const switchMode = () => {
    setServerError(null);
    setNotice(null);
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
  };

  const headerTitle =
    view === 'auth'
      ? mode === 'signIn'
        ? t('auth.signIn')
        : t('auth.signUp')
      : forgotStep === 'request'
        ? t('auth.resetPasswordTitle')
        : undefined;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.root}>
        {/* Welcome (beneath in the stack) sets a light status bar over its night hero. */}
        <StatusBar style="dark" />
        <LinearGradient
          colors={HEADER_WASH as unknown as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerWash}
          pointerEvents="none"
        />
        <Screen backgroundColor="transparent">
          <ScreenHeader onBack={handleBack} title={headerTitle} />

          {view === 'auth' ? (
            <>
              <View style={styles.fields}>
                {mode === 'signUp' ? (
                  <Controller
                    control={control}
                    name="name"
                    render={({ field, fieldState }) => (
                      <Input
                        label={t('auth.name')}
                        placeholder={t('auth.namePlaceholder')}
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        autoCapitalize="words"
                        autoComplete="name"
                        error={
                          fieldState.error != null ? t('errors.VALIDATION_FAILED') : undefined
                        }
                      />
                    )}
                  />
                ) : null}

                <Controller
                  control={control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <Input
                      label={t('auth.email')}
                      placeholder={t('auth.emailPlaceholder')}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      error={fieldState.error != null ? t('errors.VALIDATION_FAILED') : undefined}
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <Input
                      label={t('auth.password')}
                      placeholder={t('auth.passwordPlaceholder')}
                      value={field.value}
                      onChangeText={field.onChange}
                      onBlur={field.onBlur}
                      secureTextEntry
                      autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                      error={fieldState.error != null ? t('errors.VALIDATION_FAILED') : undefined}
                    />
                  )}
                />
              </View>

              {notice != null ? <NoticeBanner message={notice} /> : null}
              {serverError != null ? <ErrorBanner message={serverError} /> : null}

              <Button
                label={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
                loadingLabel={mode === 'signIn' ? t('auth.signingIn') : t('auth.signingUp')}
                onPress={() => void onSubmit()}
                loading={submitting}
                style={styles.cta}
              />

              {mode === 'signIn' ? (
                <Pressable
                  onPress={openForgot}
                  accessibilityRole="button"
                  style={styles.centerLink}
                >
                  <Text style={styles.linkText}>{t('auth.forgotPassword')}</Text>
                </Pressable>
              ) : null}

              <View style={styles.divider} />
              <View style={styles.switchRow}>
                <Text style={styles.switchText}>
                  {mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')}
                </Text>
                <Pressable onPress={switchMode} accessibilityRole="button">
                  <Text style={styles.linkText}>
                    {mode === 'signIn' ? t('auth.signUp') : t('auth.signIn')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : forgotStep === 'request' ? (
            <>
              <Text style={styles.forgotBody}>{t('auth.resetPasswordBody')}</Text>

              <View style={styles.fields}>
                <Input
                  label={t('auth.email')}
                  placeholder={t('auth.emailPlaceholder')}
                  value={forgotEmail}
                  onChangeText={setForgotEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                />
              </View>

              {serverError != null ? <ErrorBanner message={serverError} /> : null}

              <Button
                label={t('auth.sendCode')}
                loadingLabel={t('auth.sending')}
                onPress={() => void submitForgotRequest()}
                loading={submitting}
                style={styles.cta}
              />
            </>
          ) : (
            <>
              {/* Check-your-email hero — sage circle tints derive from colors.sage (#8DB89A). */}
              <View style={styles.checkEmail}>
                <View style={styles.mailCircle}>
                  <Text style={styles.mailEmoji}>✉️</Text>
                </View>
                <Text style={styles.checkTitle} accessibilityRole="header">
                  {t('auth.checkEmailTitle')}
                </Text>
                <Text style={styles.checkBody}>
                  {t('auth.checkEmailBody', { email: forgotEmail })}
                </Text>
              </View>

              <View style={styles.fields}>
                <Input
                  label={t('auth.code')}
                  value={resetCode}
                  onChangeText={setResetCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoComplete="one-time-code"
                />
                <Input
                  label={t('auth.newPassword')}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoComplete="new-password"
                />
              </View>

              {notice != null ? <NoticeBanner message={notice} /> : null}
              {serverError != null ? <ErrorBanner message={serverError} /> : null}

              <Button
                label={t('auth.resetPassword')}
                loadingLabel={t('auth.sending')}
                onPress={() => void submitReset()}
                loading={submitting}
                style={styles.cta}
              />

              <Pressable
                onPress={() => void submitForgotRequest()}
                disabled={submitting}
                accessibilityRole="button"
                style={styles.centerLink}
              >
                <Text style={styles.linkText}>{t('auth.resendCode')}</Text>
              </Pressable>
            </>
          )}
        </Screen>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: colors.background },
  headerWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
  },
  fields: { gap: spacing.md },
  forgotBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  linkText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  cta: { marginTop: spacing.xl },
  centerLink: { alignSelf: 'center', marginTop: spacing.md },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xl,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  switchText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  // Banner tints derive from colors.destructive (#E05454).
  errorBanner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(224,84,84,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(224,84,84,0.2)',
    marginTop: spacing.lg,
  },
  errorBannerText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  // Banner tints derive from colors.sage (#8DB89A).
  noticeBanner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(141,184,154,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(141,184,154,0.35)',
    marginTop: spacing.lg,
  },
  noticeBannerText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.sage,
  },
  checkEmail: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  mailCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.round,
    backgroundColor: 'rgba(141,184,154,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(141,184,154,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  mailEmoji: { fontSize: 44 },
  checkTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h1,
    color: colors.foreground,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 10,
  },
  checkBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    lineHeight: 24,
    textAlign: 'center',
  },
});
