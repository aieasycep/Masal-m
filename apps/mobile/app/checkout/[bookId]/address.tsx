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
import { StepBar } from '../../../src/components/StepBar';
import { CheckIcon } from '../../../src/components/icons';
import { ErrorState } from '../../../src/components/states';

/**
 * Decomposed form fields per `Checkout/02-Address`. The backend keeps a single
 * `addressLine` — mahalle + cadde/sokak + bina/daire are composed on submit.
 */
type FormField =
  | 'fullName'
  | 'phone'
  | 'city'
  | 'district'
  | 'neighborhood'
  | 'street'
  | 'buildingInfo'
  | 'postalCode';

interface FieldDef {
  key: FormField;
  labelKey: string;
  placeholderKey: string;
  required: boolean;
  keyboardType?: 'phone-pad' | 'number-pad';
  autoCapitalize?: 'words';
  maxLength?: number;
}

const FIELD_DEFS: FieldDef[] = [
  {
    key: 'fullName',
    labelKey: 'checkout.fullName',
    placeholderKey: 'checkout.placeholders.fullName',
    required: true,
    autoCapitalize: 'words',
  },
  {
    key: 'phone',
    labelKey: 'checkout.phone',
    placeholderKey: 'checkout.placeholders.phone',
    required: true,
    keyboardType: 'phone-pad',
  },
  {
    key: 'city',
    labelKey: 'checkout.city',
    placeholderKey: 'checkout.placeholders.city',
    required: true,
    autoCapitalize: 'words',
  },
  {
    key: 'district',
    labelKey: 'checkout.district',
    placeholderKey: 'checkout.placeholders.district',
    required: true,
    autoCapitalize: 'words',
  },
  {
    key: 'neighborhood',
    labelKey: 'checkout.neighborhood',
    placeholderKey: 'checkout.placeholders.neighborhood',
    required: true,
    autoCapitalize: 'words',
  },
  {
    key: 'street',
    labelKey: 'checkout.street',
    placeholderKey: 'checkout.placeholders.street',
    required: true,
    autoCapitalize: 'words',
  },
  {
    key: 'buildingInfo',
    labelKey: 'checkout.buildingInfo',
    placeholderKey: 'checkout.placeholders.buildingInfo',
    required: false,
    autoCapitalize: 'words',
  },
  // Design marks the postal code optional, but the backend contract requires a
  // valid 5-digit code — kept required so submission cannot dead-end.
  {
    key: 'postalCode',
    labelKey: 'checkout.postalCode',
    placeholderKey: 'checkout.placeholders.postalCode',
    required: true,
    keyboardType: 'number-pad',
    maxLength: 5,
  },
];

const EMPTY_FORM: Record<FormField, string> = {
  fullName: '',
  phone: '',
  city: '',
  district: '',
  neighborhood: '',
  street: '',
  buildingInfo: '',
  postalCode: '',
};

/** Join the decomposed street parts into the backend's single addressLine. */
function composeAddressLine(form: Record<FormField, string>): string {
  return [form.neighborhood, form.street, form.buildingInfo]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(', ');
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
  const [form, setForm] = useState<Record<FormField, string>>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FormField, string>>>({});
  // "Bu adresi daha sonra kullanmak için kaydet" — the address is ALWAYS
  // persisted (orders need an address id); the checkbox marks it as the
  // default for the next checkout.
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
      router.push(`/checkout/${bookId}/configure` as never);
    },
    onError: (error) => setServerError(mapError(error)),
  });

  const setField = (field: FormField, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field] != null) {
      setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const onContinue = () => {
    setServerError(null);
    if (formOpen) {
      const nextErrors: Partial<Record<FormField, string>> = {};
      for (const def of FIELD_DEFS) {
        if (def.required && form[def.key].trim().length === 0) {
          nextErrors[def.key] = t('checkout.fieldRequired');
        }
      }

      const parsed = createAddressSchema.safeParse({
        fullName: form.fullName,
        phone: form.phone,
        addressLine: composeAddressLine(form),
        city: form.city,
        district: form.district,
        postalCode: form.postalCode,
        isDefault: saveAsDefault,
      });
      if (!parsed.success) {
        const flat = parsed.error.flatten().fieldErrors;
        const direct: Extract<
          FormField,
          'fullName' | 'phone' | 'city' | 'district' | 'postalCode'
        >[] = ['fullName', 'phone', 'city', 'district', 'postalCode'];
        for (const field of direct) {
          if (flat[field] != null && flat[field].length > 0 && nextErrors[field] == null) {
            nextErrors[field] = t('errors.VALIDATION_FAILED');
          }
        }
        // The composed addressLine (min 10 chars) maps back to its source fields.
        if (flat.addressLine != null && flat.addressLine.length > 0) {
          if (nextErrors.neighborhood == null && nextErrors.street == null) {
            nextErrors.street = t('errors.VALIDATION_FAILED');
          }
        }
      }

      if (Object.keys(nextErrors).length > 0 || !parsed.success) {
        setFieldErrors(nextErrors);
        return;
      }
      createMutation.mutate(parsed.data);
      return;
    }
    if (addressId == null) return;
    router.push(`/checkout/${bookId}/configure` as never);
  };

  const canContinue = formOpen || addressId != null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <ScreenHeader eyebrow={t('checkout.eyebrow')} title={t('checkout.addressTitle')} />
        <View style={styles.stepBar}>
          <StepBar
            labels={[
              t('checkout.steps.book'),
              t('checkout.steps.address'),
              t('checkout.steps.summary'),
              t('checkout.steps.payment'),
            ]}
            activeIndex={1}
          />
        </View>

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
                {FIELD_DEFS.map((def) => (
                  <Input
                    key={def.key}
                    label={`${t(def.labelKey)}${def.required ? ' *' : ''}`}
                    placeholder={t(def.placeholderKey)}
                    value={form[def.key]}
                    onChangeText={(text) => setField(def.key, text)}
                    keyboardType={def.keyboardType}
                    autoCapitalize={def.autoCapitalize ?? 'none'}
                    maxLength={def.maxLength}
                    error={fieldErrors[def.key]}
                  />
                ))}

                <Pressable
                  onPress={() => setSaveAsDefault((value) => !value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: saveAsDefault }}
                  style={styles.checkboxRow}
                >
                  <View style={[styles.checkbox, saveAsDefault && styles.checkboxChecked]}>
                    {saveAsDefault ? <CheckIcon /> : null}
                  </View>
                  <Text style={styles.checkboxLabel}>{t('checkout.saveAddressLater')}</Text>
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
  stepBar: { marginTop: -8, marginBottom: spacing.lg },
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
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.base,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.xs,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: {
    flex: 1,
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
