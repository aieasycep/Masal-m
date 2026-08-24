import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createAddressSchema, type Address, type CreateAddressInput } from '@masalim/validation';
import { ApiError, NetworkError } from '@masalim/api-client';
import { colors, fontFamilies, fontSizes, letterSpacing, radius, spacing } from '@masalim/ui';
import { api } from '../../../src/lib/api';
import { useCheckoutStore } from '../../../src/stores/checkout';
import { Button } from '../../../src/components/Button';
import { Input } from '../../../src/components/Input';
import { Screen } from '../../../src/components/Screen';
import { ScreenHeader } from '../../../src/components/ScreenHeader';
import { SelectableCard } from '../../../src/components/SelectableCard';
import { CheckIcon } from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';

type FieldName = keyof Omit<CreateAddressInput, 'isDefault'>;

const FIELD_ORDER: FieldName[] = [
  'fullName',
  'phone',
  'addressLine',
  'city',
  'district',
  'postalCode',
];

/** Checkout flow: configure → address (this) → review. */
const TOTAL_STEPS = 3;
const STEP_INDEX = 1;

/** Thin 3-segment checkout progress bar under the header (design: PrintOrder). */
function StepBar() {
  return (
    <View style={styles.progressRow}>
      {Array.from({ length: TOTAL_STEPS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.progressSegment,
            index <= STEP_INDEX ? styles.progressFilled : styles.progressEmpty,
          ]}
        />
      ))}
    </View>
  );
}

/** Checkout step 2 — pick a saved shipping address or create a new one (§34). */
export default function CheckoutAddress() {
  const { t } = useTranslation();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const queryClient = useQueryClient();

  const begin = useCheckoutStore((state) => state.begin);
  const addressId = useCheckoutStore((state) => state.addressId);
  const setAddressId = useCheckoutStore((state) => state.setAddressId);

  useEffect(() => {
    if (bookId != null && bookId.length > 0) begin(bookId);
  }, [bookId, begin]);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<FieldName, string>>({
    fullName: '',
    phone: '',
    addressLine: '',
    city: '',
    district: '',
    postalCode: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  // "Adresi kaydet" — the address is ALWAYS persisted (orders need an address id);
  // the checkbox marks it as the default for the next checkout.
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [serverError, setServerError] = useState<string | null>(null);

  const mapError = (error: unknown): string => {
    if (error instanceof ApiError) {
      return t(`errors.${error.code}`, { defaultValue: t('errors.GENERIC') });
    }
    if (error instanceof NetworkError) return t('errors.OFFLINE');
    return t('errors.GENERIC');
  };

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: () => api.addresses.list(),
  });
  const addresses = addressesQuery.data;

  // Preselect: the draft's address if still present, else the default, else the first.
  useEffect(() => {
    if (addresses == null || addresses.length === 0) return;
    if (addressId != null && addresses.some((address) => address.id === addressId)) return;
    const preferred = addresses.find((address) => address.isDefault) ?? addresses[0];
    if (preferred != null) setAddressId(preferred.id);
  }, [addresses, addressId, setAddressId]);

  const createMutation = useMutation({
    mutationFn: (input: CreateAddressInput) => api.addresses.create(input),
    onSuccess: async (created: Address) => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setAddressId(created.id);
      router.push(`/checkout/${bookId}/review` as never);
    },
    onError: (error) => setServerError(mapError(error)),
  });

  const setField = (field: FieldName, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field] != null) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const onContinue = () => {
    setServerError(null);
    if (formOpen) {
      const parsed = createAddressSchema.safeParse({ ...form, isDefault: saveAsDefault });
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const nextErrors: Partial<Record<FieldName, string>> = {};
        for (const field of FIELD_ORDER) {
          if (flat[field] != null && flat[field].length > 0) {
            nextErrors[field] = t('errors.VALIDATION_FAILED');
          }
        }
        setFieldErrors(nextErrors);
        return;
      }
      createMutation.mutate(parsed.data);
      return;
    }
    if (addressId == null) return;
    router.push(`/checkout/${bookId}/review` as never);
  };

  const canContinue = formOpen || addressId != null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader eyebrow={t('checkout.eyebrow')} title={t('checkout.addressTitle')} />
        <StepBar />

        {addressesQuery.isError ? (
          <ErrorState
            emoji="🌧️"
            title={mapError(addressesQuery.error)}
            ctaLabel={t('common.retry')}
            onCta={() => void addressesQuery.refetch()}
          />
        ) : addresses == null ? (
          <ActivityIndicator
            color={colors.primary}
            style={styles.loader}
            accessibilityLabel={t('common.loading')}
          />
        ) : (
          <>
            {/* Saved addresses. */}
            {addresses.length > 0 ? (
              <View style={styles.addressList} accessibilityRole="radiogroup">
                {addresses.map((address) => (
                  <SelectableCard
                    key={address.id}
                    selected={!formOpen && addressId === address.id}
                    glow
                    onPress={() => {
                      setFormOpen(false);
                      setAddressId(address.id);
                    }}
                    accessibilityLabel={address.fullName}
                  >
                    <View style={styles.addressBody}>
                      <Text style={styles.addressName}>{address.fullName}</Text>
                      <Text style={styles.addressLine} numberOfLines={2}>
                        {address.addressLine}
                      </Text>
                      <Text style={styles.addressMeta}>
                        {`${address.district} / ${address.city} · ${address.postalCode}`}
                      </Text>
                    </View>
                  </SelectableCard>
                ))}
              </View>
            ) : null}

            {/* New address. */}
            <Pressable
              onPress={() => setFormOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: formOpen }}
              style={[styles.newAddressCard, formOpen && styles.newAddressCardOpen]}
            >
              <Text style={styles.newAddressText}>{`+ ${t('checkout.newAddress')}`}</Text>
            </Pressable>

            {formOpen ? (
              <View style={styles.form}>
                <Input
                  label={t('checkout.fullName')}
                  value={form.fullName}
                  onChangeText={(text) => setField('fullName', text)}
                  autoCapitalize="words"
                  error={fieldErrors.fullName}
                />
                <Input
                  label={t('checkout.phone')}
                  placeholder="05XX XXX XX XX"
                  value={form.phone}
                  onChangeText={(text) => setField('phone', text)}
                  keyboardType="phone-pad"
                  error={fieldErrors.phone}
                />
                <Input
                  label={t('checkout.addressLine')}
                  value={form.addressLine}
                  onChangeText={(text) => setField('addressLine', text)}
                  multiline
                  numberOfLines={3}
                  style={styles.addressLineInput}
                  error={fieldErrors.addressLine}
                />
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    <Input
                      label={t('checkout.city')}
                      value={form.city}
                      onChangeText={(text) => setField('city', text)}
                      autoCapitalize="words"
                      error={fieldErrors.city}
                    />
                  </View>
                  <View style={styles.fieldHalf}>
                    <Input
                      label={t('checkout.district')}
                      value={form.district}
                      onChangeText={(text) => setField('district', text)}
                      autoCapitalize="words"
                      error={fieldErrors.district}
                    />
                  </View>
                </View>
                <Input
                  label={t('checkout.postalCode')}
                  value={form.postalCode}
                  onChangeText={(text) => setField('postalCode', text)}
                  keyboardType="number-pad"
                  maxLength={5}
                  error={fieldErrors.postalCode}
                />

                <Pressable
                  onPress={() => setSaveAsDefault((value) => !value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: saveAsDefault }}
                  style={styles.checkboxRow}
                >
                  <View style={[styles.checkbox, saveAsDefault && styles.checkboxChecked]}>
                    {saveAsDefault ? <CheckIcon /> : null}
                  </View>
                  <Text style={styles.checkboxLabel}>{t('checkout.saveAddress')}</Text>
                </Pressable>
              </View>
            ) : null}

            {serverError != null ? (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {serverError}
              </Text>
            ) : null}

            <Button
              label={t('checkout.continue')}
              onPress={onContinue}
              loading={createMutation.isPending}
              disabled={!canContinue}
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
  loader: { marginTop: spacing.xxxl },
  progressRow: { flexDirection: 'row', gap: 4, marginTop: -8, marginBottom: spacing.lg },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  progressFilled: { backgroundColor: colors.primary },
  progressEmpty: { backgroundColor: colors.border },
  addressList: { gap: spacing.xs, marginBottom: spacing.sm },
  addressBody: { flex: 1, gap: 2 },
  addressName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.foreground,
  },
  addressLine: {
    fontFamily: fontFamilies.body,
    fontSize: fontSizes.base,
    color: colors.mutedForeground,
    lineHeight: 19,
  },
  addressMeta: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.mutedForeground,
    letterSpacing: letterSpacing.eyebrow,
  },
  newAddressCard: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  newAddressCardOpen: { borderColor: colors.primary, backgroundColor: colors.secondary },
  newAddressText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: fontSizes.lg,
    color: colors.primary,
  },
  form: { gap: spacing.md, marginTop: spacing.lg },
  addressLineInput: { minHeight: 84, textAlignVertical: 'top' },
  fieldRow: { flexDirection: 'row', gap: spacing.xs },
  fieldHalf: { flex: 1 },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.base,
    color: colors.foreground,
  },
  error: {
    fontFamily: fontFamilies.bodySemiBold,
    fontSize: fontSizes.md,
    color: colors.destructive,
    marginTop: spacing.lg,
  },
  cta: { marginTop: spacing.xl },
});
