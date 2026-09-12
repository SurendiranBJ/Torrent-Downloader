import { TransmissionService } from '../services/TransmissionService';

describe('TransmissionService', () => {
  let service: TransmissionService;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      addUrl: jest.fn().mockResolvedValue({
        'torrent-added': { hashString: 'abc123hash', id: 1, name: 'Ubuntu 24.04 ISO' }
      }),
      addBase64: jest.fn().mockResolvedValue({
        'torrent-added': { hashString: 'def456hash', id: 2, name: 'Debian 12 ISO' }
      }),
      get: jest.fn().mockResolvedValue({
        torrents: [
          {
            id: 1,
            hashString: 'abc123hash',
            name: 'Ubuntu 24.04 ISO',
            status: 4,
            percentDone: 0.5,
            rateDownload: 5242880,
            rateUpload: 1048576,
            peersConnected: 25,
            peersSendingToUs: 15
          }
        ]
      }),
      stop: jest.fn().mockResolvedValue({}),
      start: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
      sessionGet: jest.fn().mockResolvedValue({
        version: '4.0.5',
        'peer-port': 51413,
        'dht-enabled': true
      }),
      sessionSet: jest.fn().mockResolvedValue({}),
      sessionStats: jest.fn().mockResolvedValue({
        activeTorrentCount: 1,
        downloadSpeed: 5242880,
        uploadSpeed: 1048576,
        torrentCount: 1
      }),
      portTest: jest.fn().mockResolvedValue({ 'port-is-open': true })
    };

    service = new TransmissionService({ clientInstance: mockClient });
  });

  test('addMagnet: successfully adds valid magnet link', async () => {
    const magnet = 'magnet:?xt=urn:btih:abc123hash&dn=Ubuntu';
    const result = await service.addMagnet(magnet);
    expect(result.infoHash).toBe('abc123hash');
    expect(result.name).toBe('Ubuntu 24.04 ISO');
    expect(mockClient.addUrl).toHaveBeenCalledWith(magnet, expect.any(Object));
  });

  test('addMagnet: throws error on invalid magnet URI', async () => {
    await expect(service.addMagnet('http://not-a-magnet.com')).rejects.toThrow('Invalid magnet URI');
  });

  test('addFile: successfully adds base64 torrent file', async () => {
    const base64Data = Buffer.from('mock torrent content').toString('base64');
    const result = await service.addFile(base64Data);
    expect(result.infoHash).toBe('def456hash');
    expect(mockClient.addBase64).toHaveBeenCalledWith(base64Data, expect.any(Object));
  });

  test('list & get: queries torrents list and looks up by hash', async () => {
    const list = await service.list();
    expect(list).toHaveLength(1);
    expect(list[0].hashString).toBe('abc123hash');

    const single = await service.get('abc123hash');
    expect(single).not.toBeNull();
    expect(single?.name).toBe('Ubuntu 24.04 ISO');
  });

  test('pause & resume: triggers stop and start on Transmission daemon', async () => {
    await service.pause('abc123hash');
    expect(mockClient.stop).toHaveBeenCalledWith(1);

    await service.resume('abc123hash');
    expect(mockClient.start).toHaveBeenCalledWith(1);
  });

  test('remove: removes torrent and passes deleteLocalData parameter', async () => {
    await service.remove('abc123hash', true);
    expect(mockClient.remove).toHaveBeenCalledWith(1, true);
  });

  test('session configuration & statistics: reads and writes session info', async () => {
    const session = await service.getSession();
    expect(session.version).toBe('4.0.5');

    await service.setSession({ 'peer-port': 51413 });
    expect(mockClient.sessionSet).toHaveBeenCalledWith({ 'peer-port': 51413 });

    const stats = await service.getSessionStats();
    expect(stats.activeTorrentCount).toBe(1);
  });

  test('testPort: correctly maps portTest response', async () => {
    const open = await service.testPort();
    expect(open).toBe(true);

    mockClient.portTest.mockResolvedValueOnce({ 'port-is-open': false });
    const closed = await service.testPort();
    expect(closed).toBe(false);
  });
});
