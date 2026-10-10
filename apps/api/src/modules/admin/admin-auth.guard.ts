import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AdminRole, ErrorCode } from '@masalim/types';
import { AppException } from '../../common/errors/app.exception';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { adminSigningSecret, type AdminTokenPayload } from './admin-token';

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

export const ADMIN_ROLES_KEY = 'adminRoles';
/** Restrict a handler to specific admin roles; default = any admin (§40). */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

/**
 * Separate admin JWT realm (§39): admin tokens are signed with a key derived
 * from JWT_SECRET (see admin-token.ts) and are never interchangeable with user
 * access tokens. The token only identifies the admin — role and email are
 * re-read from the AdminUser row on every request, so a demoted or deleted
 * admin loses access immediately. RBAC enforced per handler.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { admin?: AuthenticatedAdmin }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (token == null) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Missing admin token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    let payload: AdminTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminTokenPayload>(token, {
        secret: adminSigningSecret(this.env.JWT_SECRET),
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_TOKEN_INVALID,
        expired ? 'Admin token expired' : 'Invalid admin token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (payload.type !== 'admin' || typeof payload.sub !== 'string') {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Not an admin token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });
    if (admin == null) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Admin account no longer exists',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const allowed = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed != null && allowed.length > 0 && !allowed.includes(admin.role)) {
      throw new AppException(
        ErrorCode.FORBIDDEN_OWNERSHIP,
        'Insufficient admin role',
        HttpStatus.FORBIDDEN,
      );
    }

    request.admin = { id: admin.id, email: admin.email, role: admin.role };
    return true;
  }
}
