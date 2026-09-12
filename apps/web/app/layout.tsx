import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Torrent Downloader - High Performance Engine',
  description: 'High performance local Windows torrent platform powered by Transmission and Next.js',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-gray-100 antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
