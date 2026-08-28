import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@masalim/types';

/** Application exception carrying a canonical ErrorCode (§44). */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: number,
    readonly details?: unknown,
  ) {
    super(message, status);
  }

  static notFound(message = 'Resource not found'): AppException {
    return new AppException(ErrorCode.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static forbiddenOwnership(message = 'You do not own this resource'): AppException {
    return new AppException(ErrorCode.FORBIDDEN_OWNERSHIP, message, HttpStatus.FORBIDDEN);
  }

  static validation(message: string, details?: unknown): AppException {
    return new AppException(ErrorCode.VALIDATION_FAILED, message, HttpStatus.BAD_REQUEST, details);
  }
}
