import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@masalim/api-client';
import { EMAIL_VERIFICATION, ErrorCode, SIGNUP_GIFT_CREDITS } from '@masalim/types';
import { verifyEmailSchema } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { Button } from '../../src/components/Button';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/error-message';

/** Success flash dwell before returning to the previous screen. */
const SUCCESS_BACK_MS = 2_000;

/** `details.retryAfterSeconds` of a 429 while the resend cooldown is armed. */
function retryAfterSeconds(details: unknown): number | null {
  if (typeof details !== 'object' || details == null) return null;
  const value = (details as { retryAfterSeconds?: unknown }).retryAfterSeconds;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

/**
 * E-mail verification: explain → "Kod Gönder" → 6-digit code → "Doğrula".
 * Verifying releases the withheld signup gift (server decides, `giftGranted`).
 * Reachable from the Home banner and the settings hub while unverified.
 */
export default function VerifyEmail() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const me = meQuery.data;

  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{ giftGranted: boolean } | null>(null);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resend countdown — one tick per second while armed.
  const coolingDown = cooldown > 0;
  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1_000);
    return () => clearInterval(timer);
  }, [coolingDown]);

  useEffect(
    () => () => {
      if (backTimer.current != null) clearTimeout(backTimer.current);
    },
    [],
  );

  const sendCode = async () => {
    if (sending || coolingDown) return;
    setError(null);
    setNotice(null);
    setSending(true);
    try {
      const result = await api.auth.sendEmailVerification();
      if (!result.sent) {
        // Nothing to do: already verified (or verification is off server-side).
        setNotice(t('emailVerify.alreadyVerified'));
        await queryClient.invalidateQueries({ queryKey: ['me'] });
        return;
      }
      setSent(true);
      setCooldown(result.cooldownSeconds);
      setNotice(t('emailVerify.sentTo', { email: me?.email ?? '' }));
    } catch (err) {
      if (err instanceof ApiError && err.code === ErrorCode.RATE_LIMITED) {
        // A code is already live — let the user type it and show when a resend opens.
        setSent(true);
        setCooldown(retryAfterSeconds(err.details) ?? EMAIL_VERIFICATION.RESEND_COOLDOWN_SECONDS);
        return;
      }
      setError(errorMessage(err, t));
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (verifying) return;
    const parsed = verifyEmailSchema.safeParse({ code: code.trim() });
    if (!parsed.success) {
      setError(t('errors.VALIDATION_FAILED'));
      return;
    }
    setError(null);
    setNotice(null);
    setVerifying(true);
    try {
      const result = await api.auth.verifyEmail(parsed.data);
      setVerified({ giftGranted: result.giftGranted });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['me'] }),
        queryClient.invalidateQueries({ queryKey: ['entitlements'] }),
      ]);
      backTimer.current = setTimeout(() => router.back(), SUCCESS_BACK_MS);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setVerifying(false);
    }
  };

  const alreadyVerified = verified == null && me?.emailVerified === true;

  const renderBody = () => {
    if (verified != null) {
      return (
        <View style={styles.successBox} accessibilityLiveRegion="polite">
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successText}>
            {verified.giftGranted
              ? t('emailVerify.successGift', { n: SIGNUP_GIFT_CREDITS })
              : t('emailVerify.success')}
          </Text>
          <Button
            label={t('common.back')}
            onPress={() => router.back()}
            variant="secondary"
            compact
          />
        </View>
      );
    }

    if (alreadyVerified) {
      return (
        <View style={styles.successBox}>
          <Text style={styles.successEmoji}>✅</Text>
          <Text style={styles.successText}>{t('emailVerify.alreadyVerified')}</Text>
          <Button
            label={t('common.back')}
            onPress={() => router.back()}
            variant="secondary"
            compact
          />
        </View>
      );
    }

    return (
      <>
        <View style={styles.mailCircle}>
          <Text style={styles.mailEmoji}>✉️</Text>
        </View>
        <Text style={styles.body}>{t('emailVerify.body', { email: me?.email ?? '' })}</Text>

        {notice != null ? (
          <View style={styles.noticeBanner} accessibilityLiveRegion="polite">
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
        {error != null ? (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Text style={styles.errorText}>⚠ {error}</Text>
          </View>
        ) : null}

        {sent ? (
          <>
            <Input
              label={t('emailVerify.codeLabel')}
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/[^0-9]/g, '').slice(0, 6));
                if (error != null) setError(null);
              }}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
            <Button
              label={t('emailVerify.verify')}
              loadingLabel={t('emailVerify.verifying')}
              onPress={() => void verify()}
              loading={verifying}
              disabled={code.length !== 6}
              style={styles.cta}
            />
            {coolingDown ? (
              <Text style={styles.cooldown}>{t('emailVerify.cooldown', { s: cooldown })}</Text>
            ) : (
              <Pressable
                onPress={() => void sendCode()}
                disabled={sending}
                accessibilityRole="button"
                style={styles.centerLink}
              >
                <Text style={styles.linkText}>{t('emailVerify.resend')}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <Button
            label={t('emailVerify.sendCode')}
            onPress={() => void sendCode()}
            loading={sending}
            disabled={me == null}
            style={styles.cta}
          />
        )}
      </>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader title={t('emailVerify.title')} />
        {renderBody()}
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mailCircle: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  mailEmoji: { fontSize: 36 },
  body: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.lg,
    color: colors.mutedForeground,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  cta: { marginTop: spacing.lg },
  centerLink: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  linkText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.primary,
  },
  cooldown: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  noticeBanner: {
    // Sage-tinted notice (rgba of colors.sage #8DB89A).
    backgroundColor: 'rgba(141, 184, 154, 0.15)',
    borderRadius: radius.base,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.sageText,
    lineHeight: 21,
  },
  errorBanner: {
    // Destructive-tinted banner (rgba of colors.destructive #E05454).
    backgroundColor: 'rgba(224, 84, 84, 0.08)',
    borderRadius: radius.base,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.destructive,
    lineHeight: 21,
  },
  successBox: {
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(141, 184, 154, 0.15)',
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.lg,
  },
  successEmoji: { fontSize: 40 },
  successText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
    textAlign: 'center',
    lineHeight: 24,
  },
});
