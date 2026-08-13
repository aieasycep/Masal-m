import { createHmac, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SIGNED_URL_DEFAULT_TTL_SECONDS } from '@masalim/types';
import type { SignedUpload, StorageConfig, StorageObjectMeta, StorageProvider } from './types';

/**
 * Local-disk storage for development without MinIO/S3. Objects live under
 * `localRootDir`; "signed" URLs point at the API's dev storage routes and carry
 * an HMAC token so the flow (PUT upload / GET fetch) mirrors production shape.
 * Dev-only — production config validation refuses provider "local".
 */
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly rootDir: string;
  private readonly baseUrl: string;
  private readonly defaultTtl: number;
  private readonly secret = 'masalim-local-storage-dev-secret';

  constructor(config: StorageConfig) {
    if (!config.localRootDir || !config.localBaseUrl) {
      throw new Error('LocalStorageProvider requires localRootDir and localBaseUrl');
    }
    this.rootDir = config.localRootDir;
    this.baseUrl = config.localBaseUrl.replace(/\/$/, '');
    this.defaultTtl = config.signedUrlTtlSeconds ?? SIGNED_URL_DEFAULT_TTL_SECONDS;
  }

  /** HMAC over key+expiry — lets the dev storage route verify URLs statelessly. */
  signToken(objectKey: string, expiresAtEpochSeconds: number, method: 'GET' | 'PUT'): string {
    return createHmac('sha256', this.secret)
      .update(`${method}:${objectKey}:${expiresAtEpochSeconds}`)
      .digest('hex');
  }

  verifyToken(
    objectKey: string,
    expiresAtEpochSeconds: number,
    method: 'GET' | 'PUT',
    token: string,
  ): boolean {
    if (Number.isNaN(expiresAtEpochSeconds) || expiresAtEpochSeconds * 1000 < Date.now()) {
      return false;
    }
    return this.signToken(objectKey, expiresAtEpochSeconds, method) === token;
  }

  private filePath(objectKey: string): string {
    const safe = path.normalize(objectKey).replace(/^(\.\.[/\\])+/, '');
    return path.join(this.rootDir, safe);
  }

  private metaPath(objectKey: string): string {
    return `${this.filePath(objectKey)}.meta.json`;
  }

  async createSignedUpload(input: {
    keyPrefix: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds?: number;
  }): Promise<SignedUpload> {
    const objectKey = `${input.keyPrefix}/${randomUUID()}`;
    const expiresIn = input.expiresInSeconds ?? this.defaultTtl;
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const token = this.signToken(objectKey, expiresAt, 'PUT');
    const uploadUrl = `${this.baseUrl}/dev-storage/${encodeURIComponent(objectKey)}?token=${token}&expires=${expiresAt}`;
    return { uploadUrl, objectKey, expiresIn, headers: { 'Content-Type': input.contentType } };
  }

  async putObject(objectKey: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    const file = this.filePath(objectKey);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    await fs.writeFile(
      this.metaPath(objectKey),
      JSON.stringify({ contentType, contentLength: body.byteLength }),
    );
  }

  async getSignedUrl(objectKey: string, expiresInSeconds?: number): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInSeconds ?? this.defaultTtl);
    const token = this.signToken(objectKey, expiresAt, 'GET');
    return `${this.baseUrl}/dev-storage/${encodeURIComponent(objectKey)}?token=${token}&expires=${expiresAt}`;
  }

  async getObject(objectKey: string): Promise<Buffer> {
    return fs.readFile(this.filePath(objectKey));
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    const dest = this.filePath(destinationKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(this.filePath(sourceKey), dest);
    try {
      await fs.copyFile(this.metaPath(sourceKey), this.metaPath(destinationKey));
    } catch {
      // meta is best-effort in dev
    }
  }

  async deleteObject(objectKey: string): Promise<void> {
    await fs.rm(this.filePath(objectKey), { force: true });
    await fs.rm(this.metaPath(objectKey), { force: true });
  }

  async deletePrefix(prefix: string): Promise<void> {
    await fs.rm(this.filePath(prefix), { recursive: true, force: true });
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await fs.access(this.filePath(objectKey));
      return true;
    } catch {
      return false;
    }
  }

  async headObject(objectKey: string): Promise<StorageObjectMeta | null> {
    try {
      const raw = await fs.readFile(this.metaPath(objectKey), 'utf8');
      return JSON.parse(raw) as StorageObjectMeta;
    } catch {
      try {
        const stat = await fs.stat(this.filePath(objectKey));
        return { contentType: 'application/octet-stream', contentLength: stat.size };
      } catch {
        return null;
      }
    }
  }
}
