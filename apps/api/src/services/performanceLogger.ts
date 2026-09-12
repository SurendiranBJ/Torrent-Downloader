import { TorrentCache } from '../cache/torrentCache';
import { PerformanceMetric } from '@torrent-platform/shared';

export class PerformanceLogger {
  private cache: TorrentCache;
  private timer: NodeJS.Timeout | null = null;
  private intervalSeconds: number;

  constructor(cache: TorrentCache, intervalSeconds = 5) {
    this.cache = cache;
    this.intervalSeconds = intervalSeconds;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.logMetrics();
    }, this.intervalSeconds * 1000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public logMetrics(): void {
    const rawTorrents = this.cache.getRawList();
    if (!rawTorrents || rawTorrents.length === 0) return;

    // Only log if there are active torrents
    const active = rawTorrents.filter((t) => t.rateDownload > 0 || t.rateUpload > 0 || t.status === 4 || t.status === 6);
    if (active.length === 0) return;

    for (const t of active) {
      const metric: PerformanceMetric = {
        timestamp: Date.now(),
        infoHash: t.hashString,
        name: t.name,
        percentDone: Number((t.percentDone * 100).toFixed(2)),
        rateDownload: t.rateDownload || 0,
        rateUpload: t.rateUpload || 0,
        peersConnected: t.peersConnected || 0,
        peersSendingToUs: t.peersSendingToUs || 0,
        seeds: t.peersSendingToUs || 0,
        eta: t.eta >= 0 ? t.eta : -1,
        desiredAvailable: t.desiredAvailable || 0,
        uploadedEver: t.uploadedEver || 0,
        corruptEver: t.corruptEver || 0
      };

      console.log(`[PERF_METRIC] ${JSON.stringify(metric)}`);
    }
  }
}
