import { Worker, Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import { getRedisConnection, UploadJobData } from '../queues/uploadQueue';
import { StorageService, defaultStorageService } from '../services/StorageService';
import prisma from '../db/client';

export class StorageWorker {
  private worker: Worker | null = null;
  private storageService: StorageService;

  constructor(storageService: StorageService = defaultStorageService) {
    this.storageService = storageService;
  }

  public start(): void {
    const connection = getRedisConnection();
    const concurrency = parseInt(process.env.STORAGE_UPLOAD_CONCURRENCY || '1', 10);

    this.worker = new Worker<UploadJobData>(
      'storage-upload',
      async (job: Job<UploadJobData>) => {
        return this.processUploadJob(job);
      },
      {
        connection: connection as any,
        concurrency: Math.max(1, concurrency)
      }
    );

    this.worker.on('failed', async (job, err) => {
      console.error(`Storage upload job ${job?.id} failed:`, err.message);
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        try {
          await prisma.torrent.updateMany({
            where: { infoHash: job.data.infoHash },
            data: { status: 'error' }
          });
        } catch {}
      }
    });

    this.worker.on('completed', (job) => {
      console.log(`Storage upload job ${job.id} completed successfully`);
    });
  }

  public async processUploadJob(job: Job<UploadJobData>): Promise<{ storageKey: string }> {
    const { torrentId, infoHash, filePath, fileName, userId } = job.data;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Local file not found on disk at: ${filePath}`);
    }

    // Step 1: Mark status as uploading
    try {
      await prisma.torrent.updateMany({
        where: { id: torrentId },
        data: { status: 'uploading' }
      });
    } catch {}

    // Step 2: Upload to S3 / MinIO
    const storageKey = `torrents/${userId}/${infoHash}/${path.basename(filePath)}`;
    await this.storageService.upload(filePath, storageKey);

    // Step 3: Generate initial signed URL (expires in 24 hours)
    const expiresSeconds = 86400;
    const signedUrl = await this.storageService.getSignedUrl(storageKey, expiresSeconds);
    const expiresAt = new Date(Date.now() + expiresSeconds * 1000);

    // Step 4: Mark status as ready
    try {
      await prisma.torrent.updateMany({
        where: { id: torrentId },
        data: {
          status: 'ready',
          storageKey,
          downloadUrl: signedUrl,
          urlExpiresAt: expiresAt
        }
      });
    } catch {}

    return { storageKey };
  }

  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
  }
}

export const defaultStorageWorker = new StorageWorker();
