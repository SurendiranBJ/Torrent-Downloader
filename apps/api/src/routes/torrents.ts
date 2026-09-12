import { Router, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth';
import { defaultTransmissionService } from '../services/TransmissionService';
import { defaultStorageService } from '../services/StorageService';
import { defaultTorrentCache } from '../cache/torrentCache';
import { gatherDiagnostics } from '../services/diagnostics';
import prisma from '../db/client';

const router = Router();
const tmpDir = path.resolve(process.env.TMP_DIR || './tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({ dest: tmpDir });

// All routes require authentication
router.use(authenticateJwt);

// GET /api/torrents - List all torrents for the authenticated user
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    // Get all torrents owned by this user
    const dbTorrents = await prisma.torrent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    const results = dbTorrents.map((d) => {
      const cached = defaultTorrentCache.getCached(d.infoHash);
      if (cached) {
        return {
          ...cached,
          id: d.id,
          userId: d.userId,
          storageKey: d.storageKey || undefined,
          downloadUrl: d.downloadUrl || undefined,
          urlExpiresAt: d.urlExpiresAt?.toISOString()
        };
      }
      return {
        id: d.id,
        userId: d.userId,
        infoHash: d.infoHash,
        name: d.name,
        status: d.status as any,
        progress: d.status === 'ready' || d.status === 'completed' ? 1 : 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        numPeers: 0,
        numSeeds: 0,
        length: Number(d.sizeBytes || 0),
        downloaded: Number(d.sizeBytes || 0),
        uploaded: 0,
        uploadedEver: 0,
        corruptEver: 0,
        desiredAvailable: 1,
        uploadRatio: 0,
        eta: -1,
        files: [],
        paused: false,
        storageKey: d.storageKey || undefined,
        downloadUrl: d.downloadUrl || undefined,
        urlExpiresAt: d.urlExpiresAt?.toISOString()
      };
    });

    return res.json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list torrents' });
  }
});

// POST /api/torrents/magnet - Add a magnet link
router.post('/magnet', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { magnet } = req.body || {};
    if (!magnet || typeof magnet !== 'string' || !magnet.startsWith('magnet:')) {
      return res.status(400).json({ error: 'Valid magnet URI is required' });
    }

    const userId = req.user!.userId;
    const added = await defaultTransmissionService.addMagnet(magnet);
    const hash = added.infoHash.toLowerCase();

    // Check if user already tracked this torrent
    let torrentRecord = await prisma.torrent.findFirst({
      where: { userId, infoHash: hash }
    });

    if (!torrentRecord) {
      torrentRecord = await prisma.torrent.create({
        data: {
          userId,
          infoHash: hash,
          name: added.name || 'Fetching metadata...',
          status: 'queued'
        }
      });
    }

    // Trigger immediate cache poll
    defaultTorrentCache.poll().catch(() => {});

    return res.status(201).json({
      ok: true,
      torrent: {
        id: torrentRecord.id,
        infoHash: hash,
        name: torrentRecord.name,
        status: torrentRecord.status
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to add magnet' });
  }
});

// POST /api/torrents/upload - Upload a .torrent file
router.post('/upload', upload.single('torrentFile'), async (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No torrent file provided' });
  }

  const filePath = req.file.path;
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const base64 = fileBuffer.toString('base64');
    const added = await defaultTransmissionService.addFile(base64);
    const hash = added.infoHash.toLowerCase();
    const userId = req.user!.userId;

    let torrentRecord = await prisma.torrent.findFirst({
      where: { userId, infoHash: hash }
    });

    if (!torrentRecord) {
      torrentRecord = await prisma.torrent.create({
        data: {
          userId,
          infoHash: hash,
          name: added.name || req.file.originalname.replace('.torrent', ''),
          status: 'queued'
        }
      });
    }

    fs.unlink(filePath, () => {});
    defaultTorrentCache.poll().catch(() => {});

    return res.status(201).json({
      ok: true,
      torrent: {
        id: torrentRecord.id,
        infoHash: hash,
        name: torrentRecord.name,
        status: torrentRecord.status
      }
    });
  } catch (err: any) {
    if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
    return res.status(500).json({ error: err.message || 'Failed to upload torrent' });
  }
});

// POST /api/torrents/:id/pause
router.post('/:id/pause', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const torrent = await prisma.torrent.findFirst({ where: { id, userId } });
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found or unauthorized' });
    }

    await defaultTransmissionService.pause(torrent.infoHash);
    defaultTorrentCache.poll().catch(() => {});
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to pause torrent' });
  }
});

// POST /api/torrents/:id/resume
router.post('/:id/resume', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const torrent = await prisma.torrent.findFirst({ where: { id, userId } });
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found or unauthorized' });
    }

    await defaultTransmissionService.resume(torrent.infoHash);
    defaultTorrentCache.poll().catch(() => {});
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to resume torrent' });
  }
});

// DELETE /api/torrents/:id - Remove torrent
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const deleteFiles = req.query.deleteFiles === 'true';

    const torrent = await prisma.torrent.findFirst({ where: { id, userId } });
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found or unauthorized' });
    }

    try {
      await defaultTransmissionService.remove(torrent.infoHash, deleteFiles);
    } catch {}

    await prisma.torrent.delete({ where: { id } });
    defaultTorrentCache.poll().catch(() => {});
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to remove torrent' });
  }
});

// GET /api/torrents/:id/download - Pre-signed URL or redirect
router.get('/:id/download', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const torrent = await prisma.torrent.findFirst({ where: { id, userId } });
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found or unauthorized' });
    }

    // If storageKey exists, return valid signed URL
    if (torrent.storageKey) {
      if (torrent.downloadUrl && torrent.urlExpiresAt && torrent.urlExpiresAt > new Date()) {
        return res.json({ downloadUrl: torrent.downloadUrl, type: 's3' });
      }
      const newSignedUrl = await defaultStorageService.getSignedUrl(torrent.storageKey, 3600);
      await prisma.torrent.update({
        where: { id },
        data: {
          downloadUrl: newSignedUrl,
          urlExpiresAt: new Date(Date.now() + 3600 * 1000)
        }
      });
      return res.json({ downloadUrl: newSignedUrl, type: 's3' });
    }

    // If not uploaded to S3 yet, check local availability
    const cached = defaultTorrentCache.getCached(torrent.infoHash);
    if (cached && cached.progress >= 1) {
      return res.json({
        downloadUrl: `/api/torrents/${id}/download-local`,
        type: 'local',
        message: 'Storage upload in progress. Immediate local download available.'
      });
    }

    return res.status(400).json({
      error: 'Torrent download is not completed yet',
      progress: cached?.progress || 0
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate download URL' });
  }
});

// GET /api/torrents/:id/download-local - Secure immediate local completed file download
router.get('/:id/download-local', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const torrent = await prisma.torrent.findFirst({ where: { id, userId } });
    if (!torrent) {
      return res.status(404).json({ error: 'Torrent not found or unauthorized' });
    }

    const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
    const cached = defaultTorrentCache.getCached(torrent.infoHash);
    const fileName = cached?.files?.[0]?.name || cached?.name || torrent.name;

    // Secure path sanitization to prevent directory traversal
    const safeFilePath = path.resolve(downloadDir, fileName);
    if (!safeFilePath.startsWith(downloadDir)) {
      return res.status(403).json({ error: 'Access denied: invalid file path' });
    }

    if (!fs.existsSync(safeFilePath)) {
      return res.status(404).json({ error: 'File not found on local disk' });
    }

    return res.download(safeFilePath, path.basename(safeFilePath));
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Local download failed' });
  }
});

// GET /api/torrents/diagnostics - Diagnostics endpoint
router.get('/diagnostics', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const diagnostics = await gatherDiagnostics();
    return res.json(diagnostics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to gather diagnostics' });
  }
});

export default router;
