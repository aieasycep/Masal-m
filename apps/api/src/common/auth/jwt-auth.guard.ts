import {
  HttpStatus,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Inject } from '@nestjs/common';
import { ErrorCode } from '@masalim/types';
import type { Request } from 'express';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY } from './public.decorator';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  type: 'access';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
}

/** Global JWT guard — every route requires a bearer token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Missing bearer token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    const token = header.slice('Bearer '.length);
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.env.JWT_SECRET,
      });
    } catch (err) {
      const expired = err instanceof Error && err.name === 'TokenExpiredError';
      throw new AppException(
        expired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_TOKEN_INVALID,
        expired ? 'Access token expired' : 'Invalid access token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (payload.type !== 'access') {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Invalid token type',
        HttpStatus.UNAUTHORIZED,
      );
    }
    (request as Request & { user: AuthenticatedUser }).user = {
      id: payload.sub,
      email: payload.email,
    };
    return true;
  }
}
