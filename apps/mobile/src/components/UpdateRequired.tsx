import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@masalim/ui';
import { api } from '../lib/api';
import { EmptyState } from './states';

/**
 * Full-screen version gate (replaces the navigator while the API answers 426).
 * Store links come from the public `/app/config`; when neither platform has
 * one yet, the copy asks the user to install the new build manually.
 */
export function UpdateRequired() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const configQuery = useQuery({
    queryKey: ['app-config'],
    queryFn: () => api.app.config(),
    staleTime: 60 * 60 * 1000,
  });

  const storeUrl =
    Platform.select({
      ios: configQuery.data?.storeUrls.ios,
      android: configQuery.data?.storeUrls.android,
    }) ?? null;
  const noStore = configQuery.isSuccess && storeUrl == null;

  const openStore = () => {
    if (storeUrl == null) return;
    Linking.openURL(storeUrl).catch(() => undefined);
  };

  const cta =
    storeUrl != null
      ? { label: t('updateRequired.cta'), onPress: openStore }
      : configQuery.isError
        ? { label: t('common.retry'), onPress: () => void configQuery.refetch() }
        : null;

  return (
    <View
      style={[
        styles.root,
        { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 24) },
      ]}
    >
      <EmptyState
        emoji="⬆️"
        title={t('updateRequired.title')}
        body={noStore ? t('updateRequired.noStoreBody') : t('updateRequired.body')}
        ctaLabel={cta?.label}
        onCta={cta?.onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
