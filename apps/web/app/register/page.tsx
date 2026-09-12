'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HardDrive, AlertCircle, Loader2 } from 'lucide-react';
import { apiRequest, setStoredToken } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const res = await apiRequest<{ user: any; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, name })
      });

      if (res.token) {
        setStoredToken(res.token);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(res.user));
        }
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed. Try a different email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-gray-800 bg-[#111827] p-8 shadow-2xl">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <HardDrive className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">Create Account</h2>
          <p className="mt-1 text-xs text-gray-400">Initialize your personal torrent workspace</p>
        </div>

        {error && (
          <div className="flex items-center space-x-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-300">Name (Optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900/60 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900/60 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900/60 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300">Confirm Password</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1.5 w-full rounded-xl border border-gray-700 bg-gray-900/60 px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center space-x-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>Register & Start</span>
          </button>
        </form>

        <div className="text-center text-xs text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-indigo-400 hover:text-indigo-300">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
