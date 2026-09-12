'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HardDrive, ArrowRight, ShieldCheck, Zap, Activity } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col justify-between">
      {/* Navbar */}
      <header className="border-b border-gray-800/80 px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-lg shadow-indigo-500/20">
              <HardDrive className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Torrent Downloader</span>
          </div>
          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="rounded-xl border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-indigo-500"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto flex max-w-5xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="inline-flex items-center space-x-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-400">
          <Zap className="h-3.5 w-3.5" />
          <span>Local Windows Architecture • Transmission Engine</span>
        </div>

        <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
          High-Performance Local <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-emerald-400 bg-clip-text text-transparent">
            Torrent Download Cockpit
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-gray-400 sm:text-base">
          Engineered for Windows 10/11 with Docker and WSL2. Unleash uncapped peer-to-peer speeds via Transmission RPC, automated BullMQ object storage offloading, and isolated multi-tenant workspaces.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
          >
            <span>Open Dashboard</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/register"
            className="flex items-center space-x-2 rounded-xl border border-gray-700 bg-gray-900/60 px-6 py-3 text-sm font-semibold text-gray-300 hover:bg-gray-800 hover:text-white"
          >
            <span>Create Account</span>
          </Link>
        </div>

        {/* Feature Highlights */}
        <div className="mt-16 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <div className="glass-card rounded-2xl p-5">
            <Activity className="h-5 w-5 text-indigo-400" />
            <h3 className="mt-3 text-sm font-bold text-white">Full Swarm Throughput</h3>
            <p className="mt-1 text-xs text-gray-400">
              Unthrottled download and upload bandwidth directly through Transmission daemon with DHT and PEX.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h3 className="mt-3 text-sm font-bold text-white">Multi-Tenant Isolation</h3>
            <p className="mt-1 text-xs text-gray-400">
              PostgreSQL + Prisma user authentication with isolated rooms in Socket.IO for private tracking.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-5">
            <HardDrive className="h-5 w-5 text-cyan-400" />
            <h3 className="mt-3 text-sm font-bold text-white">NVMe to S3 Offloading</h3>
            <p className="mt-1 text-xs text-gray-400">
              Immediate local completed file download, coupled with BullMQ background sync to MinIO/S3.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800/60 py-6 text-center text-xs text-gray-500">
        Torrent Downloader Platform • Windows Local Architecture
      </footer>
    </div>
  );
}
