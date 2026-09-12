import fs from 'fs';
import path from 'path';
import { StorageWorker } from '../workers/storageWorker';
import { StorageService } from '../services/StorageService';
import prisma from '../db/client';

jest.mock('../db/client', () => ({
  __esModule: true,
  default: {
    torrent: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    }
  }
}));

describe('StorageWorker', () => {
  let worker: StorageWorker;
  let mockStorageService: StorageService;
  const tempTestFile = path.resolve(__dirname, 'test-download-file.tmp');

  beforeAll(() => {
    fs.writeFileSync(tempTestFile, 'dummy completed torrent contents');
  });

  afterAll(() => {
    if (fs.existsSync(tempTestFile)) fs.unlinkSync(tempTestFile);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorageService = {
      upload: jest.fn().mockResolvedValue({
        key: 'torrents/user-1/hash-1/file.iso',
        bucket: 'torrent-completed',
        size: 100
      }),
      getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed-url'),
      ensureBucket: jest.fn().mockResolvedValue(undefined),
      getBucketName: jest.fn().mockReturnValue('torrent-completed')
    } as unknown as StorageService;

    worker = new StorageWorker(mockStorageService);
  });

  test('processUploadJob: uploads file, generates signed URL, and marks status ready', async () => {
    const mockJob: any = {
      id: 'upload-hash-1',
      data: {
        torrentId: 'torrent-1',
        infoHash: 'hash-1',
        filePath: tempTestFile,
        fileName: 'file.iso',
        userId: 'user-1'
      }
    };

    const result = await worker.processUploadJob(mockJob);

    expect(result.storageKey).toBe('users/user-1/torrents/torrent-1/' + path.basename(tempTestFile));
    expect(mockStorageService.upload).toHaveBeenCalledWith(tempTestFile, expect.stringContaining('torrent-1'));
    expect(mockStorageService.getSignedUrl).toHaveBeenCalled();

    // Verify DB state updates
    expect(prisma.torrent.updateMany).toHaveBeenCalledWith({
      where: { id: 'torrent-1' },
      data: { status: 'uploading' }
    });

    expect(prisma.torrent.updateMany).toHaveBeenCalledWith({
      where: { id: 'torrent-1' },
      data: expect.objectContaining({
        status: 'ready',
        downloadUrl: 'https://s3.example.com/signed-url'
      })
    });
  });

  test('processUploadJob: throws error if file does not exist on disk (triggering worker retry)', async () => {
    const mockJob: any = {
      id: 'upload-missing-file',
      data: {
        torrentId: 'torrent-1',
        infoHash: 'hash-1',
        filePath: 'C:/non-existent-path/file.iso',
        fileName: 'file.iso',
        userId: 'user-1'
      }
    };

    await expect(worker.processUploadJob(mockJob)).rejects.toThrow('Local file not found on disk');
    expect(mockStorageService.upload).not.toHaveBeenCalled();
  });
});
