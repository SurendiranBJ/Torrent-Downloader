'use client';

import React, { useState, useEffect } from 'react';
import { X, RefreshCw, AlertTriangle, ShieldCheck, ShieldAlert, Cpu, Network, HardDrive, CheckCircle2 } from 'lucide-react';
import { DiagnosticsInfo } from '@torrent-platform/shared';
import { apiRequest } from '../lib/api';
import { formatBytes } from '../lib/utils';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DiagnosticsModal({ isOpen, onClose }: DiagnosticsModalProps) {
  const [data, setData] = useState<DiagnosticsInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagnostics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<DiagnosticsInfo>('/api/torrents/diagnostics');
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch diagnostics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-800 bg-[#111827] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center space-x-2">
              <Cpu className="h-5 w-5 text-indigo-400" />
              <span>Engine Diagnostics & Swarm Health</span>
            </h2>
            <p className="text-xs text-gray-400">
              Live inspection of Transmission RPC, port reachability, and network limits.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center space-x-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {data ? (
          <div className="mt-6 space-y-6">
            {/* Bottleneck Analysis Banner */}
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/30 p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                Primary Throughput Bottleneck
              </span>
              <div className="mt-1 flex items-center justify-between">
                <div className="text-lg font-bold text-white tracking-wide">
                  {data.bottleneckAnalysis}
                </div>
                <span className="rounded-full bg-indigo-500/10 border border-indigo-500/30 px-3 py-0.5 text-xs text-indigo-300">
                  Real-time heuristic
                </span>
              </div>
            </div>

            {/* Warnings list */}
            {data.warnings && data.warnings.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-amber-400 flex items-center space-x-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Performance Advisories</span>
                </span>
                <div className="space-y-1.5">
                  {data.warnings.map((w, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
                    >
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Diagnostics Grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Transmission Engine */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
                  <Cpu className="h-4 w-4 text-indigo-400" />
                  <span>Daemon Engine</span>
                </div>
                <div className="mt-2 text-sm font-bold text-white">{data.transmissionVersion}</div>
                <div className="mt-1 flex items-center space-x-1.5 text-xs">
                  <span className="text-gray-400">Status:</span>
                  <span
                    className={`font-semibold ${
                      data.transmissionRpcStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {data.transmissionRpcStatus}
                  </span>
                </div>
              </div>

              {/* Peer Port */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
                  <Network className="h-4 w-4 text-emerald-400" />
                  <span>Peer Port (TCP/UDP)</span>
                </div>
                <div className="mt-2 text-sm font-bold text-white">Port {data.peerPort}</div>
                <div className="mt-1 flex items-center space-x-1.5 text-xs">
                  <span className="text-gray-400">External Test:</span>
                  {data.peerPortTestResult === 'OPEN' ? (
                    <span className="flex items-center text-emerald-400 font-semibold space-x-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>OPEN</span>
                    </span>
                  ) : data.peerPortTestResult === 'CLOSED' ? (
                    <span className="flex items-center text-rose-400 font-semibold space-x-1">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>CLOSED</span>
                    </span>
                  ) : (
                    <span className="text-gray-400 font-semibold">UNKNOWN</span>
                  )}
                </div>
              </div>

              {/* Disk Space */}
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
                  <HardDrive className="h-4 w-4 text-cyan-400" />
                  <span>Storage Partition</span>
                </div>
                <div className="mt-2 text-sm font-bold text-white">
                  {data.freeDiskSpaceBytes > 0 ? formatBytes(data.freeDiskSpaceBytes) : 'Available'}
                </div>
                <div className="mt-1 text-xs text-gray-400 truncate" title={data.downloadDirectory}>
                  {data.downloadDirectory}
                </div>
              </div>
            </div>

            {/* Protocol capabilities */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <span className="text-xs font-semibold text-gray-300">Swarm Protocol Discovery</span>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="flex items-center space-x-2 text-xs">
                  <CheckCircle2 className={`h-4 w-4 ${data.dhtStatus ? 'text-emerald-400' : 'text-gray-600'}`} />
                  <span className={data.dhtStatus ? 'text-gray-200' : 'text-gray-500'}>DHT Trackerless</span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <CheckCircle2 className={`h-4 w-4 ${data.pexStatus ? 'text-emerald-400' : 'text-gray-600'}`} />
                  <span className={data.pexStatus ? 'text-gray-200' : 'text-gray-500'}>Peer Exchange (PEX)</span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <CheckCircle2 className={`h-4 w-4 ${data.lpdStatus ? 'text-emerald-400' : 'text-gray-600'}`} />
                  <span className={data.lpdStatus ? 'text-gray-200' : 'text-gray-500'}>Local Peer Discovery</span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <CheckCircle2 className={`h-4 w-4 ${data.utpStatus ? 'text-emerald-400' : 'text-gray-600'}`} />
                  <span className={data.utpStatus ? 'text-gray-200' : 'text-gray-500'}>Micro Transport (uTP)</span>
                </div>
              </div>
            </div>

            {/* Configured limits */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-4 text-xs text-gray-400 space-y-2">
              <div className="flex justify-between">
                <span>Global Peer Limit:</span>
                <span className="text-white font-medium">{data.globalPeerLimit}</span>
              </div>
              <div className="flex justify-between">
                <span>Per-Torrent Peer Limit:</span>
                <span className="text-white font-medium">{data.perTorrentPeerLimit}</span>
              </div>
              <div className="flex justify-between">
                <span>Download Limit:</span>
                <span className="text-white font-medium">{data.downloadLimit === 0 ? 'Unlimited' : `${data.downloadLimit} KB/s`}</span>
              </div>
              <div className="flex justify-between">
                <span>Upload Limit:</span>
                <span className="text-white font-medium">{data.uploadLimit === 0 ? 'Unlimited' : `${data.uploadLimit} KB/s`}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-gray-500">Loading diagnostics data...</div>
        )}
      </div>
    </div>
  );
}
