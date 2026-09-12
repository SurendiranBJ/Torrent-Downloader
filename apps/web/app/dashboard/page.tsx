'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  HardDrive,
  CheckCircle,
  Activity,
  Layers,
  Search,
  Filter,
  RefreshCw
} from 'lucide-react';
import { TorrentInfo, TorrentStatus } from '@torrent-platform/shared';
import { Navbar } from '../../components/Navbar';
import { TorrentCard } from '../../components/TorrentCard';
import { AddTorrentModal } from '../../components/AddTorrentModal';
import { DiagnosticsModal } from '../../components/DiagnosticsModal';
import { apiRequest } from '../../lib/api';
import { getSocket, disconnectSocket } from '../../lib/socket';
import { formatSpeed } from '../../lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const [torrents, setTorrents] = useState<TorrentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch torrents from REST API
  const fetchTorrents = useCallback(async () => {
    try {
      const data = await apiRequest<TorrentInfo[]>('/api/torrents');
      setTorrents(data);
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('Authentication')) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        setUserEmail(u.email || '');
      } catch {}
    }

    fetchTorrents();

    // Setup Socket.IO listener for live sync
    const socket = getSocket();
    if (socket) {
      socket.on('torrents-list', (updatedTorrents: TorrentInfo[]) => {
        setTorrents(updatedTorrents);
      });
    }

    return () => {
      const s = getSocket();
      if (s) {
        s.off('torrents-list');
      }
    };
  }, [fetchTorrents, router]);

  // Aggregate Metrics Calculations
  let totalDownSpeed = 0;
  let totalUpSpeed = 0;
  let activeCount = 0;
  let completedCount = 0;

  for (const t of torrents) {
    totalDownSpeed += t.downloadSpeed || 0;
    totalUpSpeed += t.uploadSpeed || 0;
    if (t.status === 'downloading' || t.status === 'seeding' || t.status === 'uploading') {
      activeCount++;
    }
    if (t.progress >= 1 || t.status === 'completed' || t.status === 'ready' || t.status === 'seeding') {
      completedCount++;
    }
  }

  // Filtered List
  const filteredTorrents = torrents.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.infoHash.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        userEmail={userEmail}
        onOpenAddModal={() => setIsAddOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
        {/* Aggregate Stats Bar */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
              <ArrowDownCircle className="h-4 w-4 text-emerald-400" />
              <span>Total Download</span>
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {formatSpeed(totalDownSpeed)}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">Live aggregated throughput</p>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
              <ArrowUpCircle className="h-4 w-4 text-indigo-400" />
              <span>Total Upload</span>
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {formatSpeed(totalUpSpeed)}
            </div>
            <p className="mt-0.5 text-[11px] text-gray-500">Live seeding & piece exchange</p>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
              <Activity className="h-4 w-4 text-amber-400" />
              <span>Active Transfers</span>
            </div>
            <div className="mt-2 text-2xl font-black text-white">{activeCount}</div>
            <p className="mt-0.5 text-[11px] text-gray-500">Downloading & seeding</p>
          </div>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-xs font-semibold text-gray-400">
              <CheckCircle className="h-4 w-4 text-teal-400" />
              <span>Completed</span>
            </div>
            <div className="mt-2 text-2xl font-black text-white">{completedCount}</div>
            <p className="mt-0.5 text-[11px] text-gray-500">Payloads ready for use</p>
          </div>
        </div>

        {/* Toolbar & Filter Tabs */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-gray-900/60 p-1 border border-gray-800">
            {[
              { id: 'all', label: 'All' },
              { id: 'downloading', label: 'Downloading' },
              { id: 'completed', label: 'Completed' },
              { id: 'seeding', label: 'Seeding' },
              { id: 'paused', label: 'Paused' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  filterStatus === tab.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search torrents or hash..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-gray-900/60 py-2 pl-9 pr-3 text-xs text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <button
              onClick={fetchTorrents}
              title="Refresh"
              className="rounded-xl border border-gray-800 bg-gray-900/60 p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Torrents List */}
        {loading ? (
          <div className="py-20 text-center text-xs text-gray-500">Loading torrent cockpit...</div>
        ) : filteredTorrents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-800 py-16 text-center">
            <Layers className="mx-auto h-10 w-10 text-gray-600" />
            <h3 className="mt-3 text-sm font-bold text-gray-300">No torrents in this view</h3>
            <p className="mt-1 text-xs text-gray-500">
              Click "Add Torrent" to add a magnet URI or upload a .torrent file.
            </p>
            <button
              onClick={() => setIsAddOpen(true)}
              className="mt-4 inline-flex items-center space-x-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500"
            >
              Add Your First Torrent
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTorrents.map((torrent) => (
              <TorrentCard
                key={torrent.id || torrent.infoHash}
                torrent={torrent}
                onRefresh={fetchTorrents}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      <AddTorrentModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onSuccess={fetchTorrents}
      />

      <DiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
      />
    </div>
  );
}
