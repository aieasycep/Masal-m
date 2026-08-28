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

export interface AdminTokenPayload {
  sub: string;
  email: string;
  role: AdminRole;
  type: 'admin';
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  role: AdminRole;
}

export const ADMIN_ROLES_KEY = 'adminRoles';
/** Restrict a handler to specific admin roles; default = any admin (§40). */
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

/**
 * Separate admin JWT realm (§39): admin tokens carry type='admin' and are
 * never interchangeable with user access tokens. RBAC enforced per handler.
 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
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
        secret: this.env.JWT_SECRET,
      });
    } catch (error) {
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_TOKEN_INVALID,
        expired ? 'Admin token expired' : 'Invalid admin token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (payload.type !== 'admin') {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Not an admin token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const allowed = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ADMIN_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed != null && allowed.length > 0 && !allowed.includes(payload.role)) {
      throw new AppException(
        ErrorCode.FORBIDDEN_OWNERSHIP,
        'Insufficient admin role',
        HttpStatus.FORBIDDEN,
      );
    }

    request.admin = { id: payload.sub, email: payload.email, role: payload.role };
    return true;
  }
}
