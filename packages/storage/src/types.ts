export interface StorageObjectMeta {
  contentType: string;
  contentLength: number;
}

export interface SignedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresIn: number;
  /** Headers the client must send with the PUT (e.g. Content-Type). */
  headers: Record<string, string>;
}

export interface StorageProvider {
  readonly name: string;

  /** Create a signed PUT URL for a client-side upload. */
  createSignedUpload(input: {
    keyPrefix: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds?: number;
  }): Promise<SignedUpload>;

  /** Server-side upload (worker outputs: narration audio, illustrations, PDFs). */
  putObject(objectKey: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;

  /** Signed GET URL for private media (§83 — TTL configurable). */
  getSignedUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;

  getObject(objectKey: string): Promise<Buffer>;

  /** Copy inside the bucket — used for immutable order snapshots (§81). */
  copyObject(sourceKey: string, destinationKey: string): Promise<void>;

  deleteObject(objectKey: string): Promise<void>;

  /** Delete every object under a prefix (deletion workflows §84). */
  deletePrefix(prefix: string): Promise<void>;

  exists(objectKey: string): Promise<boolean>;

  headObject(objectKey: string): Promise<StorageObjectMeta | null>;
}

export interface StorageConfig {
  provider: 's3' | 'local';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  /** Path-style addressing — required for MinIO. */
  forcePathStyle?: boolean;
  signedUrlTtlSeconds?: number;
  /** local provider only: directory root + public base URL served by the API. */
  localRootDir?: string;
  localBaseUrl?: string;
}
