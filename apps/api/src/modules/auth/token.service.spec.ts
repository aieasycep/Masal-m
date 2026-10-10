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

type UpdateManyArgs = {
  where: { id?: string; userId?: string; tokenHash?: string; revokedAt?: null };
  data: { revokedAt: Date };
};

function buildService() {
  const rows: RefreshRow[] = [];
  let idCounter = 0;

  const prisma = {
    refreshToken: {
      create: jest.fn(async ({ data }: { data: Omit<RefreshRow, 'id' | 'revokedAt' | 'user'> }) => {
        const row: RefreshRow = {
          ...data,
          id: `rt-${++idCounter}`,
          revokedAt: null,
          user: { email: 'user@test.local', deletedAt: null },
        };
        rows.push(row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { tokenHash: string } }) => {
        return rows.find((row) => row.tokenHash === where.tokenHash) ?? null;
      }),
      // Honours every filter the service uses and reports the real count, so
      // the compare-and-set in rotate() is exercised for real.
      updateMany: jest.fn(async ({ where, data }: UpdateManyArgs) => {
        let count = 0;
        for (const row of rows) {
          const idMatch = where.id == null || row.id === where.id;
          const userMatch = where.userId == null || row.userId === where.userId;
          const hashMatch = where.tokenHash == null || row.tokenHash === where.tokenHash;
          const activeMatch = !('revokedAt' in where) || row.revokedAt === null;
          if (idMatch && userMatch && hashMatch && activeMatch) {
            row.revokedAt = data.revokedAt;
            count += 1;
          }
        }
        return { count };
      }),
    },
  } as unknown as PrismaService;

  const env = { JWT_SECRET: 'test-secret-test-secret' } as Env;
  const service = new TokenService(new JwtService({}), prisma, env);
  return { service, rows, prisma };
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
    expect(
      rows.find((row) => row.tokenHash === hashToken(first.refreshToken))?.revokedAt,
    ).not.toBeNull();
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const { service, rows } = buildService();
    const first = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });
    await service.rotate(first.refreshToken);

    await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(AppException);
    // every token of the user is revoked after reuse detection
    expect(rows.every((row) => row.revokedAt != null)).toBe(true);
  });

  it('lets only one of two concurrent rotations of the same token win', async () => {
    const { service, rows, prisma } = buildService();
    const first = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });

    // Both calls pass the read-phase (row still active) before either writes:
    // the first findUnique parks until the second one has also been served.
    const findUnique = prisma.refreshToken.findUnique as jest.Mock;
    const original = findUnique.getMockImplementation()!;
    let releaseFirst: (() => void) | undefined;
    const firstParked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    findUnique
      .mockImplementationOnce(async (args: { where: { tokenHash: string } }) => {
        await firstParked;
        return original(args);
      })
      .mockImplementationOnce(async (args: { where: { tokenHash: string } }) => {
        const row = await original(args);
        releaseFirst?.();
        return row;
      });

    const results = await Promise.allSettled([
      service.rotate(first.refreshToken),
      service.rotate(first.refreshToken),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'AUTH_TOKEN_INVALID',
      status: 401,
    });
    // the loser is treated as reuse: the original token is dead and the
    // family-wide revoke was issued (whether it also catches the winner's new
    // token depends on write ordering, exactly as it would in production)
    expect(rows[0]!.revokedAt).not.toBeNull();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('rejects expired refresh tokens', async () => {
    const { service, rows } = buildService();
    const tokens = await service.issueTokens({ id: 'user-1', email: 'user@test.local' });
    rows[0]!.expiresAt = new Date(Date.now() - 1000);

    await expect(service.rotate(tokens.refreshToken)).rejects.toBeInstanceOf(AppException);
  });

  it('revokeForUser ignores a refresh token that belongs to another user', async () => {
    const { service, rows } = buildService();
    const victim = await service.issueTokens({ id: 'user-victim', email: 'user@test.local' });

    await service.revokeForUser('user-attacker', victim.refreshToken);
    expect(rows[0]!.revokedAt).toBeNull();

    await service.revokeForUser('user-victim', victim.refreshToken);
    expect(rows[0]!.revokedAt).not.toBeNull();
  });
});
