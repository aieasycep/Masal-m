import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, NetworkError } from '@masalim/api-client';
import { personNameSchema } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, shadows, spacing } from '@masalim/ui';
import { Button } from '../../src/components/Button';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

const SAVED_FLASH_MS = 2_000;

/**
 * Account settings — `Settings/02-Account` (avatar + name/e-mail + fixed save
 * CTA) and `Settings/06-DeleteAccount` (danger zone with the deletion list).
 * `?delete=1` opens the danger zone directly (hub's "Hesabımı Sil" row).
 */
export default function AccountSettings() {
  const { t, i18n } = useTranslation();
  const params = useLocalSearchParams<{ delete?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const me = meQuery.data;

  const [name, setName] = useState('');
  const nameInitialised = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(
    typeof params.delete === 'string' && params.delete.length > 0,
  );
  const [password, setPassword] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!nameInitialised.current && me != null) {
      nameInitialised.current = true;
      setName(me.name);
    }
  }, [me]);

  useEffect(
    () => () => {
      if (savedTimer.current != null) clearTimeout(savedTimer.current);
    },
    [],
  );

  const apiErrorMessage = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (error instanceof NetworkError) {
      return t('errors.OFFLINE');
    }
    return t('errors.GENERIC');
  };

  const saveName = async () => {
    setSaveError(null);
    const parsed = personNameSchema.safeParse(name);
    if (!parsed.success) {
      setSaveError(t('errors.VALIDATION_FAILED'));
      return;
    }
    setSaving(true);
    try {
      const updated = await api.users.updateMe({ name: parsed.data });
      setUser(updated);
      queryClient.setQueryData(['me'], updated);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      // "✓ Kaydedildi" sage flash (design), then back to the hub.
      setSaving(false);
      setSaved(true);
      savedTimer.current = setTimeout(() => router.back(), SAVED_FLASH_MS);
    } catch (error) {
      setSaveError(apiErrorMessage(error));
      setSaving(false);
    }
  };

  const cancelDeletion = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      const updated = await api.users.cancelDeletion();
      queryClient.setQueryData(['me'], updated);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
    }
    setDeleting(false);
  };

  const requestDeletion = async () => {
    setConfirmVisible(false);
    setDeleteError(null);
    setDeleting(true);
    try {
      const trimmed = password.trim();
      await api.users.requestDeletion({
        confirm: true,
        ...(trimmed.length > 0 ? { password: trimmed } : {}),
      });
      // The server revokes the session with the deletion request.
      await clearSession();
      router.replace('/(onboarding)/splash' as never);
    } catch (error) {
      setDeleteError(apiErrorMessage(error));
      setDeleting(false);
    }
  };

  const pendingDeletion = me?.pendingDeletion ?? null;
  const deletionDate =
    pendingDeletion == null
      ? null
      : new Date(pendingDeletion.effectiveAt).toLocaleDateString(
          i18n.language === 'en' ? 'en-US' : 'tr-TR',
          { day: 'numeric', month: 'long', year: 'numeric' },
        );

  const initial = me == null ? '' : me.name.trim().charAt(0).toLocaleUpperCase('tr');
  const deleteBullets = [
    t('settings.deleteBullets.stories'),
    t('settings.deleteBullets.children'),
    t('settings.deleteBullets.voices'),
    t('settings.deleteBullets.books'),
  ];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        <Screen style={styles.scrollContent}>
          <ScreenHeader title={t('settings.accountInfo')} />

          {/* Avatar — 80px gradient circle with the name initial. */}
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={[colors.lavenderLight, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.avatar, shadows.selectedCard]}
            >
              {initial.length > 0 ? (
                <Text style={styles.avatarInitial}>{initial}</Text>
              ) : (
                <Text style={styles.avatarEmoji}>👩</Text>
              )}
            </LinearGradient>
          </View>

          <View style={styles.fields}>
            <Input
              label={t('auth.name')}
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (saveError != null) setSaveError(null);
                if (saved) setSaved(false);
              }}
              autoCapitalize="words"
              error={saveError ?? undefined}
            />
            {/* E-mail can't be changed — readonly muted field (design + backend). */}
            <Input
              label={t('auth.email')}
              value={me?.email ?? ''}
              editable={false}
              style={styles.readonlyInput}
            />
          </View>

          {/* Danger zone — Settings/06. */}
          <View style={styles.dangerZone}>
            {pendingDeletion != null ? (
              <View style={styles.dangerCard}>
                <Text style={styles.dangerBanner}>
                  {t('settings.deletionPending', { date: deletionDate })}
                </Text>
                <Button
                  label={t('settings.deletionCancel')}
                  onPress={() => void cancelDeletion()}
                  variant="secondary"
                  loading={deleting}
                  compact
                />
              </View>
            ) : deleteOpen ? (
              <View style={styles.dangerCard}>
                <Text style={styles.dangerTitle}>{t('settings.deleteWarningTitle')}</Text>
                <Text style={styles.dangerIntro}>{t('settings.deleteWarningIntro')}</Text>
                <View style={styles.bulletList}>
                  {deleteBullets.map((bullet) => (
                    <View key={bullet} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.dangerBody}>{t('settings.deleteAccountBody')}</Text>
                {/* Email-auth accounts confirm with their password; social accounts leave it empty. */}
                <Input
                  label={t('auth.password')}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Button
                  label={t('settings.deleteAccountConfirm')}
                  onPress={() => setConfirmVisible(true)}
                  variant="destructive"
                  loading={deleting}
                  compact
                />
                <Button
                  label={t('common.cancel')}
                  onPress={() => {
                    setDeleteOpen(false);
                    setPassword('');
                    setDeleteError(null);
                  }}
                  variant="tertiary"
                  compact
                />
              </View>
            ) : (
              <Button
                label={t('settings.deleteAccount')}
                onPress={() => setDeleteOpen(true)}
                variant="destructive"
              />
            )}
            {deleteError != null ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {deleteError}
              </Text>
            ) : null}
          </View>
        </Screen>

        {/* Fixed bottom save CTA with the sage "✓ Kaydedildi" flash. */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.xl) }]}>
          {saved ? (
            <View style={styles.savedBox} accessibilityLiveRegion="polite">
              <Text style={styles.savedText}>{`✓ ${t('settings.saved')}`}</Text>
            </View>
          ) : (
            <Button
              label={t('settings.saveChanges')}
              onPress={() => void saveName()}
              loading={saving}
              disabled={me == null}
            />
          )}
        </View>
      </View>

      {/* Second confirm — "Son kez onaylıyorsun." */}
      <ConfirmSheet
        visible={confirmVisible}
        title={t('settings.deleteAccountTitle')}
        body={t('settings.deleteFinalConfirmBody')}
        confirmLabel={t('settings.deleteFinalConfirm')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void requestDeletion()}
        onCancel={() => setConfirmVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  avatarWrap: { alignItems: 'center', marginBottom: spacing.xl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontFamily: fontFamilies.displayBold,
    fontSize: fontSizes.displayXl,
    color: colors.primaryForeground,
  },
  avatarEmoji: { fontSize: 36 },
  fields: { gap: spacing.lg },
  readonlyInput: {
    backgroundColor: colors.muted,
    color: colors.mutedForeground,
  },
  dangerZone: { marginTop: spacing.xxl, gap: spacing.sm },
  dangerCard: {
    // Destructive-tinted warning card (design: rgba of colors.destructive #E05454).
    backgroundColor: 'rgba(224, 84, 84, 0.06)',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: 'rgba(224, 84, 84, 0.2)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  dangerTitle: {
    fontFamily: fontFamilies.display,
    fontSize: fontSizes.h4,
    color: colors.destructive,
  },
  dangerIntro: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.foreground,
    lineHeight: 21,
  },
  bulletList: { gap: spacing.xs },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.destructive,
  },
  bulletText: {
    flex: 1,
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  dangerBanner: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.base,
    color: colors.destructive,
    lineHeight: 21,
  },
  dangerBody: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.pageX,
    backgroundColor: colors.background,
  },
  savedBox: {
    // Sage-tinted success flash (rgba of colors.sage #8DB89A).
    backgroundColor: 'rgba(141, 184, 154, 0.15)',
    borderRadius: radius.lg,
    paddingVertical: 18,
    alignItems: 'center',
  },
  savedText: {
    fontFamily: fontFamilies.bodyExtraBold,
    fontSize: fontSizes.xxl,
    color: colors.sage,
  },
});
