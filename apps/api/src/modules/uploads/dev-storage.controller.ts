import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LocalStorageProvider, type StorageProvider } from '@masalim/storage';
import { ErrorCode } from '@masalim/types';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';

/**
 * Dev-only object routes backing the LocalStorageProvider's signed URLs.
 * Only active when STORAGE_PROVIDER=local (production config rejects that).
 * URLs carry an HMAC token — the flow mirrors S3 signed URLs.
 */
@ApiExcludeController()
@Controller('dev-storage')
export class DevStorageController {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}

  private local(): LocalStorageProvider {
    if (!(this.storage instanceof LocalStorageProvider)) {
      throw AppException.notFound('Dev storage is not enabled');
    }
    return this.storage;
  }

  @Public()
  @Put(':key')
  async put(
    @Param('key') key: string,
    @Query('token') token: string,
    @Query('expires') expires: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const provider = this.local();
    const objectKey = decodeURIComponent(key);
    if (!provider.verifyToken(objectKey, parseInt(expires, 10), 'PUT', token ?? '')) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Invalid or expired upload URL',
        HttpStatus.FORBIDDEN,
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    await provider.putObject(
      objectKey,
      Buffer.concat(chunks),
      req.headers['content-type'] ?? 'application/octet-stream',
    );
    res.status(200).end();
  }

  @Public()
  @Get(':key')
  async get(
    @Param('key') key: string,
    @Query('token') token: string,
    @Query('expires') expires: string,
    @Res() res: Response,
  ): Promise<void> {
    const provider = this.local();
    const objectKey = decodeURIComponent(key);
    if (!provider.verifyToken(objectKey, parseInt(expires, 10), 'GET', token ?? '')) {
      throw new AppException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Invalid or expired download URL',
        HttpStatus.FORBIDDEN,
      );
    }
    const meta = await provider.headObject(objectKey);
    if (meta == null) throw AppException.notFound('Object not found');
    const body = await provider.getObject(objectKey);
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', String(body.byteLength));
    res.status(200).send(body);
  }
}
