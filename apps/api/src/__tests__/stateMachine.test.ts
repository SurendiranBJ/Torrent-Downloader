import { deriveTorrentStatus, isLocalFileReady } from '../services/stateMachine';
import { TransmissionTorrentRaw } from '../services/TransmissionService';

describe('Torrent State Machine', () => {
  const baseTorrent: TransmissionTorrentRaw = {
    id: 1,
    hashString: 'test123hash',
    name: 'Sample Torrent',
    status: 4,
    percentDone: 0.5,
    rateDownload: 1000,
    rateUpload: 200,
    peersConnected: 10,
    peersSendingToUs: 5,
    sizeWhenDone: 100000,
    totalSize: 100000,
    haveValid: 50000,
    haveUnchecked: 0,
    uploadedEver: 10000,
    eta: 50
  };

  test('derives paused when status is 0 (STOPPED)', () => {
    const raw = { ...baseTorrent, status: 0 };
    expect(deriveTorrentStatus(raw)).toBe('paused');
  });

  test('derives checking when status is 1 or 2 (CHECK_WAIT / CHECK)', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 1 })).toBe('checking');
    expect(deriveTorrentStatus({ ...baseTorrent, status: 2 })).toBe('checking');
  });

  test('derives queued when status is 3 (DOWNLOAD_WAIT)', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 3 })).toBe('queued');
  });

  test('derives downloading when status is 4 and progress < 1', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 4, percentDone: 0.85 })).toBe('downloading');
  });

  test('derives completed when status is 4 and percentDone is 1.0', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 4, percentDone: 1.0 })).toBe('completed');
  });

  test('derives completed when status is 5 (SEED_WAIT)', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 5, percentDone: 1.0 })).toBe('completed');
  });

  test('derives seeding when status is 6 (SEED)', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 6, percentDone: 1.0 })).toBe('seeding');
  });

  test('derives uploading when database status is uploading', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 6, percentDone: 1.0 }, 'uploading')).toBe('uploading');
  });

  test('derives ready when database status is ready', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, status: 6, percentDone: 1.0 }, 'ready')).toBe('ready');
  });

  test('derives error when raw.error > 0', () => {
    expect(deriveTorrentStatus({ ...baseTorrent, error: 2, errorString: 'Disk write error' })).toBe('error');
  });

  test('isLocalFileReady allows immediate access when completed/seeding/uploading/ready', () => {
    expect(isLocalFileReady('downloading', 0.5)).toBe(false);
    expect(isLocalFileReady('completed', 1.0)).toBe(true);
    expect(isLocalFileReady('seeding', 1.0)).toBe(true);
    expect(isLocalFileReady('uploading', 1.0)).toBe(true);
    expect(isLocalFileReady('ready', 1.0)).toBe(true);
  });
});
