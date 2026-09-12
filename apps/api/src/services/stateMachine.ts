import { TorrentStatus } from '@torrent-platform/shared';
import { TransmissionTorrentRaw } from './TransmissionService';

export function deriveTorrentStatus(
  raw: TransmissionTorrentRaw,
  dbStatus?: string | null
): TorrentStatus {
  // If database marks it as ready or uploading, preserve that storage lifecycle status
  if (dbStatus === 'ready') return 'ready';
  if (dbStatus === 'uploading') return 'uploading';

  // Error check
  if (raw.error && raw.error > 0) return 'error';

  // Transmission status mapping
  // 0: STOPPED (paused)
  // 1: CHECK_WAIT
  // 2: CHECK
  // 3: DOWNLOAD_WAIT
  // 4: DOWNLOAD
  // 5: SEED_WAIT
  // 6: SEED

  if (raw.status === 0) return 'paused';
  if (raw.status === 1 || raw.status === 2) return 'checking';
  if (raw.status === 3) return 'queued';
  if (raw.status === 4) {
    if (raw.percentDone >= 1) return 'completed';
    return 'downloading';
  }
  if (raw.status === 5) return 'completed';
  if (raw.status === 6) {
    return 'seeding';
  }

  if (raw.percentDone >= 1) {
    return 'completed';
  }

  return 'queued';
}

export function isLocalFileReady(status: TorrentStatus, percentDone: number): boolean {
  return (
    percentDone >= 1 ||
    status === 'completed' ||
    status === 'seeding' ||
    status === 'uploading' ||
    status === 'ready'
  );
}
