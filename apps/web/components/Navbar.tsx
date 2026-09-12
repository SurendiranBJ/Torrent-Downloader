'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Plus, LogOut, HardDrive } from 'lucide-react';
import { removeStoredToken } from '../lib/api';

interface NavbarProps {
  userEmail?: string;
  onOpenAddModal: () => void;
  onOpenDiagnostics: () => void;
}

export function Navbar({ userEmail, onOpenAddModal, onOpenDiagnostics }: NavbarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    removeStoredToken();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-gray-800 bg-[#090d16]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-lg shadow-indigo-500/20">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold tracking-tight text-white">Torrent Downloader</span>
              <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
                Transmission Pro
              </span>
            </div>
            <p className="text-xs text-gray-400">Local High-Speed Torrent Platform</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenDiagnostics}
            className="flex items-center space-x-2 rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2 text-xs font-medium text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-700 hover:text-white"
          >
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="hidden sm:inline">Diagnostics</span>
          </button>

          <button
            onClick={onOpenAddModal}
            className="flex items-center space-x-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition-all hover:bg-indigo-500 hover:shadow-indigo-500/40"
          >
            <Plus className="h-4 w-4" />
            <span>Add Torrent</span>
          </button>

          {userEmail && (
            <div className="hidden items-center space-x-2 border-l border-gray-800 pl-3 md:flex">
              <div className="h-8 w-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-300 border border-gray-700">
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs text-gray-400 max-w-[120px] truncate">{userEmail}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            title="Log Out"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
