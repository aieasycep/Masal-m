import type { TFunction } from 'i18next';
import { ApiError, NetworkError } from '@masalim/api-client';

/**
 * Error → user copy (§error copy rule): the backend returns an ErrorCode, the
 * app maps it through `errors.*`; unknown codes and non-API failures fall back
 * to the generic line, network drops (incl. TransientError) to the offline one.
 */
export function errorMessage(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    return t(`errors.${err.code}`, { defaultValue: t('errors.GENERIC') });
  }
  if (err instanceof NetworkError) {
    return t('errors.OFFLINE');
  }
  return t('errors.GENERIC');
}
