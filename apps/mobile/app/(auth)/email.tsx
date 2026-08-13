import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@masalim/validation';
import type { AuthSession } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';

const formSchema = z.object({
  name: z.string(),
  email: z.string().trim().toLowerCase().email('VALIDATION_FAILED'),
  password: z.string().min(1, 'VALIDATION_FAILED'),
});
type FormValues = z.infer<typeof formSchema>;

type Mode = 'signIn' | 'signUp';
type ViewState = 'auth' | 'forgot';
type ForgotStep = 'request' | 'reset';

/** E-mail sign-in / sign-up + inline two-step forgot-password flow. */
export default function EmailAuth() {
  const { t } = useTranslation();
  const setSession = useAuthStore((state) => state.setSession);

  const [view, setView] = useState<ViewState>('auth');
  const [mode, setMode] = useState<Mode>('signIn');
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader onBack={handleBack} />

        {view === 'auth' ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
            </Text>
            <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>

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

              {mode === 'signIn' ? (
                <Pressable
                  onPress={openForgot}
                  accessibilityRole="button"
                  style={styles.forgotLink}
                >
                  <Text style={styles.linkText}>{t('auth.forgotPassword')}</Text>
                </Pressable>
              ) : null}
            </View>

            {notice != null ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {serverError != null ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {serverError}
              </Text>
            ) : null}

            <Button
              label={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
              onPress={() => void onSubmit()}
              loading={submitting}
              style={styles.cta}
            />

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
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">
              {t('auth.resetPasswordTitle')}
            </Text>
            <Text style={styles.subtitle}>{t('auth.resetPasswordBody')}</Text>

            <View style={styles.fields}>
              <Input
                label={t('auth.email')}
                placeholder={t('auth.emailPlaceholder')}
                value={forgotEmail}
                onChangeText={setForgotEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={forgotStep === 'request'}
              />

              {forgotStep === 'reset' ? (
                <>
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
                </>
              ) : null}
            </View>

            {notice != null ? (
              <Text style={styles.notice} accessibilityLiveRegion="polite">
                {notice}
              </Text>
            ) : null}
            {serverError != null ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {serverError}
              </Text>
            ) : null}

            <Button
              label={forgotStep === 'request' ? t('auth.sendCode') : t('auth.resetPassword')}
              onPress={() => void (forgotStep === 'request' ? submitForgotRequest() : submitReset())}
              loading={submitting}
              style={styles.cta}
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    marginBottom: spacing.xl,
  },
  fields: { gap: spacing.md },
  forgotLink: { alignSelf: 'flex-end' },
  linkText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  notice: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.sage,
    marginTop: spacing.md,
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.md,
  },
  cta: { marginTop: spacing.lg },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  switchText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
});
