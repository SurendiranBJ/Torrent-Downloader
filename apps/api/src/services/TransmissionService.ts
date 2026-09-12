import path from 'path';
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Transmission = require('transmission-promise');

export interface TransmissionTorrentRaw {
  id: number;
  hashString: string;
  name: string;
  status: number;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  peersSendingToUs: number;
  peersGettingFromUs?: number;
  sizeWhenDone: number;
  totalSize: number;
  haveValid: number;
  haveUnchecked: number;
  uploadedEver: number;
  corruptEver?: number;
  desiredAvailable?: number;
  uploadRatio?: number;
  eta: number;
  files?: Array<{ name: string; length: number; bytesCompleted?: number }>;
  downloadDir?: string;
  error?: number;
  errorString?: string;
}

export interface TransmissionSessionConfig {
  'peer-port'?: number;
  'speed-limit-down-enabled'?: boolean;
  'speed-limit-down'?: number;
  'speed-limit-up-enabled'?: boolean;
  'speed-limit-up'?: number;
  'peer-limit-global'?: number;
  'peer-limit-per-torrent'?: number;
  'dht-enabled'?: boolean;
  'pex-enabled'?: boolean;
  'lpd-enabled'?: boolean;
  'utp-enabled'?: boolean;
  'port-forwarding-enabled'?: boolean;
  'cache-size-mb'?: number;
  'download-dir'?: string;
  'incomplete-dir'?: string;
  'incomplete-dir-enabled'?: boolean;
  [key: string]: unknown;
}

export class TransmissionService {
  private client: any;
  private isConnected = false;
  private lastConnectAttempt = 0;

  constructor(options?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    clientInstance?: any;
  }) {
    if (options?.clientInstance) {
      this.client = options.clientInstance;
      this.isConnected = true;
      return;
    }

    const host = options?.host || process.env.TRANSMISSION_HOST || 'localhost';
    const port = options?.port || (process.env.TRANSMISSION_RPC_PORT ? parseInt(process.env.TRANSMISSION_RPC_PORT, 10) : 9091);
    const username = options?.username ?? process.env.TRANSMISSION_RPC_USER ?? '';
    const password = options?.password ?? process.env.TRANSMISSION_RPC_PASSWORD ?? '';

    this.client = new Transmission({
      host,
      port,
      username,
      password,
      ssl: false
    });
  }

  public getRawClient() {
    return this.client;
  }

  public async initializeConfig(): Promise<void> {
    try {
      const peerPort = parseInt(process.env.TRANSMISSION_PEER_PORT || '51413', 10);
      const downloadLimit = parseInt(process.env.TRANSMISSION_DOWNLOAD_LIMIT || '0', 10);
      const uploadLimit = parseInt(process.env.TRANSMISSION_UPLOAD_LIMIT || '0', 10);
      const globalPeerLimit = parseInt(process.env.TRANSMISSION_GLOBAL_PEER_LIMIT || '500', 10);
      const peerLimitPerTorrent = parseInt(process.env.TRANSMISSION_PEER_LIMIT_PER_TORRENT || '100', 10);
      const dhtEnabled = (process.env.TRANSMISSION_DHT_ENABLED || 'true').toLowerCase() === 'true';
      const pexEnabled = (process.env.TRANSMISSION_PEX_ENABLED || 'true').toLowerCase() === 'true';
      const lpdEnabled = (process.env.TRANSMISSION_LPD_ENABLED || 'true').toLowerCase() === 'true';
      const utpEnabled = (process.env.TRANSMISSION_UTP_ENABLED || 'true').toLowerCase() === 'true';
      const portForwarding = (process.env.TRANSMISSION_PORT_FORWARDING_ENABLED || 'true').toLowerCase() === 'true';
      const cacheSizeMb = parseInt(process.env.TRANSMISSION_CACHE_SIZE_MB || '64', 10);

      const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
      const incompleteDir = path.resolve(process.env.INCOMPLETE_DIR || './data/transmission/incomplete');

      if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
      if (!fs.existsSync(incompleteDir)) fs.mkdirSync(incompleteDir, { recursive: true });

      const settings: TransmissionSessionConfig = {
        'peer-port': peerPort,
        'speed-limit-down-enabled': downloadLimit > 0,
        'speed-limit-down': downloadLimit,
        'speed-limit-up-enabled': uploadLimit > 0,
        'speed-limit-up': uploadLimit,
        'peer-limit-global': globalPeerLimit,
        'peer-limit-per-torrent': peerLimitPerTorrent,
        'dht-enabled': dhtEnabled,
        'pex-enabled': pexEnabled,
        'lpd-enabled': lpdEnabled,
        'utp-enabled': utpEnabled,
        'port-forwarding-enabled': portForwarding,
        'cache-size-mb': cacheSizeMb,
        'download-dir': downloadDir,
        'incomplete-dir': incompleteDir,
        'incomplete-dir-enabled': true
      };

      await this.setSession(settings);
      this.isConnected = true;
    } catch (err) {
      this.isConnected = false;
      // Do not crash if Transmission daemon is still spinning up
    }
  }

  public async addMagnet(magnet: string, downloadDir?: string): Promise<{ infoHash: string; id?: number; name?: string }> {
    if (!magnet || !magnet.startsWith('magnet:')) {
      throw new Error('Invalid magnet URI');
    }
    const dir = downloadDir || path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
    const result = await this.client.addUrl(magnet, { 'download-dir': dir });
    const added = result['torrent-added'] || result['torrent-duplicate'];
    if (!added) {
      throw new Error('Transmission failed to add magnet');
    }
    return {
      infoHash: added.hashString,
      id: added.id,
      name: added.name
    };
  }

  public async addFile(base64Buffer: string, downloadDir?: string): Promise<{ infoHash: string; id?: number; name?: string }> {
    const dir = downloadDir || path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
    const result = await this.client.addBase64(base64Buffer, { 'download-dir': dir });
    const added = result['torrent-added'] || result['torrent-duplicate'];
    if (!added) {
      throw new Error('Transmission failed to add torrent file');
    }
    return {
      infoHash: added.hashString,
      id: added.id,
      name: added.name
    };
  }

  public async list(fields?: string[]): Promise<TransmissionTorrentRaw[]> {
    const defaultFields = [
      'id', 'hashString', 'name', 'status', 'percentDone',
      'rateDownload', 'rateUpload', 'peersConnected', 'peersSendingToUs',
      'peersGettingFromUs', 'sizeWhenDone', 'totalSize', 'haveValid',
      'haveUnchecked', 'uploadedEver', 'corruptEver', 'desiredAvailable',
      'uploadRatio', 'eta', 'files', 'downloadDir', 'error', 'errorString'
    ];
    const queryFields = fields || defaultFields;
    const res = await this.client.get(false, queryFields);
    return res.torrents || [];
  }

  public async get(idOrHash: number | string, fields?: string[]): Promise<TransmissionTorrentRaw | null> {
    const torrents = await this.list(fields);
    const found = torrents.find(t => {
      if (typeof idOrHash === 'number') {
        return t.id === idOrHash;
      }
      return t.hashString.toLowerCase() === idOrHash.toLowerCase();
    });
    return found || null;
  }

  public async pause(idOrHash: number | string): Promise<void> {
    const id = await this.resolveId(idOrHash);
    await this.client.stop(id);
  }

  public async resume(idOrHash: number | string): Promise<void> {
    const id = await this.resolveId(idOrHash);
    await this.client.start(id);
  }

  public async remove(idOrHash: number | string, deleteLocalData = false): Promise<void> {
    const id = await this.resolveId(idOrHash);
    await this.client.remove(id, deleteLocalData);
  }

  public async getSession(): Promise<any> {
    return this.client.sessionGet();
  }

  public async setSession(settings: TransmissionSessionConfig): Promise<any> {
    return this.client.sessionSet(settings);
  }

  public async getSessionStats(): Promise<any> {
    return this.client.sessionStats();
  }

  public async testPort(): Promise<boolean> {
    try {
      const res = await this.client.portTest();
      return res['port-is-open'] === true;
    } catch {
      return false;
    }
  }

  private async resolveId(idOrHash: number | string): Promise<number> {
    if (typeof idOrHash === 'number') return idOrHash;
    const t = await this.get(idOrHash, ['id', 'hashString']);
    if (!t) {
      throw new Error(`Torrent with hash ${idOrHash} not found in Transmission`);
    }
    return t.id;
  }
}

export const defaultTransmissionService = new TransmissionService();
