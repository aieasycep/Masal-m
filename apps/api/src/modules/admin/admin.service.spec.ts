import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type Redis from 'ioredis';
import { AdminRole, ErrorCode, OrderStatus } from '@masalim/types';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';
import type { JobsService } from '../../jobs/jobs.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import type { AuthenticatedAdmin } from './admin-auth.guard';
import { adminSigningSecret } from './admin-token';
import { AdminService } from './admin.service';

const JWT_SECRET = 'test-secret-test-secret';
const ADMIN_EMAIL = 'owner@test.local';
const CURRENT_PASSWORD = 'current-password-123';

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  passwordHash: string;
}

interface AuditRow {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
}

/** In-memory Redis subset the lockout counter uses (INCR/EXPIRE/GET/DEL). */
function buildRedis() {
  const counters = new Map<string, number>();
  const expire = jest.fn(async () => 1);
  const redis = {
    get: jest.fn(async (key: string) => {
      const value = counters.get(key);
      return value == null ? null : String(value);
    }),
    incr: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    expire,
    del: jest.fn(async (key: string) => (counters.delete(key) ? 1 : 0)),
  };
  return { redis: redis as unknown as Redis, counters, calls: redis };
}

interface OrderRow {
  id: string;
  status: OrderStatus;
  trackingNumber: string | null;
}

async function buildService(options: { orderStatus?: OrderStatus } = {}) {
  const admin: AdminRow = {
    id: 'admin-1',
    email: ADMIN_EMAIL,
    name: 'Owner',
    role: AdminRole.ADMIN,
    passwordHash: await argon2.hash(CURRENT_PASSWORD),
  };
  const audits: AuditRow[] = [];
  const order: OrderRow = {
    id: 'o1',
    status: options.orderStatus ?? OrderStatus.PENDING,
    trackingNumber: null,
  };

  const prisma = {
    order: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === order.id ? { ...order } : null,
      ),
      update: jest.fn(async ({ data }: { data: Partial<OrderRow> }) => {
        if (data.trackingNumber !== undefined) order.trackingNumber = data.trackingNumber;
        return { ...order };
      }),
    },
    adminUser: {
      findUnique: jest.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        const match =
          (where.id != null && where.id === admin.id) ||
          (where.email != null && where.email === admin.email);
        return match ? { ...admin } : null;
      }),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
          if (where.id !== admin.id) throw new Error('not found');
          admin.passwordHash = data.passwordHash;
          return { ...admin };
        },
      ),
    },
    auditLog: {
      create: jest.fn(async ({ data }: { data: AuditRow }) => {
        audits.push(data);
        return { id: `audit-${audits.length}`, ...data };
      }),
    },
  } as unknown as PrismaService;

  const { redis, counters, calls } = buildRedis();
  const env = { JWT_SECRET } as Env;
  const jwt = new JwtService({});
  const orders = {
    transition: jest.fn(
      async (orderId: string, status: OrderStatus, extra: { trackingNumber?: string | null }) => {
        order.status = status;
        if (extra.trackingNumber !== undefined) order.trackingNumber = extra.trackingNumber;
        return { ...order, id: orderId };
      },
    ),
  };
  const service = new AdminService(
    prisma,
    jwt,
    {} as JobsService,
    orders as unknown as OrdersService,
    redis,
    env,
  );
  const authenticated: AuthenticatedAdmin = { id: admin.id, email: admin.email, role: admin.role };
  return {
    service,
    admin,
    audits,
    counters,
    redisCalls: calls,
    jwt,
    authenticated,
    order,
    orders,
    prisma,
  };
}

async function expectAppException(
  promise: Promise<unknown>,
  code: ErrorCode,
  status: HttpStatus,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppException);
  const exception = caught as AppException;
  expect(exception.code).toBe(code);
  expect(exception.getStatus()).toBe(status);
}

describe('AdminService.changePassword', () => {
  it('rejects a wrong current password with 401 AUTH_INVALID_CREDENTIALS and leaves the hash untouched', async () => {
    const { service, admin, audits, authenticated } = await buildService();
    const before = admin.passwordHash;

    await expectAppException(
      service.changePassword(authenticated, {
        currentPassword: 'not-the-password-1',
        newPassword: 'a-brand-new-password-1',
      }),
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
    );
    expect(admin.passwordHash).toBe(before);
    expect(audits).toHaveLength(0);
  });

  it('rejects reusing the current password with 400 VALIDATION_FAILED', async () => {
    const { service, admin, audits, authenticated } = await buildService();
    const before = admin.passwordHash;

    await expectAppException(
      service.changePassword(authenticated, {
        currentPassword: CURRENT_PASSWORD,
        newPassword: CURRENT_PASSWORD,
      }),
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
    );
    expect(admin.passwordHash).toBe(before);
    expect(audits).toHaveLength(0);
  });

  it('stores an argon2 hash of the new password and writes an admin.password.changed audit row', async () => {
    const { service, admin, audits, authenticated } = await buildService();
    const newPassword = 'a-brand-new-password-1';

    await service.changePassword(authenticated, {
      currentPassword: CURRENT_PASSWORD,
      newPassword,
    });

    expect(admin.passwordHash).not.toContain(newPassword);
    await expect(argon2.verify(admin.passwordHash, newPassword)).resolves.toBe(true);
    await expect(argon2.verify(admin.passwordHash, CURRENT_PASSWORD)).resolves.toBe(false);
    expect(audits).toEqual([
      expect.objectContaining({
        adminUserId: admin.id,
        action: 'admin.password.changed',
        entityType: 'AdminUser',
        entityId: admin.id,
      }),
    ]);
  });
});

describe('AdminService.login lockout', () => {
  const IP = '203.0.113.7';

  it('locks the email+ip pair after 10 failures, even for the correct password', async () => {
    const { service, counters, redisCalls } = await buildService();
    const wrong = { email: ADMIN_EMAIL, password: 'wrong-password-1' };

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await expectAppException(
        service.login(wrong, IP),
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }
    expect(counters.get(`admin:lockout:${ADMIN_EMAIL}:${IP}`)).toBe(10);
    // the window TTL is set once, on the first failure
    expect(redisCalls.expire).toHaveBeenCalledTimes(1);
    expect(redisCalls.expire).toHaveBeenCalledWith(`admin:lockout:${ADMIN_EMAIL}:${IP}`, 15 * 60);

    await expectAppException(
      service.login({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD }, IP),
      ErrorCode.AUTH_LOCKED_OUT,
      HttpStatus.TOO_MANY_REQUESTS,
    );
    // a different ip for the same email is not locked out
    await expect(
      service.login({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD }, '198.51.100.9'),
    ).resolves.toMatchObject({ admin: { email: ADMIN_EMAIL } });
  });

  it('clears the failure counter on success and audits the login', async () => {
    const { service, counters, audits, admin } = await buildService();
    const key = `admin:lockout:${ADMIN_EMAIL}:${IP}`;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expectAppException(
        service.login({ email: ADMIN_EMAIL, password: 'wrong-password-1' }, IP),
        ErrorCode.AUTH_INVALID_CREDENTIALS,
        HttpStatus.UNAUTHORIZED,
      );
    }
    expect(counters.get(key)).toBe(3);

    const session = await service.login({ email: ADMIN_EMAIL, password: CURRENT_PASSWORD }, IP);
    expect(counters.has(key)).toBe(false);
    expect(session.admin).toEqual({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    });
    expect(audits).toEqual([
      expect.objectContaining({
        adminUserId: admin.id,
        action: 'admin.login',
        entityType: 'AdminUser',
        entityId: admin.id,
        metadata: { ip: IP },
      }),
    ]);
  });

  it('signs tokens in the derived admin realm, not with the raw user JWT_SECRET', async () => {
    const { service, jwt, admin } = await buildService();
    const { accessToken } = await service.login(
      { email: ADMIN_EMAIL, password: CURRENT_PASSWORD },
      IP,
    );

    await expect(jwt.verifyAsync(accessToken, { secret: JWT_SECRET })).rejects.toThrow();
    const payload = await jwt.verifyAsync<{ sub: string; type: string; role?: string }>(
      accessToken,
      {
        secret: adminSigningSecret(JWT_SECRET),
      },
    );
    expect(payload).toMatchObject({ sub: admin.id, type: 'admin' });
    // role is intentionally NOT a token claim — the guard re-reads it from the DB
    expect(payload.role).toBeUndefined();
  });
});

describe('AdminService.patchOrder — lifecycle guard (D.4)', () => {
  it('refuses an illegal transition with 409 VALIDATION_FAILED and writes nothing', async () => {
    const { service, order, orders, prisma } = await buildService({
      orderStatus: OrderStatus.PENDING,
    });

    await expectAppException(
      service.patchOrder('o1', { status: OrderStatus.SHIPPED }),
      ErrorCode.VALIDATION_FAILED,
      HttpStatus.CONFLICT,
    );
    await service
      .patchOrder('o1', { status: OrderStatus.SHIPPED })
      .catch((error: AppException) =>
        expect(error.details).toEqual({ from: OrderStatus.PENDING, to: OrderStatus.SHIPPED }),
      );
    expect(orders.transition).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(order.status).toBe(OrderStatus.PENDING);
  });

  it('delegates a legal status change to OrdersService.transition (timeline owner)', async () => {
    const { service, order, orders, prisma } = await buildService({
      orderStatus: OrderStatus.PAID,
    });

    const result = await service.patchOrder('o1', { status: OrderStatus.IN_PRODUCTION });

    expect(orders.transition).toHaveBeenCalledWith('o1', OrderStatus.IN_PRODUCTION, {
      trackingNumber: undefined,
    });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'o1', status: OrderStatus.IN_PRODUCTION, trackingNumber: null });
    expect(order.status).toBe(OrderStatus.IN_PRODUCTION);
  });

  it('updates the tracking number alone without touching the lifecycle', async () => {
    const { service, orders, prisma } = await buildService({
      orderStatus: OrderStatus.SHIPPED,
    });

    const result = await service.patchOrder('o1', {
      status: OrderStatus.SHIPPED,
      trackingNumber: 'TRK-1',
    });

    expect(orders.transition).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'o1', status: OrderStatus.SHIPPED, trackingNumber: 'TRK-1' });
  });

  it('404s an unknown order', async () => {
    const { service } = await buildService();
    await expectAppException(
      service.patchOrder('ghost', { status: OrderStatus.CANCELLED }),
      ErrorCode.NOT_FOUND,
      HttpStatus.NOT_FOUND,
    );
  });
});
