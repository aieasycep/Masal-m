import { Controller, Get, HttpStatus, Inject, Param, Put, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { LocalStorageProvider, StorageProvider } from '@masalim/storage';
import { AVATAR_UPLOAD, ErrorCode, VOICE_RECORDING } from '@masalim/types';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { AppException } from '../../common/errors/app.exception';
import { STORAGE } from '../../providers/providers.module';

const MAX_DEV_UPLOAD_BYTES = Math.max(
  VOICE_RECORDING.MAX_UPLOAD_BYTES,
  AVATAR_UPLOAD.MAX_UPLOAD_BYTES,
);

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
    // Mirror S3's signed-upload size cap: the dev route is public (token-gated)
    // and must not let a client stream an unbounded body onto the disk.
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of req) {
      received += (chunk as Buffer).byteLength;
      if (received > MAX_DEV_UPLOAD_BYTES) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          'Upload exceeds the allowed size',
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }
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
