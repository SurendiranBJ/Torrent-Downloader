'use client';

import React, { useState } from 'react';
import { X, Link2, Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface AddTorrentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddTorrentModal({ isOpen, onClose, onSuccess }: AddTorrentModalProps) {
  const [tab, setTab] = useState<'magnet' | 'file'>('magnet');
  const [magnetUrl, setMagnetUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleMagnetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmed = magnetUrl.trim();
    if (!trimmed) {
      setError('Please paste a magnet link.');
      return;
    }
    if (!trimmed.startsWith('magnet:?')) {
      setError('Invalid magnet format. It must start with "magnet:?".');
      return;
    }

    try {
      setLoading(true);
      await apiRequest('/api/torrents/magnet', {
        method: 'POST',
        body: JSON.stringify({ magnet: trimmed })
      });
      setSuccessMsg('Magnet link successfully added to Transmission!');
      setMagnetUrl('');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to add magnet link.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setError('Please select a .torrent file.');
      return;
    }
    if (!selectedFile.name.endsWith('.torrent')) {
      setError('Selected file must have a .torrent extension.');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('torrentFile', selectedFile);

      await apiRequest('/api/torrents/upload', {
        method: 'POST',
        body: formData
      });
      setSuccessMsg('Torrent file uploaded and added to Transmission!');
      setSelectedFile(null);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to upload torrent file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-gray-800 bg-[#111827] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-white">Add New Torrent</h2>
        <p className="mt-1 text-xs text-gray-400">
          Engineered to download through Transmission with maximum swarm throughput.
        </p>

        {/* Tab selector */}
        <div className="mt-5 flex rounded-xl bg-gray-900/80 p-1 border border-gray-800">
          <button
            type="button"
            onClick={() => { setTab('magnet'); setError(null); }}
            className={`flex flex-1 items-center justify-center space-x-2 rounded-lg py-2 text-xs font-semibold transition-all ${
              tab === 'magnet' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Link2 className="h-4 w-4" />
            <span>Magnet URI</span>
          </button>
          <button
            type="button"
            onClick={() => { setTab('file'); setError(null); }}
            className={`flex flex-1 items-center justify-center space-x-2 rounded-lg py-2 text-xs font-semibold transition-all ${
              tab === 'file' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Upload className="h-4 w-4" />
            <span>.torrent File</span>
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 flex items-center space-x-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {tab === 'magnet' ? (
          <form onSubmit={handleMagnetSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300">Magnet Link</label>
              <textarea
                rows={3}
                value={magnetUrl}
                onChange={(e) => setMagnetUrl(e.target.value)}
                placeholder="magnet:?xt=urn:btih:..."
                className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900/60 p-3 text-xs font-mono text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !magnetUrl.trim()}
                className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Add Magnet</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleFileSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-300">Upload Torrent</label>
              <div className="mt-1.5 flex justify-center rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/40 px-6 py-8 text-center transition-colors hover:border-gray-600">
                <div className="space-y-2">
                  <Upload className="mx-auto h-8 w-8 text-gray-400" />
                  <div className="text-xs text-gray-400">
                    <label className="relative cursor-pointer rounded-md font-medium text-indigo-400 focus-within:outline-none hover:text-indigo-300">
                      <span>Choose a file</span>
                      <input
                        type="file"
                        accept=".torrent"
                        className="sr-only"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="pl-1">or drag and drop</span>
                  </div>
                  {selectedFile ? (
                    <p className="text-xs font-semibold text-emerald-400">{selectedFile.name}</p>
                  ) : (
                    <p className="text-[10px] text-gray-500">.torrent files up to 50MB</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-700 px-4 py-2 text-xs font-medium text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !selectedFile}
                className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>Upload & Download</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
