import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class StorageService {
  private s3Client: S3Client;
  private bucket: string;

  constructor(options?: {
    endpoint?: string;
    bucket?: string;
    accessKey?: string;
    secretKey?: string;
    region?: string;
    clientInstance?: S3Client;
  }) {
    this.bucket = options?.bucket || process.env.STORAGE_BUCKET || 'torrent-completed';

    if (options?.clientInstance) {
      this.s3Client = options.clientInstance;
      return;
    }

    const endpoint = options?.endpoint || process.env.STORAGE_ENDPOINT || 'http://localhost:9000';
    const accessKeyId = options?.accessKey || process.env.STORAGE_ACCESS_KEY || 'minioadmin';
    const secretAccessKey = options?.secretKey || process.env.STORAGE_SECRET_KEY || 'minioadmin';
    const region = options?.region || process.env.STORAGE_REGION || 'us-east-1';

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      },
      forcePathStyle: true
    });
  }

  public getBucketName(): string {
    return this.bucket;
  }

  public async ensureBucket(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      }
    }
  }

  public async upload(
    filePath: string,
    key: string,
    contentType = 'application/octet-stream'
  ): Promise<{ key: string; bucket: string; size: number }> {
    const stats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    await this.ensureBucket();

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: fileStream,
        ContentLength: stats.size,
        ContentType: contentType
      })
    );

    return {
      key,
      bucket: this.bucket,
      size: stats.size
    };
  }

  public async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    return getSignedUrl(this.s3Client, command, { expiresIn });
  }
}

export const defaultStorageService = new StorageService();
