import type { TFunction } from 'i18next';
import { ApiError, NetworkError, TransientError } from '@masalim/api-client';
import { ErrorCode } from '@masalim/types';
import { errorMessage } from '../error-message';

/** Minimal i18n stub: known keys echo back, unknown keys fall back to `defaultValue`. */
const KNOWN = new Set(['errors.GENERIC', 'errors.OFFLINE', 'errors.RATE_LIMITED']);
const t = ((key: string, options?: { defaultValue?: string }) =>
  KNOWN.has(key) ? key : (options?.defaultValue ?? key)) as unknown as TFunction;

describe('errorMessage', () => {
  it('maps an ApiError through errors.<code>', () => {
    expect(errorMessage(new ApiError(ErrorCode.RATE_LIMITED, 'slow down', 429), t)).toBe(
      'errors.RATE_LIMITED',
    );
  });

  it('falls back to GENERIC for an ApiError code without copy', () => {
    expect(errorMessage(new ApiError(ErrorCode.INTERNAL, 'boom', 500), t)).toBe('errors.GENERIC');
  });

  it('maps NetworkError and TransientError to OFFLINE', () => {
    expect(errorMessage(new NetworkError(), t)).toBe('errors.OFFLINE');
    expect(errorMessage(new TransientError(429, ErrorCode.RATE_LIMITED), t)).toBe('errors.OFFLINE');
  });

  it('maps anything else to GENERIC', () => {
    expect(errorMessage(new Error('x'), t)).toBe('errors.GENERIC');
    expect(errorMessage(undefined, t)).toBe('errors.GENERIC');
  });
});
