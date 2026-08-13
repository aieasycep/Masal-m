import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { loginSchema, registerSchema } from '@masalim/validation';
import { ApiError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

const formSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  name: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

/** Email auth (login/register). Apple & Google buttons join in the design pass. */
export default function Welcome() {
  const { t } = useTranslation();
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setSubmitting(true);
    try {
      if (mode === 'signUp') {
        const input = registerSchema.parse({
          email: values.email,
          password: values.password,
          name: values.name || 'Masalım Kullanıcısı',
        });
        const session = await api.auth.register(input);
        await setSession(session);
      } else {
        const input = loginSchema.parse({ email: values.email, password: values.password });
        const session = await api.auth.login(input);
        await setSession(session);
      }
      router.replace('/(tabs)/home');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') }));
      } else if (err instanceof z.ZodError) {
        setServerError(t('errors.VALIDATION_FAILED'));
      } else {
        setServerError(t('errors.OFFLINE'));
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('auth.welcomeTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.welcomeSubtitle')}</Text>

        {mode === 'signUp' ? (
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextInput
                style={styles.input}
                placeholder={t('auth.namePlaceholder')}
                placeholderTextColor={colors.mutedForeground}
                value={field.value}
                onChangeText={field.onChange}
                autoCapitalize="words"
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              value={field.value}
              onChangeText={field.onChange}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor={colors.mutedForeground}
              value={field.value}
              onChangeText={field.onChange}
              secureTextEntry
            />
          )}
        />

        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
        {formState.errors.email || formState.errors.password ? (
          <Text style={styles.error}>{t('errors.VALIDATION_FAILED')}</Text>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={onSubmit}
          disabled={submitting}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={styles.ctaText}>
              {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
            </Text>
          )}
        </Pressable>

        <View style={styles.switchRow}>
          <Text style={styles.switchText}>
            {mode === 'signIn' ? t('auth.noAccount') : t('auth.haveAccount')}
          </Text>
          <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
            <Text style={styles.switchLink}>
              {mode === 'signIn' ? t('auth.signUp') : t('auth.signIn')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.pageXWide,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.display,
    color: colors.foreground,
    marginBottom: spacing.xxs,
  },
  subtitle: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    marginBottom: spacing.lg,
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
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: spacing.xs,
    ...shadows.primaryCta,
  },
  ctaPressed: { opacity: 0.9 },
  ctaText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.primaryForeground,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  switchText: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
  },
  switchLink: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
});
