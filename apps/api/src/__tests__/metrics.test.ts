import { TorrentCache } from '../cache/torrentCache';
import { TransmissionService } from '../services/TransmissionService';

describe('Torrent Metrics and Serialization', () => {
  let cache: TorrentCache;
  let mockTransmission: any;

  beforeEach(() => {
    mockTransmission = {
      list: jest.fn().mockResolvedValue([])
    } as unknown as TransmissionService;
    cache = new TorrentCache(mockTransmission);
  });

  test('correctly maps raw metrics to TorrentInfo', () => {
    const raw = {
      id: 42,
      hashString: 'metricstest123',
      name: 'Linux Mint Cinnamon',
      status: 4,
      percentDone: 0.75,
      rateDownload: 10485760, // 10 MB/s
      rateUpload: 2097152,    // 2 MB/s
      peersConnected: 64,
      peersSendingToUs: 32,
      sizeWhenDone: 2000000000,
      totalSize: 2000000000,
      haveValid: 1500000000,
      haveUnchecked: 0,
      uploadedEver: 500000000,
      corruptEver: 1048576,   // 1 MB corrupt discarded
      desiredAvailable: 0.98,
      uploadRatio: 0.33,
      eta: 48,
      files: [
        { name: 'linuxmint.iso', length: 2000000000, bytesCompleted: 1500000000 }
      ]
    };

    const serialized = cache.serialize(raw);

    expect(serialized.infoHash).toBe('metricstest123');
    expect(serialized.name).toBe('Linux Mint Cinnamon');
    expect(serialized.status).toBe('downloading');
    expect(serialized.progress).toBe(0.75);
    expect(serialized.downloadSpeed).toBe(10485760);
    expect(serialized.uploadSpeed).toBe(2097152);
    expect(serialized.numPeers).toBe(64);
    expect(serialized.numSeeds).toBe(32);
    expect(serialized.uploadedEver).toBe(500000000);
    expect(serialized.corruptEver).toBe(1048576);
    expect(serialized.desiredAvailable).toBe(0.98);
    expect(serialized.uploadRatio).toBe(0.33);
    expect(serialized.eta).toBe(48);
    expect(serialized.files).toHaveLength(1);
    expect(serialized.files[0].name).toBe('linuxmint.iso');
  });

  test('handles unknown ETA and zero total size gracefully', () => {
    const raw = {
      id: 99,
      hashString: 'zero123',
      name: 'Metadata Pending',
      status: 4,
      percentDone: 0,
      rateDownload: 0,
      rateUpload: 0,
      peersConnected: 0,
      peersSendingToUs: 0,
      sizeWhenDone: 0,
      totalSize: 0,
      haveValid: 0,
      haveUnchecked: 0,
      uploadedEver: 0,
      eta: -1
    };

    const serialized = cache.serialize(raw);
    expect(serialized.progress).toBe(0);
    expect(serialized.eta).toBe(-1);
    expect(serialized.downloadSpeed).toBe(0);
  });
});
