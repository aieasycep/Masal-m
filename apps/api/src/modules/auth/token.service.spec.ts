import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception';
import type { PrismaService } from '../../prisma/prisma.service';
import type { Env } from '../../config/env';
import { hashToken, TokenService } from './token.service';

type RefreshRow = {
  id: string;
  userId: string;
  tokenHash: string;
  deviceId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { email: string; deletedAt: Date | null };
};

function buildService() {
  const rows: RefreshRow[] = [];
  let idCounter = 0;

  const prisma = {
    refreshToken: {
      create: jest.fn(async ({ data }: { data: Omit<RefreshRow, 'id' | 'revokedAt' | 'user'> }) => {
        const row: RefreshRow = {
          id: `rt-${++idCounter}`,
          revokedAt: null,
          user: { email: 'user@test.local', deletedAt: null },
          deviceId: null,
          ...data,
        };
        rows.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        return rows.find((row) => row.tokenHash === where.tokenHash) ?? null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { revokedAt: Date } }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (row) row.revokedAt = data.revokedAt;
        return row;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: { userId?: string; tokenHash?: string; revokedAt?: null }; data: { revokedAt: Date } }) => {
          for (const row of rows) {
            const userMatch = where.userId == null || row.userId === where.userId;
            const hashMatch = where.tokenHash == null || row.tokenHash === where.tokenHash;
            const activeMatch = !('revokedAt' in where) || row.revokedAt === null;
            if (userMatch && hashMatch && activeMatch) row.revokedAt = data.revokedAt;
          }
          return { count: 0 };
        },
      ),
    },
  } as unknown as PrismaService;

  const env = { JWT_SECRET: 'test-secret-test-secret' } as Env;
  const service = new TokenService(new JwtService({}), prisma, env);
  return { service, rows };
}

describe('TokenService', () => {
  it('issues an access/refresh pair and stores only the hash', async () => {
    const { service, rows } = buildService();
    const tokens = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });

    expect(tokens.accessToken.split('.')).toHaveLength(3);
    expect(tokens.refreshToken.length).toBeGreaterThan(30);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(tokens.refreshToken));
    expect(rows[0]!.tokenHash).not.toBe(tokens.refreshToken);
  });

  it('rotates a refresh token: old one is revoked, a new one works', async () => {
    const { service, rows } = buildService();
    const first = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });

    const second = await service.rotate(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(rows.find((row) => row.tokenHash === hashToken(first.refreshToken))?.revokedAt).not.toBeNull();
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const { service, rows } = buildService();
    const first = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });
    await service.rotate(first.refreshToken);

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(AppException);
    // every token of the user is revoked after reuse detection
    expect(rows.every((row) => row.revokedAt != null)).toBe(true);
  });

  it('rejects expired refresh tokens', async () => {
    const { service, rows } = buildService();
    const tokens = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });
    rows[0]!.expiresAt = new Date(Date.now() - 1000);

    await expect(service.rotate(tokens.refreshToken)).rejects.toBeInstanceOf(AppException);
  });
});
