'use client';

import React, { useState } from 'react';
import {
  Play,
  Pause,
  Trash2,
  Download,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  Users,
  Radio,
  ExternalLink,
  ShieldCheck,
  CloudUpload
} from 'lucide-react';
import { TorrentInfo, TorrentStatus } from '@torrent-platform/shared';
import { formatBytes, formatSpeed, formatEta } from '../lib/utils';
import { apiRequest } from '../lib/api';

interface TorrentCardProps {
  torrent: TorrentInfo;
  onRefresh: () => void;
}

export function TorrentCard({ torrent, onRefresh }: TorrentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const getStatusBadge = (status: TorrentStatus) => {
    switch (status) {
      case 'downloading':
        return (
          <span className="flex items-center space-x-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
            <span>Downloading</span>
          </span>
        );
      case 'seeding':
        return (
          <span className="flex items-center space-x-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Seeding</span>
          </span>
        );
      case 'uploading':
        return (
          <span className="flex items-center space-x-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            <CloudUpload className="h-3 w-3 animate-pulse" />
            <span>Uploading to Storage</span>
          </span>
        );
      case 'ready':
        return (
          <span className="flex items-center space-x-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
            <ShieldCheck className="h-3 w-3" />
            <span>Ready (Cloud S3)</span>
          </span>
        );
      case 'completed':
        return (
          <span className="rounded-full bg-teal-500/10 border border-teal-500/30 px-2.5 py-0.5 text-xs font-semibold text-teal-400">
            Completed
          </span>
        );
      case 'paused':
        return (
          <span className="rounded-full bg-gray-500/10 border border-gray-500/30 px-2.5 py-0.5 text-xs font-semibold text-gray-400">
            Paused
          </span>
        );
      case 'checking':
        return (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
            Checking
          </span>
        );
      case 'error':
        return (
          <span className="rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-xs font-semibold text-rose-400">
            Error
          </span>
        );
      case 'queued':
      default:
        return (
          <span className="rounded-full bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 text-xs font-semibold text-blue-400">
            Queued
          </span>
        );
    }
  };

  const handlePauseResume = async () => {
    if (!torrent.id) return;
    try {
      setActionLoading(true);
      const endpoint = torrent.paused ? `/api/torrents/${torrent.id}/resume` : `/api/torrents/${torrent.id}/pause`;
      await apiRequest(endpoint, { method: 'POST' });
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (deleteFiles: boolean) => {
    if (!torrent.id) return;
    try {
      setActionLoading(true);
      await apiRequest(`/api/torrents/${torrent.id}?deleteFiles=${deleteFiles}`, {
        method: 'DELETE'
      });
      setConfirmDelete(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to remove torrent');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!torrent.id) return;
    try {
      const res = await apiRequest<{ downloadUrl: string; type: string }>(`/api/torrents/${torrent.id}/download`);
      if (res.downloadUrl) {
        if (res.type === 's3' || res.downloadUrl.startsWith('http')) {
          window.open(res.downloadUrl, '_blank');
        } else {
          // Local download through port 80 gateway
          window.open(res.downloadUrl, '_blank');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Download not available yet');
    }
  };

  const percent = Math.round(torrent.progress * 100);

  return (
    <div className="glass-card rounded-2xl p-5 shadow-lg transition-all hover:border-gray-700">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-bold text-white max-w-xl" title={torrent.name}>
              {torrent.name}
            </h3>
            {getStatusBadge(torrent.status)}
          </div>
          <p className="mt-1 font-mono text-[11px] text-gray-500 truncate" title={torrent.infoHash}>
            Hash: {torrent.infoHash}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Pause / Resume */}
          <button
            onClick={handlePauseResume}
            disabled={actionLoading || !torrent.id}
            className="flex items-center space-x-1.5 rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-1.5 text-xs font-semibold text-gray-200 transition-colors hover:bg-gray-700 disabled:opacity-50"
          >
            {torrent.paused ? (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                <span>Resume</span>
              </>
            ) : (
              <>
                <Pause className="h-3.5 w-3.5 text-amber-400" />
                <span>Pause</span>
              </>
            )}
          </button>

          {/* Download File Button (Available if completed, seeding, uploading, or ready) */}
          {(torrent.progress >= 1 || torrent.status === 'ready' || torrent.status === 'seeding') && (
            <button
              onClick={handleDownload}
              className="flex items-center space-x-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md hover:bg-emerald-500"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download File</span>
            </button>
          )}

          {/* Remove / Delete */}
          {confirmDelete ? (
            <div className="flex items-center space-x-1.5 rounded-lg bg-red-950/80 border border-red-800/80 p-1">
              <button
                onClick={() => handleDelete(false)}
                className="rounded px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-900/60"
              >
                Remove
              </button>
              <button
                onClick={() => handleDelete(true)}
                className="rounded px-2 py-1 text-[11px] font-bold text-red-400 hover:bg-red-900/90"
              >
                + Delete Files
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded px-1.5 py-1 text-[11px] text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400"
              title="Remove Torrent"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-white">{percent}%</span>
            <span>•</span>
            <span>
              {formatBytes(torrent.downloaded)} / {formatBytes(torrent.length)}
            </span>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="flex items-center text-emerald-400 font-medium">
              ↓ {formatSpeed(torrent.downloadSpeed)}
            </span>
            <span className="flex items-center text-indigo-400 font-medium">
              ↑ {formatSpeed(torrent.uploadSpeed)}
            </span>
          </div>
        </div>

        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full transition-all duration-300 ${
              percent >= 100
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : 'bg-gradient-to-r from-indigo-600 to-indigo-400'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-gray-800/80 pt-3 sm:grid-cols-4 text-xs text-gray-400">
        <div className="flex items-center space-x-1.5">
          <Users className="h-3.5 w-3.5 text-gray-500" />
          <span>Peers:</span>
          <span className="font-semibold text-gray-200">{torrent.numPeers}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Radio className="h-3.5 w-3.5 text-gray-500" />
          <span>Seeds:</span>
          <span className="font-semibold text-gray-200">{torrent.numSeeds}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-500" />
          <span>ETA:</span>
          <span className="font-semibold text-gray-200">{formatEta(torrent.eta)}</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
          <span>Uploaded:</span>
          <span className="font-semibold text-gray-200">{formatBytes(torrent.uploaded)}</span>
        </div>
      </div>

      {/* Expandable Files List */}
      {torrent.files && torrent.files.length > 0 && (
        <div className="mt-3 border-t border-gray-800/60 pt-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center space-x-1 text-xs font-medium text-gray-400 hover:text-white"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{torrent.files.length} {torrent.files.length === 1 ? 'file' : 'files'} in payload</span>
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5 rounded-xl bg-gray-900/60 p-3 text-xs">
              {torrent.files.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between text-gray-300">
                  <div className="flex items-center space-x-2 truncate max-w-md">
                    <FileText className="h-3.5 w-3.5 text-gray-500 flex-shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </div>
                  <span className="text-gray-500 font-mono text-[11px]">{formatBytes(file.length)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
