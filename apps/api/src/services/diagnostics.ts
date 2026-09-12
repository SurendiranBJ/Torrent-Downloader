import fs from 'fs';
import path from 'path';
import { DiagnosticsInfo, BottleneckType } from '@torrent-platform/shared';
import { TransmissionService, defaultTransmissionService } from './TransmissionService';
import { TorrentCache, defaultTorrentCache } from '../cache/torrentCache';

export async function gatherDiagnostics(
  transmission: TransmissionService = defaultTransmissionService,
  cache: TorrentCache = defaultTorrentCache
): Promise<DiagnosticsInfo> {
  const warnings: string[] = [];
  let rpcStatus: "CONNECTED" | "DISCONNECTED" | "ERROR" = "DISCONNECTED";
  let version = "Unknown";
  let peerPort = parseInt(process.env.TRANSMISSION_PEER_PORT || '51413', 10);
  let portResult: "OPEN" | "CLOSED" | "UNKNOWN" = "UNKNOWN";
  let dht = false;
  let pex = false;
  let lpd = false;
  let utp = false;
  let globalPeerLimit = 500;
  let perTorrentLimit = 100;
  let downLimit = 0;
  let upLimit = 0;
  let downloadDir = path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
  let incompleteDir = path.resolve(process.env.INCOMPLETE_DIR || './data/transmission/incomplete');
  let freeSpaceBytes = 0;

  try {
    const session = await transmission.getSession();
    rpcStatus = "CONNECTED";
    version = session.version || "Transmission Daemon";
    peerPort = session['peer-port'] || peerPort;
    dht = !!session['dht-enabled'];
    pex = !!session['pex-enabled'];
    lpd = !!session['lpd-enabled'];
    utp = !!session['utp-enabled'];
    globalPeerLimit = session['peer-limit-global'] || globalPeerLimit;
    perTorrentLimit = session['peer-limit-per-torrent'] || perTorrentLimit;
    downLimit = session['speed-limit-down-enabled'] ? session['speed-limit-down'] : 0;
    upLimit = session['speed-limit-up-enabled'] ? session['speed-limit-up'] : 0;
    downloadDir = session['download-dir'] || downloadDir;
    incompleteDir = session['incomplete-dir'] || incompleteDir;

    // Check port
    try {
      const isOpen = await transmission.testPort();
      portResult = isOpen ? "OPEN" : "CLOSED";
      if (!isOpen) {
        warnings.push("Peer port " + peerPort + " is CLOSED to incoming connections. Speed may be limited by NAT/Firewall.");
      }
    } catch {
      portResult = "UNKNOWN";
      warnings.push("Could not test peer port reachability.");
    }
  } catch (err: any) {
    rpcStatus = "ERROR";
    warnings.push("Transmission RPC is unreachable: " + err.message);
  }

  if (downLimit > 0) {
    warnings.push("Download speed limit is actively throttled to " + downLimit + " KB/s.");
  }
  if (upLimit > 0) {
    warnings.push("Upload speed limit is actively throttled to " + upLimit + " KB/s.");
  }

  // Check disk space using statfs if available or fallback
  try {
    if (fs.statfsSync) {
      const stats = fs.statfsSync(downloadDir);
      freeSpaceBytes = Number(stats.bavail) * Number(stats.bsize);
      if (freeSpaceBytes < 2 * 1024 * 1024 * 1024) { // Less than 2 GB
        warnings.push("Low disk space on download partition: less than 2 GB available.");
      }
    }
  } catch {}

  const rawList = cache.getRawList();
  let activePeers = 0;
  let activeSeeds = 0;
  let totalDownSpeed = 0;
  let totalDesiredAvail = 0;

  for (const t of rawList) {
    activePeers += t.peersConnected || 0;
    activeSeeds += t.peersSendingToUs || 0;
    totalDownSpeed += t.rateDownload || 0;
    totalDesiredAvail += t.desiredAvailable || 0;
  }

  // Bottleneck Analysis
  let bottleneck: BottleneckType = "UNKNOWN";
  if (rpcStatus !== "CONNECTED") {
    bottleneck = "TRANSMISSION LIMITED";
  } else if (rawList.length > 0 && activeSeeds === 0 && activePeers === 0) {
    bottleneck = "TORRENT SWARM LIMITED";
  } else if (portResult === "CLOSED" && totalDownSpeed < 500 * 1024 && activePeers < 5) {
    bottleneck = "PEER CONNECTIVITY LIMITED";
  } else if (downLimit > 0 && totalDownSpeed >= downLimit * 1000 * 0.9) {
    bottleneck = "TRANSMISSION LIMITED";
  } else if (freeSpaceBytes > 0 && freeSpaceBytes < 100 * 1024 * 1024) {
    bottleneck = "DISK LIMITED";
  } else if (totalDownSpeed > 5 * 1024 * 1024) {
    bottleneck = "NETWORK LIMITED";
  }

  return {
    transmissionRpcStatus: rpcStatus,
    transmissionVersion: version,
    peerPort,
    peerPortTestResult: portResult,
    dhtStatus: dht,
    pexStatus: pex,
    lpdStatus: lpd,
    utpStatus: utp,
    globalPeerLimit,
    perTorrentPeerLimit: perTorrentLimit,
    downloadLimit: downLimit,
    uploadLimit: upLimit,
    activePeerCount: activePeers,
    activeSeedCount: activeSeeds,
    downloadDirectory: downloadDir,
    incompleteDirectory: incompleteDir,
    freeDiskSpaceBytes: freeSpaceBytes,
    warnings,
    bottleneckAnalysis: bottleneck
  };
}
