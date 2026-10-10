import { ErrorCode } from '@masalim/types';
import appleSignin from 'apple-signin-auth';
import type { Env } from '../../config/env';
import { SocialVerifyService } from './social-verify.service';

jest.mock('apple-signin-auth', () => ({
  __esModule: true,
  default: { verifyIdToken: jest.fn() },
}));

const verifyIdToken = appleSignin.verifyIdToken as unknown as jest.Mock;

function buildService() {
  const env = { APPLE_BUNDLE_ID: 'com.masalim.app', GOOGLE_CLIENT_ID: '' } as Env;
  return new SocialVerifyService(env);
}

describe('SocialVerifyService.verifyApple', () => {
  beforeEach(() => verifyIdToken.mockReset());

  it('hands the hashed nonce to the verifier verbatim and maps the payload', async () => {
    verifyIdToken.mockResolvedValue({
      sub: 'apple-1',
      email: 'a@test.local',
      email_verified: 'true',
    });
    const hashed = 'f'.repeat(64);

    const identity = await buildService().verifyApple('token-token-token', hashed);

    expect(verifyIdToken).toHaveBeenCalledWith('token-token-token', {
      audience: 'com.masalim.app',
      nonce: hashed,
      ignoreExpiration: false,
    });
    expect(identity).toEqual({
      providerUserId: 'apple-1',
      email: 'a@test.local',
      emailVerified: true,
    });
  });

  it('treats a boolean email_verified claim as verified too', async () => {
    verifyIdToken.mockResolvedValue({
      sub: 'apple-2',
      email: 'b@test.local',
      email_verified: true,
    });

    const identity = await buildService().verifyApple('token-token-token', 'a'.repeat(64));

    expect(identity.emailVerified).toBe(true);
  });

  it('maps any verifier failure (bad signature, nonce mismatch) to 401', async () => {
    verifyIdToken.mockRejectedValue(new Error('nonce mismatch'));

    await expect(
      buildService().verifyApple('token-token-token', 'a'.repeat(64)),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_PROVIDER_TOKEN_INVALID, status: 401 });
  });
});
