import { createHash, randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode, JWT } from '@masalim/types';
import type { AuthTokens } from '@masalim/validation';
import { PrismaService } from '../../prisma/prisma.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../../common/errors/app.exception';

/**
 * Access/refresh token issuance with rotation (§11, §45).
 * Refresh tokens are opaque 256-bit values stored hashed; reuse of a revoked
 * token revokes the whole family (stolen-token detection).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issueTokens(user: { id: string; email: string }, deviceId?: string): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, type: 'access' },
      { secret: this.env.JWT_SECRET, expiresIn: JWT.ACCESS_TTL_SECONDS },
    );
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        deviceId,
        expiresAt: new Date(Date.now() + JWT.REFRESH_TTL_SECONDS * 1000),
      },
    });
    return {
      accessToken,
      refreshToken,
      accessTokenExpiresAt: Math.floor(Date.now() / 1000) + JWT.ACCESS_TTL_SECONDS,
    };
  }

  async rotate(refreshToken: string): Promise<AuthTokens> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (stored == null || stored.user.deletedAt != null) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Unknown refresh token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (stored.revokedAt != null) {
      // Reuse of a rotated token → assume theft, revoke every session of the user.
      await this.revokeAllForUser(stored.userId);
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Refresh token reuse detected',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (stored.expiresAt.getTime() < Date.now()) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        'Refresh token expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(
      { id: stored.userId, email: stored.user.email },
      stored.deviceId ?? undefined,
    );
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
