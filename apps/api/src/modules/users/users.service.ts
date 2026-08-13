import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { ACCOUNT_DELETION_GRACE_DAYS, ErrorCode } from '@masalim/types';
import type { DeleteAccountInput, Me, UpdateMeInput } from '@masalim/validation';
import type { StorageProvider } from '@masalim/storage';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';
import { TokenService } from '../auth/token.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
  ) {}

  async getMe(userId: string): Promise<Me> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        deletionRequests: {
          where: { scope: 'ACCOUNT', status: 'PENDING' },
          orderBy: { requestedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (user == null) throw AppException.notFound('User not found');

    const pending = user.deletionRequests[0];
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarKey ? await this.storage.getSignedUrl(user.avatarKey) : null,
      locale: user.locale === 'en' ? 'en' : 'tr',
      timezone: user.timezone,
      onboardingCompleted: user.onboardingCompleted,
      subscriptionPlan: user.subscriptionPlan,
      pendingDeletion: pending
        ? {
            requestedAt: pending.requestedAt.toISOString(),
            effectiveAt: pending.effectiveAt.toISOString(),
          }
        : null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateMe(userId: string, input: UpdateMeInput): Promise<Me> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        locale: input.locale,
        timezone: input.timezone,
        onboardingCompleted: input.onboardingCompleted,
        avatarKey: input.avatarObjectKey === undefined ? undefined : input.avatarObjectKey,
      },
    });
    return this.getMe(userId);
  }

  /** §84: deletion request with a grace period; the worker completes it later. */
  async requestDeletion(userId: string, input: DeleteAccountInput): Promise<Me> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user == null) throw AppException.notFound('User not found');

    if (user.passwordHash != null) {
      const ok =
        input.password != null && (await argon2.verify(user.passwordHash, input.password));
      if (!ok) {
        throw new AppException(
          ErrorCode.AUTH_INVALID_CREDENTIALS,
          'Password confirmation failed',
          HttpStatus.UNAUTHORIZED,
        );
      }
    }

    const existing = await this.prisma.deletionRequest.findFirst({
      where: { userId, scope: 'ACCOUNT', status: 'PENDING' },
    });
    if (existing == null) {
      await this.prisma.deletionRequest.create({
        data: {
          userId,
          scope: 'ACCOUNT',
          status: 'PENDING',
          effectiveAt: new Date(Date.now() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000),
        },
      });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    await this.tokens.revokeAllForUser(userId);
    return this.getMe(userId);
  }

  async cancelDeletion(userId: string): Promise<Me> {
    await this.prisma.deletionRequest.updateMany({
      where: { userId, scope: 'ACCOUNT', status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    await this.prisma.user.update({ where: { id: userId }, data: { deletedAt: null } });
    return this.getMe(userId);
  }
}
