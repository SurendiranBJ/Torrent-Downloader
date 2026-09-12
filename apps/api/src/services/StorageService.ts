import fs from 'fs';
import path from 'path';
import {
  S3Client,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  StorageClass,
  ServerSideEncryption
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface StorageConfig {
  provider?: 's3' | 'minio' | 'r2';
  endpoint?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  storageClass?: StorageClass;
  clientInstance?: S3Client;
}

export class StorageService {
  private s3Client: S3Client;
  private bucket: string;
  private isNativeAws: boolean;
  private defaultStorageClass: StorageClass | undefined;

  constructor(options?: StorageConfig) {
    this.bucket =
      options?.bucket ||
      process.env.AWS_S3_BUCKET ||
      process.env.STORAGE_BUCKET ||
      'torrent-completed';

    const provider =
      options?.provider ||
      (process.env.STORAGE_PROVIDER as 's3' | 'minio' | 'r2') ||
      (process.env.AWS_S3_BUCKET ? 's3' : 'minio');

    const explicitEndpoint = options?.endpoint || process.env.STORAGE_ENDPOINT;
    this.isNativeAws =
      provider === 's3' && (!explicitEndpoint || explicitEndpoint.includes('amazonaws.com'));

    const region =
      options?.region ||
      process.env.AWS_REGION ||
      process.env.STORAGE_REGION ||
      'us-east-1';

    const accessKeyId =
      options?.accessKey ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.STORAGE_ACCESS_KEY ||
      'minioadmin';

    const secretAccessKey =
      options?.secretKey ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      process.env.STORAGE_SECRET_KEY ||
      'minioadmin';

    const storageClassEnv = (process.env.AWS_S3_STORAGE_CLASS ||
      process.env.STORAGE_CLASS) as StorageClass | undefined;
    this.defaultStorageClass = options?.storageClass || storageClassEnv || 'STANDARD';

    if (options?.clientInstance) {
      this.s3Client = options.clientInstance;
      return;
    }

    // Configure S3 Client according to target (AWS S3 vs MinIO/Local)
    this.s3Client = new S3Client({
      region,
      ...(this.isNativeAws
        ? {
            // Native AWS S3: Virtual-hosted style addressing (e.g. bucket.s3.amazonaws.com)
            forcePathStyle: false
          }
        : {
            // Local MinIO or R2: Custom endpoint with path-style addressing
            endpoint: explicitEndpoint || 'http://localhost:9000',
            forcePathStyle: true
          }),
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey
            }
          : undefined
    });
  }

  public getBucketName(): string {
    return this.bucket;
  }

  public isUsingAwsS3(): boolean {
    return this.isNativeAws;
  }

  public async ensureBucket(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err: any) {
      if (
        err.name === 'NotFound' ||
        err.$metadata?.httpStatusCode === 404 ||
        err.name === 'NoSuchBucket'
      ) {
        // Only attempt automatic bucket creation if permitted (primarily for local MinIO / dev)
        try {
          await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        } catch (createErr) {
          console.warn(`Note: Could not auto-create bucket "${this.bucket}". Ensure it exists in your AWS S3 console.`);
        }
      }
    }
  }

  /**
   * High-throughput Multipart Upload for Multi-Gigabyte Torrents
   * Supports files up to 5 TB with 10MB chunked concurrency
   */
  public async upload(
    filePath: string,
    key: string,
    contentType = 'application/octet-stream'
  ): Promise<{ key: string; bucket: string; size: number }> {
    const stats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    await this.ensureBucket();

    // Use AWS Multipart Streaming Upload
    const parallelUpload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentType: contentType,
        StorageClass: this.isNativeAws ? this.defaultStorageClass : undefined,
        ServerSideEncryption: this.isNativeAws ? ('AES256' as ServerSideEncryption) : undefined
      },
      queueSize: 4, // 4 concurrent part uploads
      partSize: 10 * 1024 * 1024, // 10 MB chunk size
      leavePartsOnError: false
    });

    parallelUpload.on('httpUploadProgress', (progress) => {
      if (progress.total) {
        const pct = Math.round(((progress.loaded || 0) / progress.total) * 100);
        if (pct % 25 === 0) {
          console.log(`[AWS S3 Upload] Key: ${key} — ${pct}% (${progress.loaded}/${progress.total} bytes)`);
        }
      }
    });

    await parallelUpload.done();

    return {
      key,
      bucket: this.bucket,
      size: stats.size
    };
  }

  /**
   * Generates a pre-signed AWS S3 download URL
   */
  public async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }
}

export const defaultStorageService = new StorageService();
