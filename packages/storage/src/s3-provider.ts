import { randomUUID } from 'node:crypto';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SIGNED_URL_DEFAULT_TTL_SECONDS } from '@masalim/types';
import type { SignedUpload, StorageConfig, StorageObjectMeta, StorageProvider } from './types';

/** S3-compatible storage (AWS S3, Cloudflare R2, MinIO). */
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly defaultTtl: number;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    this.defaultTtl = config.signedUrlTtlSeconds ?? SIGNED_URL_DEFAULT_TTL_SECONDS;
    this.client = new S3Client({
      region: config.region ?? 'auto',
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? false,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    });
  }

  async createSignedUpload(input: {
    keyPrefix: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds?: number;
  }): Promise<SignedUpload> {
    const objectKey = `${input.keyPrefix}/${randomUUID()}`;
    const expiresIn = input.expiresInSeconds ?? this.defaultTtl;
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });
    return {
      uploadUrl,
      objectKey,
      expiresIn,
      headers: { 'Content-Type': input.contentType },
    };
  }

  async putObject(objectKey: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: body, ContentType: contentType }),
    );
  }

  async getSignedUrl(objectKey: string, expiresInSeconds?: number): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: objectKey });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds ?? this.defaultTtl });
  }

  async getObject(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (bytes == null) throw new Error(`Empty object body for ${objectKey}`);
    return Buffer.from(bytes);
  }

  async copyObject(sourceKey: string, destinationKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${encodeURIComponent(sourceKey)}`,
        Key: destinationKey,
      }),
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listed = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => k != null);
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken != null);
  }

  async exists(objectKey: string): Promise<boolean> {
    return (await this.headObject(objectKey)) != null;
  }

  async headObject(objectKey: string): Promise<StorageObjectMeta | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        contentType: head.ContentType ?? 'application/octet-stream',
        contentLength: head.ContentLength ?? 0,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err == null) return false;
  const name = (err as { name?: string }).name;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}
