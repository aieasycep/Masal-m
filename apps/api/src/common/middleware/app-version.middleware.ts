import { Injectable, type NestMiddleware } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ErrorCode } from '@masalim/types';
import type { NextFunction, Request, Response } from 'express';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { AppException } from '../errors/app.exception';

/** Version gate: mobile sends x-app-version; below the minimum → APP_VERSION_UNSUPPORTED. */
@Injectable()
export class AppVersionMiddleware implements NestMiddleware {
  constructor(@Inject(ENV) private readonly env: Env) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const version = req.headers['x-app-version'];
    if (typeof version === 'string' && version.length > 0) {
      if (compareSemver(version, this.env.MIN_SUPPORTED_APP_VERSION) < 0) {
        throw new AppException(
          ErrorCode.APP_VERSION_UNSUPPORTED,
          'App version is no longer supported',
          426,
        );
      }
    }
    next();
  }
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((part) => parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}
