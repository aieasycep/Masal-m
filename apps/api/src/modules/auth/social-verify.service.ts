import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import appleSignin from 'apple-signin-auth';
import { OAuth2Client } from 'google-auth-library';
import { ErrorCode } from '@masalim/types';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/errors/app.exception';

export interface VerifiedSocialIdentity {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
}

/** Server-side verification of Apple identity tokens and Google id tokens (§11). */
@Injectable()
export class SocialVerifyService {
  private readonly googleClient: OAuth2Client;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.googleClient = new OAuth2Client(this.env.GOOGLE_CLIENT_ID || undefined);
  }

  async verifyApple(identityToken: string, nonce?: string): Promise<VerifiedSocialIdentity> {
    try {
      const payload = await appleSignin.verifyIdToken(identityToken, {
        audience: this.env.APPLE_BUNDLE_ID,
        nonce,
        ignoreExpiration: false,
      });
      return {
        providerUserId: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
      };
    } catch {
      throw new AppException(
        ErrorCode.AUTH_PROVIDER_TOKEN_INVALID,
        'Apple identity token could not be verified',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  async verifyGoogle(idToken: string): Promise<VerifiedSocialIdentity> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.env.GOOGLE_CLIENT_ID || undefined,
      });
      const payload = ticket.getPayload();
      if (payload?.sub == null) throw new Error('missing sub');
      return {
        providerUserId: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
      };
    } catch {
      throw new AppException(
        ErrorCode.AUTH_PROVIDER_TOKEN_INVALID,
        'Google id token could not be verified',
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
