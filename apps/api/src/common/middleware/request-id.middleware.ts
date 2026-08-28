import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Assigns a request id (reused by pino + the error envelope). */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();
  (req as Request & { id: string }).id = id;
  res.setHeader('x-request-id', id);
  next();
}
