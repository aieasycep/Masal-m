import { createHash, randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthProvider, ErrorCode } from '@masalim/types';
import type {
  AppleAuthInput,
  AuthSession,
  AuthTokens,
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from '@masalim/validation';
import type { User } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { MailService } from '../../providers/mail.service';
import { LockoutService } from './lockout.service';
import { SocialVerifyService } from './social-verify.service';
import { TokenService } from './token.service';

const RESET_CODE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly social: SocialVerifyService,
    private readonly lockout: LockoutService,
    private readonly mail: MailService,
  ) {}

  async register(input: RegisterInput): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing != null) {
      throw new AppException(
        ErrorCode.AUTH_EMAIL_IN_USE,
        'An account with this email already exists',
        HttpStatus.CONFLICT,
      );
    }
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        locale: input.locale,
        passwordHash: await argon2.hash(input.password),
        identities: {
          create: { provider: AuthProvider.EMAIL, providerUserId: input.email },
        },
      },
    });
    return this.buildSession(user);
  }

  async login(input: LoginInput): Promise<AuthSession> {
    await this.lockout.assertNotLockedOut(input.email);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid =
      user?.passwordHash != null &&
      user.deletedAt == null &&
      (await argon2.verify(user.passwordHash, input.password));
    if (!valid || user == null) {
      await this.lockout.recordFailure(input.email);
      throw new AppException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.lockout.reset(input.email);
    await this.cancelPendingDeletionOnLogin(user.id);
    return this.buildSession(user);
  }

  async loginWithApple(input: AppleAuthInput): Promise<AuthSession> {
    const identity = await this.social.verifyApple(input.identityToken, input.nonce);
    const user = await this.findOrCreateSocialUser(
      AuthProvider.APPLE,
      identity.providerUserId,
      identity.email,
      // Apple only sends the name on first authorization — persist it then.
      input.fullName,
    );
    await this.cancelPendingDeletionOnLogin(user.id);
    return this.buildSession(user);
  }

  async loginWithGoogle(input: GoogleAuthInput): Promise<AuthSession> {
    const identity = await this.social.verifyGoogle(input.idToken);
    const user = await this.findOrCreateSocialUser(
      AuthProvider.GOOGLE,
      identity.providerUserId,
      identity.email,
    );
    await this.cancelPendingDeletionOnLogin(user.id);
    return this.buildSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.tokens.revoke(refreshToken);
    } else {
      await this.tokens.revokeAllForUser(userId);
    }
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Do not reveal whether the account exists.
    if (user == null || user.deletedAt != null) return;

    const code = String(randomInt(100000, 1000000));
    await this.prisma.passwordReset.create({
      data: {
        userId: user.id,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      },
    });
    await this.mail.send({
      to: user.email,
      subject: 'Masalım şifre sıfırlama kodun',
      text: `Şifre sıfırlama kodun: ${code}\nKod 15 dakika geçerlidir.`,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user == null || user.deletedAt != null) {
      throw new AppException(
        ErrorCode.AUTH_RESET_CODE_INVALID,
        'Invalid or expired code',
        HttpStatus.BAD_REQUEST,
      );
    }
    const reset = await this.prisma.passwordReset.findFirst({
      where: {
        userId: user.id,
        codeHash: sha256(input.code),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (reset == null) {
      throw new AppException(
        ErrorCode.AUTH_RESET_CODE_INVALID,
        'Invalid or expired code',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(input.newPassword) },
      }),
    ]);
    // New password invalidates every existing session.
    await this.tokens.revokeAllForUser(user.id);
  }

  private async findOrCreateSocialUser(
    provider: AuthProvider,
    providerUserId: string,
    email: string | null,
    fullName?: string,
  ): Promise<User> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true },
    });
    if (identity != null && identity.user.deletedAt == null) {
      return identity.user;
    }

    // Link to an existing account with the same verified email, else create.
    if (email != null) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail != null && byEmail.deletedAt == null) {
        await this.prisma.authIdentity.create({
          data: { userId: byEmail.id, provider, providerUserId },
        });
        return byEmail;
      }
    }

    const placeholderEmail = email ?? `${provider.toLowerCase()}-${providerUserId}@users.masalim.app`;
    return this.prisma.user.create({
      data: {
        email: placeholderEmail,
        name: fullName ?? 'Masalım Kullanıcısı',
        identities: { create: { provider, providerUserId } },
      },
    });
  }

  /** Signing in during the grace period cancels a pending account deletion (§84). */
  private async cancelPendingDeletionOnLogin(userId: string): Promise<void> {
    await this.prisma.deletionRequest.updateMany({
      where: { userId, scope: 'ACCOUNT', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.user.updateMany({
      where: { id: userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  }

  private async buildSession(user: User): Promise<AuthSession> {
    const tokens = await this.tokens.issueTokens({ id: user.id, email: user.email });
    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        locale: user.locale === 'en' ? 'en' : 'tr',
        onboardingCompleted: user.onboardingCompleted,
        avatarUrl: null,
      },
    };
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
