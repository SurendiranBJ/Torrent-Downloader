export type TorrentStatus =
  | "queued"
  | "downloading"
  | "completed"
  | "seeding"
  | "uploading"
  | "ready"
  | "paused"
  | "error"
  | "checking";

export interface TorrentFile {
  name: string;
  length: number;
  path: string;
  bytesCompleted?: number;
}

export interface TorrentInfo {
  infoHash: string;
  name: string;
  status: TorrentStatus;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  numSeeds: number;
  length: number;
  downloaded: number;
  uploaded: number;
  uploadedEver: number;
  corruptEver: number;
  desiredAvailable: number;
  uploadRatio: number;
  eta: number;
  files: TorrentFile[];
  paused: boolean;
  id?: string;
  userId?: string;
  storageKey?: string;
  downloadUrl?: string;
  urlExpiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface AddTorrentPayload {
  magnet?: string;
  downloadDir?: string;
}

export interface ProgressEvent {
  infoHash: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  numSeeds: number;
  eta: number;
  status: TorrentStatus;
}

export interface TransmissionSessionStats {
  activeTorrentCount: number;
  downloadSpeed: number;
  uploadSpeed: number;
  pausedTorrentCount: number;
  torrentCount: number;
  cumulativeStats?: {
    uploadedBytes: number;
    downloadedBytes: number;
    filesAdded: number;
    secondsActive: number;
  };
}

export type BottleneckType =
  | "NETWORK LIMITED"
  | "PEER CONNECTIVITY LIMITED"
  | "TORRENT SWARM LIMITED"
  | "TRANSMISSION LIMITED"
  | "DISK LIMITED"
  | "STORAGE UPLOAD LIMITED"
  | "UNKNOWN";

export interface DiagnosticsInfo {
  transmissionRpcStatus: "CONNECTED" | "DISCONNECTED" | "ERROR";
  transmissionVersion: string;
  peerPort: number;
  peerPortTestResult: "OPEN" | "CLOSED" | "UNKNOWN";
  dhtStatus: boolean;
  pexStatus: boolean;
  lpdStatus: boolean;
  utpStatus: boolean;
  globalPeerLimit: number;
  perTorrentPeerLimit: number;
  downloadLimit: number;
  uploadLimit: number;
  activePeerCount: number;
  activeSeedCount: number;
  downloadDirectory: string;
  incompleteDirectory: string;
  freeDiskSpaceBytes: number;
  warnings: string[];
  bottleneckAnalysis: BottleneckType;
}

export interface PerformanceMetric {
  timestamp: number;
  torrentId?: string;
  infoHash: string;
  name: string;
  percentDone: number;
  rateDownload: number;
  rateUpload: number;
  peersConnected: number;
  peersSendingToUs: number;
  seeds: number;
  eta: number;
  desiredAvailable: number;
  uploadedEver: number;
  corruptEver: number;
}
