import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, NetworkError } from '@masalim/api-client';
import { personNameSchema } from '@masalim/validation';
import { colors, fontFamilies, fontSizes, radius, spacing } from '@masalim/ui';
import { Button } from '../../src/components/Button';
import { ConfirmSheet } from '../../src/components/ConfirmSheet';
import { Input } from '../../src/components/Input';
import { Screen } from '../../src/components/Screen';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { api } from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/auth';

/** Account settings — profile name + deletion request/cancel (7-day grace, §14). */
export default function AccountSettings() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => api.users.me() });
  const me = meQuery.data;

  const [name, setName] = useState('');
  const nameInitialised = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
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
      router.back();
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader title={t('settings.account')} />

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            {t('settings.editProfile').toLocaleUpperCase('tr')}
          </Text>
          <Input
            label={t('auth.name')}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (saveError != null) setSaveError(null);
            }}
            autoCapitalize="words"
            error={saveError ?? undefined}
          />
          <Button
            label={t('common.save')}
            onPress={() => void saveName()}
            loading={saving}
            disabled={me == null}
            compact
            style={styles.saveButton}
          />
        </View>

        {/* Danger zone */}
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

        <ConfirmSheet
          visible={confirmVisible}
          title={t('settings.deleteAccountTitle')}
          body={t('settings.deleteAccountBody')}
          confirmLabel={t('settings.deleteAccountConfirm')}
          cancelLabel={t('common.cancel')}
          destructive
          onConfirm={() => void requestDeletion()}
          onCancel={() => setConfirmVisible(false)}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: spacing.md,
  },
  sectionLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.mutedForeground,
    letterSpacing: 0.8,
  },
  saveButton: { marginTop: spacing.xxs },
  dangerZone: { marginTop: spacing.xxl, gap: spacing.sm },
  dangerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.destructive,
    padding: 18,
    gap: spacing.md,
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
});
