import { createHash, randomInt } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthProvider, ErrorCode, CreditReason, SIGNUP_GIFT_CREDITS } from '@masalim/types';
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
import { EntitlementService } from '../subscription/entitlement.service';
import { LockoutService, RESET_CODE_TTL_SECONDS } from './lockout.service';
import { SocialVerifyService } from './social-verify.service';
import { TokenService } from './token.service';

const RESET_CODE_TTL_MS = RESET_CODE_TTL_SECONDS * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly social: SocialVerifyService,
    private readonly lockout: LockoutService,
    private readonly mail: MailService,
    private readonly entitlements: EntitlementService,
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
    await this.grantSignupGift(user.id);
    return this.buildSession(user);
  }

  async login(input: LoginInput, ip: string): Promise<AuthSession> {
    await this.lockout.assertNotLockedOut(input.email, ip);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const valid =
      user?.passwordHash != null &&
      (await this.canSignIn(user)) &&
      (await argon2.verify(user.passwordHash, input.password));
    if (!valid || user == null) {
      await this.lockout.recordFailure(input.email, ip);
      throw new AppException(
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.lockout.reset(input.email, ip);
    await this.cancelPendingDeletionOnLogin(user.id);
    return this.buildSession(user);
  }

  async loginWithApple(input: AppleAuthInput): Promise<AuthSession> {
    const identity = await this.social.verifyApple(input.identityToken, input.nonce);
    const user = await this.findOrCreateSocialUser(
      AuthProvider.APPLE,
      identity.providerUserId,
      identity.email,
      identity.emailVerified,
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
      identity.emailVerified,
    );
    await this.cancelPendingDeletionOnLogin(user.id);
    return this.buildSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.tokens.revokeForUser(userId, refreshToken);
    } else {
      await this.tokens.revokeAllForUser(userId);
    }
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Do not reveal whether the account exists.
    if (user == null || user.deletedAt != null) return;

    // Only the newest code is live: otherwise every "forgot" would add one
    // more valid 6-digit code and widen the guess space.
    await this.retireResetCodes(user.id);
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

  async resetPassword(input: ResetPasswordInput, ip?: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (user == null || user.deletedAt != null) {
      throw invalidResetCode();
    }
    // An exhausted guess budget burns even a freshly issued code: the window
    // has to pass before reset works again for this account.
    if (await this.lockout.resetAttemptsExhausted(user.id)) {
      await this.retireResetCodes(user.id);
      throw invalidResetCode();
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
      if (await this.lockout.recordResetFailure(user.id)) {
        await this.retireResetCodes(user.id);
      }
      throw invalidResetCode();
    }
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(input.newPassword) },
      }),
    ]);
    await this.lockout.clearResetAttempts(user.id);
    // Proving control of the mailbox also lifts any login lockout.
    await this.lockout.reset(user.email, ip);
    // New password invalidates every existing session.
    await this.tokens.revokeAllForUser(user.id);
  }

  private async findOrCreateSocialUser(
    provider: AuthProvider,
    providerUserId: string,
    email: string | null,
    emailVerified: boolean,
    fullName?: string,
  ): Promise<User> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true },
    });
    if (identity != null) {
      // A pending deletion is reactivated by the caller's cancel helper; an
      // account past its grace period must not resurface via the email path.
      if (!(await this.canSignIn(identity.user))) throw accountUnavailable();
      return identity.user;
    }

    // An unverified provider email is only a claim: it must neither link to
    // nor occupy a real address (both enable pre-account hijacks).
    const trustedEmail = emailVerified ? email : null;
    if (trustedEmail != null) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: trustedEmail } });
      if (byEmail != null) {
        if (byEmail.passwordHash != null) {
          throw new AppException(
            ErrorCode.AUTH_EMAIL_IN_USE,
            'This email is registered with a password — sign in with your password',
            HttpStatus.CONFLICT,
          );
        }
        if (!(await this.canSignIn(byEmail))) throw accountUnavailable();
        await this.prisma.authIdentity.create({
          data: { userId: byEmail.id, provider, providerUserId },
        });
        return byEmail;
      }
    }

    const placeholderEmail = `${provider.toLowerCase()}-${providerUserId}@users.masalim.app`;
    const created = await this.prisma.user.create({
      data: {
        email: trustedEmail ?? placeholderEmail,
        name: fullName ?? 'Masalım Kullanıcısı',
        identities: { create: { provider, providerUserId } },
      },
    });
    await this.grantSignupGift(created.id);
    return created;
  }

  /** Tanışma hediyesi: every new account starts with a small credit gift. */
  private async grantSignupGift(userId: string): Promise<void> {
    await this.entitlements
      .grantCredits(
        userId,
        SIGNUP_GIFT_CREDITS,
        CreditReason.SIGNUP_GIFT,
        { type: 'user', id: userId },
        `gift:${userId}`,
      )
      .catch(() => undefined); // a failed gift must never block registration
  }

  /**
   * Soft-deleted accounts may still sign in while their ACCOUNT deletion is
   * pending (grace period, §84); afterwards they stay rejected.
   */
  private async canSignIn(user: Pick<User, 'id' | 'deletedAt'>): Promise<boolean> {
    if (user.deletedAt == null) return true;
    const pending = await this.prisma.deletionRequest.findFirst({
      where: { userId: user.id, scope: 'ACCOUNT', status: 'PENDING' },
      select: { id: true },
    });
    return pending != null;
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

  private async retireResetCodes(userId: string): Promise<void> {
    await this.prisma.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
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

function invalidResetCode(): AppException {
  return new AppException(
    ErrorCode.AUTH_RESET_CODE_INVALID,
    'Invalid or expired code',
    HttpStatus.BAD_REQUEST,
  );
}

/** Deleted past the grace period — same wording as a bad password, reveals nothing. */
function accountUnavailable(): AppException {
  return new AppException(
    ErrorCode.AUTH_INVALID_CREDENTIALS,
    'Invalid email or password',
    HttpStatus.UNAUTHORIZED,
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
