import path from 'path';
import fs from 'fs';
import { Server as SocketIOServer } from 'socket.io';
import { TorrentInfo, TorrentFile } from '@torrent-platform/shared';
import { TransmissionService, TransmissionTorrentRaw, defaultTransmissionService } from '../services/TransmissionService';
import { deriveTorrentStatus } from '../services/stateMachine';
import { enqueueStorageUpload } from '../queues/uploadQueue';
import prisma from '../db/client';

export class TorrentCache {
  private transmission: TransmissionService;
  private io: SocketIOServer | null = null;
  private intervalTimer: NodeJS.Timeout | null = null;
  private cachedTorrents: Map<string, TorrentInfo> = new Map();
  private polledTorrentsRaw: TransmissionTorrentRaw[] = [];
  private enqueuedUploads: Set<string> = new Set();
  private pollIntervalMs: number;

  constructor(transmission: TransmissionService = defaultTransmissionService, pollIntervalMs = 2000) {
    this.transmission = transmission;
    this.pollIntervalMs = pollIntervalMs;
  }

  public setSocketServer(io: SocketIOServer): void {
    this.io = io;
  }

  public start(): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.poll().catch((err) => {
        // Silently catch daemon connection hiccup to avoid crashing loop
      });
    }, this.pollIntervalMs);
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public async poll(): Promise<TorrentInfo[]> {
    try {
      const rawList = await this.transmission.list();
      this.polledTorrentsRaw = rawList;

      // Query database for torrent records
      let dbTorrents: Array<{ id: string; userId: string; infoHash: string; status: string; storageKey: string | null; downloadUrl: string | null }> = [];
      try {
        dbTorrents = await prisma.torrent.findMany({
          select: {
            id: true,
            userId: true,
            infoHash: true,
            status: true,
            storageKey: true,
            downloadUrl: true
          }
        });
      } catch {
        // If DB not ready yet, continue with empty
      }

      const dbMap = new Map<string, typeof dbTorrents[0]>();
      for (const d of dbTorrents) {
        dbMap.set(d.infoHash.toLowerCase(), d);
      }

      const userTorrentsMap = new Map<string, TorrentInfo[]>();
      const currentList: TorrentInfo[] = [];

      for (const raw of rawList) {
        const hash = raw.hashString.toLowerCase();
        const dbRecord = dbMap.get(hash);
        const info = this.serialize(raw, dbRecord);

        this.cachedTorrents.set(hash, info);
        currentList.push(info);

        if (dbRecord) {
          const uTorrents = userTorrentsMap.get(dbRecord.userId) || [];
          uTorrents.push(info);
          userTorrentsMap.set(dbRecord.userId, uTorrents);

          // Check if newly completed & needs S3 upload
          if (
            raw.percentDone >= 1 &&
            !this.enqueuedUploads.has(hash) &&
            dbRecord.status !== 'ready' &&
            dbRecord.status !== 'uploading'
          ) {
            this.handleCompletion(raw, dbRecord);
          }
        }
      }

      // Emit to each user's isolated room
      if (this.io) {
        for (const [userId, torrents] of userTorrentsMap.entries()) {
          this.io.to(`user:${userId}`).emit('torrents-list', torrents);
        }
      }

      return currentList;
    } catch (err: any) {
      if (this.io) {
        this.io.emit('transmission-warning', { message: 'Transmission daemon unreachable: ' + err.message });
      }
      return [];
    }
  }

  private handleCompletion(raw: TransmissionTorrentRaw, dbRecord: { id: string; userId: string; infoHash: string }) {
    const hash = raw.hashString.toLowerCase();
    const downloadDir = raw.downloadDir || path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
    const primaryFile = raw.files?.[0]?.name || raw.name;
    const filePath = path.join(downloadDir, primaryFile);

    if (fs.existsSync(filePath)) {
      this.enqueuedUploads.add(hash);
      enqueueStorageUpload({
        torrentId: dbRecord.id,
        infoHash: dbRecord.infoHash,
        filePath,
        fileName: primaryFile,
        userId: dbRecord.userId
      }).catch(() => {
        this.enqueuedUploads.delete(hash);
      });
    }
  }

  public serialize(
    raw: TransmissionTorrentRaw,
    dbRecord?: { id: string; userId: string; status: string; storageKey: string | null; downloadUrl: string | null }
  ): TorrentInfo {
    const length = raw.sizeWhenDone || raw.totalSize || 0;
    const downloaded = (raw.haveValid || 0) + (raw.haveUnchecked || 0);
    const progress = length > 0 ? Math.min(1, downloaded / length) : raw.percentDone || 0;
    const status = deriveTorrentStatus(raw, dbRecord?.status);

    const files: TorrentFile[] = (raw.files || []).map((f) => ({
      name: f.name,
      length: f.length,
      path: f.name,
      bytesCompleted: f.bytesCompleted
    }));

    return {
      infoHash: raw.hashString,
      name: raw.name || 'Fetching metadata...',
      status,
      progress: Number(progress.toFixed(4)),
      downloadSpeed: raw.rateDownload || 0,
      uploadSpeed: raw.rateUpload || 0,
      numPeers: raw.peersConnected || 0,
      numSeeds: raw.peersSendingToUs || 0,
      length,
      downloaded,
      uploaded: raw.uploadedEver || 0,
      uploadedEver: raw.uploadedEver || 0,
      corruptEver: raw.corruptEver || 0,
      desiredAvailable: raw.desiredAvailable || 0,
      uploadRatio: raw.uploadRatio || 0,
      eta: raw.eta >= 0 ? raw.eta : -1,
      files,
      paused: raw.status === 0,
      id: dbRecord?.id,
      userId: dbRecord?.userId,
      storageKey: dbRecord?.storageKey || undefined,
      downloadUrl: dbRecord?.downloadUrl || undefined
    };
  }

  public getCached(infoHash: string): TorrentInfo | undefined {
    return this.cachedTorrents.get(infoHash.toLowerCase());
  }

  public getAllCached(): TorrentInfo[] {
    return Array.from(this.cachedTorrents.values());
  }

  public getRawList(): TransmissionTorrentRaw[] {
    return this.polledTorrentsRaw;
  }
}

export const defaultTorrentCache = new TorrentCache();
