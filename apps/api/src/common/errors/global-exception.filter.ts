import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode, type ApiErrorBody } from '@masalim/types';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from './app.exception';

/** Maps every error to the standard envelope {error:{code,message,requestId}} (§44). */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as { id?: string }).id;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL;
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof ZodValidationException) {
      status = HttpStatus.BAD_REQUEST;
      code = ErrorCode.VALIDATION_FAILED;
      message = 'Validation failed';
      const zodError = exception.getZodError() as { issues?: unknown[] } | undefined;
      details = zodError?.issues?.slice(0, 10);
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = ErrorCode.RATE_LIMITED;
      message = 'Too many requests';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      code = defaultCodeForStatus(status);
    } else {
      this.logger.error(
        { err: exception, requestId, path: request.url },
        'Unhandled exception',
      );
    }

    if (status >= 500 && exception instanceof HttpException) {
      this.logger.error({ err: exception, requestId, path: request.url }, message);
    }

    const body: ApiErrorBody = { error: { code, message, requestId } };
    if (details !== undefined) body.error.details = details;
    response.status(status).json(body);
  }
}

function defaultCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    case 401:
      return ErrorCode.AUTH_TOKEN_INVALID;
    case 403:
      return ErrorCode.FORBIDDEN_OWNERSHIP;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return ErrorCode.INTERNAL;
  }
}
