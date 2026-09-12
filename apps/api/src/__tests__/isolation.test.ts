import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import torrentRoutes from '../routes/torrents';
import prisma from '../db/client';

jest.mock('../db/client', () => ({
  __esModule: true,
  default: {
    torrent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      create: jest.fn()
    }
  }
}));

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/torrents', torrentRoutes);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-min-32-chars';

function createToken(userId: string, email: string) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

describe('Multi-Tenant Isolation', () => {
  const tokenUserA = createToken('user-a', 'usera@example.com');
  const tokenUserB = createToken('user-b', 'userb@example.com');

  const torrentOfUserB = {
    id: 'torrent-b-1',
    userId: 'user-b',
    infoHash: 'hash-of-b',
    name: 'User B Private Document.iso',
    status: 'completed',
    storageKey: null,
    downloadUrl: null,
    urlExpiresAt: null,
    sizeBytes: BigInt(100000),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('User A cannot list or see User B torrents', async () => {
    (prisma.torrent.findMany as jest.Mock).mockImplementation(({ where }) => {
      if (where.userId === 'user-a') {
        return Promise.resolve([]);
      }
      return Promise.resolve([torrentOfUserB]);
    });

    const res = await request(app)
      .get('/api/torrents')
      .set('Authorization', `Bearer ${tokenUserA}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
    expect(prisma.torrent.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      orderBy: { createdAt: 'desc' }
    });
  });

  test('User A cannot pause or resume User B torrent', async () => {
    (prisma.torrent.findFirst as jest.Mock).mockImplementation(({ where }) => {
      // Lookups strictly filter by userId
      if (where.id === 'torrent-b-1' && where.userId === 'user-a') {
        return Promise.resolve(null); // Not found for User A!
      }
      return Promise.resolve(torrentOfUserB);
    });

    const resPause = await request(app)
      .post('/api/torrents/torrent-b-1/pause')
      .set('Authorization', `Bearer ${tokenUserA}`);

    expect(resPause.status).toBe(404);
    expect(resPause.body.error).toContain('unauthorized');

    const resResume = await request(app)
      .post('/api/torrents/torrent-b-1/resume')
      .set('Authorization', `Bearer ${tokenUserA}`);

    expect(resResume.status).toBe(404);
  });

  test('User A cannot download User B files', async () => {
    (prisma.torrent.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/torrents/torrent-b-1/download')
      .set('Authorization', `Bearer ${tokenUserA}`);

    expect(res.status).toBe(404);
  });

  test('User A cannot delete User B torrent', async () => {
    (prisma.torrent.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/torrents/torrent-b-1')
      .set('Authorization', `Bearer ${tokenUserA}`);

    expect(res.status).toBe(404);
    expect(prisma.torrent.delete).not.toHaveBeenCalled();
  });
});
