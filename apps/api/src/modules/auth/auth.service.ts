import { createHash, randomBytes, randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import {
  AuthProvider,
  ErrorCode,
  CreditReason,
  EMAIL_VERIFICATION,
  SIGNUP_GIFT_CREDITS,
} from '@masalim/types';
import type {
  AppleAuthInput,
  AppleNonceResponse,
  AuthSession,
  AuthTokens,
  EmailVerificationSendResponse,
  ForgotPasswordInput,
  GoogleAuthInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  VerifyEmailResponse,
} from '@masalim/validation';
import type { User } from '@masalim/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { REDIS } from '../../redis/redis.module';
import { MailService } from '../../providers/mail.service';
import { EntitlementService } from '../subscription/entitlement.service';
import { LockoutService, RESET_CODE_TTL_SECONDS } from './lockout.service';
import { SocialVerifyService } from './social-verify.service';
import { TokenService } from './token.service';

const RESET_CODE_TTL_MS = RESET_CODE_TTL_SECONDS * 1000;
const VERIFICATION_CODE_TTL_MS = EMAIL_VERIFICATION.CODE_TTL_SECONDS * 1000;
/** A server-issued Apple nonce must be used within this window (one sign-in dialog). */
const APPLE_NONCE_TTL_SECONDS = 10 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly social: SocialVerifyService,
    private readonly lockout: LockoutService,
    private readonly mail: MailService,
    private readonly entitlements: EntitlementService,
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
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
    await this.maybeGrantSignupGift(user, { socialVerified: false });
    if (this.verificationRequired()) {
      // The first code goes out with registration; the client offers a resend.
      await this.sendVerificationCode(user.id).catch((error: unknown) => {
        this.logger.warn({ err: error, userId: user.id }, 'verification mail failed at register');
      });
    }
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

  /**
   * Apple sign-in nonce (§11): the client asks for one, hands its SHA-256 to
   * Apple, and sends the raw value back with the identity token. Single use
   * and short-lived, so a captured token cannot be replayed against us.
   */
  async issueAppleNonce(): Promise<AppleNonceResponse> {
    const nonce = randomBytes(32).toString('hex');
    await this.redis.set(this.appleNonceKey(nonce), '1', 'EX', APPLE_NONCE_TTL_SECONDS);
    return { nonce };
  }

  async loginWithApple(input: AppleAuthInput): Promise<AuthSession> {
    const consumed = await this.redis.getdel(this.appleNonceKey(input.nonce));
    if (consumed == null) {
      throw new AppException(
        ErrorCode.AUTH_PROVIDER_TOKEN_INVALID,
        'Unknown or replayed nonce',
        HttpStatus.UNAUTHORIZED,
      );
    }
    // Apple stores the hashed nonce in the token; the verifier compares exactly.
    const identity = await this.social.verifyApple(input.identityToken, sha256(input.nonce));
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

  // ── e-mail verification (§11) ────────────────────────────────────────────────

  /**
   * Verification only exists when codes can actually be mailed: with the mock
   * mailer nobody could ever confirm, so the flow (and the gift gate) is off.
   */
  private verificationRequired(): boolean {
    return this.env.MAIL_PROVIDER === 'smtp';
  }

  /**
   * Issue (or re-issue) a verification code. One live code per account, a
   * resend cooldown so a stranger cannot flood someone's inbox from a fresh
   * registration.
   */
  async sendVerificationCode(userId: string): Promise<EmailVerificationSendResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user == null) throw AppException.notFound('User not found');
    if (user.emailVerifiedAt != null || !this.verificationRequired()) {
      return { sent: false, cooldownSeconds: 0 };
    }

    const cooldownKey = `auth:verify-send:${userId}`;
    const armed = await this.redis.set(
      cooldownKey,
      '1',
      'EX',
      EMAIL_VERIFICATION.RESEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (armed == null) {
      const ttl = await this.redis.ttl(cooldownKey);
      throw new AppException(
        ErrorCode.RATE_LIMITED,
        'Verification code already sent',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSeconds: Math.max(ttl, 1) },
      );
    }

    await this.retireVerificationCodes(userId);
    const code = String(randomInt(100000, 1000000));
    await this.prisma.emailVerification.create({
      data: {
        userId,
        email: user.email,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + VERIFICATION_CODE_TTL_MS),
      },
    });
    await this.mail.send({
      to: user.email,
      subject: 'Masalım e-posta doğrulama kodun',
      text: `E-posta doğrulama kodun: ${code}\nKod 15 dakika geçerlidir.`,
    });
    return { sent: true, cooldownSeconds: EMAIL_VERIFICATION.RESEND_COOLDOWN_SECONDS };
  }

  /**
   * Confirm the mailbox. Same guess budget as password reset: five misses burn
   * the live code. A successful verification releases the signup gift that
   * registration withheld.
   */
  async verifyEmail(userId: string, code: string): Promise<VerifyEmailResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user == null) throw AppException.notFound('User not found');
    if (user.emailVerifiedAt != null) return { verified: true, giftGranted: false };

    if (await this.lockout.codeAttemptsExhausted('verify', userId)) {
      await this.retireVerificationCodes(userId);
      throw invalidResetCode();
    }
    const verification = await this.prisma.emailVerification.findFirst({
      where: {
        userId,
        email: user.email,
        codeHash: sha256(code),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (verification == null) {
      const attempts = await this.lockout.recordCodeFailure('verify', userId);
      if (attempts >= EMAIL_VERIFICATION.MAX_ATTEMPTS) {
        await this.retireVerificationCodes(userId);
      }
      throw invalidResetCode();
    }

    const now = new Date();
    const [, updated] = await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { usedAt: now },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } }),
    ]);
    await this.lockout.clearCodeAttempts('verify', userId);
    const giftGranted = await this.maybeGrantSignupGift(updated, { socialVerified: false });
    return { verified: true, giftGranted };
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

    // The provider vouched for the address (or there is only a placeholder,
    // which nobody could verify) — nothing left for the user to confirm.
    const placeholderEmail = `${provider.toLowerCase()}-${providerUserId}@users.masalim.app`;
    const created = await this.prisma.user.create({
      data: {
        email: trustedEmail ?? placeholderEmail,
        name: fullName ?? 'Masalım Kullanıcısı',
        emailVerifiedAt: trustedEmail != null ? new Date() : null,
        identities: { create: { provider, providerUserId } },
      },
    });
    await this.maybeGrantSignupGift(created, { socialVerified: true });
    return created;
  }

  /**
   * Tanışma hediyesi: every new account starts with a small credit gift — but
   * only once the mailbox is proven (or the provider vouched for it), else a
   * throw-away address farm would mint free credits. Idempotent on the ledger
   * key, so verifying after registration grants exactly once.
   */
  private async maybeGrantSignupGift(
    user: { id: string; emailVerifiedAt: Date | null },
    opts: { socialVerified: boolean },
  ): Promise<boolean> {
    const eligible =
      !this.verificationRequired() || opts.socialVerified || user.emailVerifiedAt != null;
    if (!eligible) return false;
    try {
      return await this.entitlements.grantCredits(
        user.id,
        SIGNUP_GIFT_CREDITS,
        CreditReason.SIGNUP_GIFT,
        { type: 'user', id: user.id },
        `gift:${user.id}`,
      );
    } catch (error) {
      // A failed gift must never block registration or verification.
      this.logger.warn({ err: error, userId: user.id }, 'signup gift could not be granted');
      return false;
    }
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

  private async retireVerificationCodes(userId: string): Promise<void> {
    await this.prisma.emailVerification.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  private appleNonceKey(nonce: string): string {
    return `auth:apple-nonce:${sha256(nonce)}`;
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
