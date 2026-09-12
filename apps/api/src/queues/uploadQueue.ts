import { Queue } from 'bullmq';
import IORedis from 'ioredis';

let redisConnection: IORedis | null = null;
let uploadQueue: Queue | null = null;

export function getRedisConnection(): IORedis {
  if (!redisConnection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      }
    });
    redisConnection.on('error', (err) => {
      // Prevent unhandled error crashing server when Redis is down
    });
  }
  return redisConnection;
}

export function getUploadQueue(): Queue {
  if (!uploadQueue) {
    const connection = getRedisConnection();
    uploadQueue = new Queue('storage-upload', {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    });
  }
  return uploadQueue;
}

export interface UploadJobData {
  torrentId: string;
  infoHash: string;
  filePath: string;
  fileName: string;
  userId: string;
}

export async function enqueueStorageUpload(data: UploadJobData): Promise<boolean> {
  try {
    const queue = getUploadQueue();
    // Idempotency: job ID based on infoHash ensures duplicate protection
    await queue.add('upload-torrent-file', data, {
      jobId: `upload-${data.infoHash}`
    });
    return true;
  } catch (err) {
    console.error('Failed to enqueue storage upload job:', err);
    return false;
  }
}
