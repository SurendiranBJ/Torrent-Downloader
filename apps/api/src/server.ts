import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import authRoutes from './routes/auth';
import torrentRoutes from './routes/torrents';
import { defaultTransmissionService } from './services/TransmissionService';
import { defaultTorrentCache } from './cache/torrentCache';
import { setupTorrentSocket } from './sockets/torrentSocket';
import { defaultStorageWorker } from './workers/storageWorker';
import { PerformanceLogger } from './services/performanceLogger';

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT || process.env.API_PORT || '4000', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

// Setup CORS
app.use(
  cors({
    origin: [CLIENT_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: [CLIENT_ORIGIN, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
  }
});

setupTorrentSocket(io, defaultTorrentCache);

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/torrents', torrentRoutes);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// Serve local download folder if configured statically
const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || './data/transmission/downloads');
app.use('/downloads', express.static(downloadDir));

// Initialize Performance Logger
const perfInterval = parseInt(process.env.PERFORMANCE_LOG_INTERVAL_SECONDS || '5', 10);
const perfLogger = new PerformanceLogger(defaultTorrentCache, perfInterval);

// Bootstrap services & start server
async function bootstrap() {
  console.log('');
  console.log('========================================================');
  console.log('       TORRENT DOWNLOADER API SERVER STARTING          ');
  console.log('           (Local Windows Architecture)                ');
  console.log('========================================================');
  console.log(`Port:           ${PORT}`);
  console.log(`Client Origin:  ${CLIENT_ORIGIN}`);
  console.log(`Downloads Dir:  ${downloadDir}`);
  console.log('');

  // 1. Initialize Transmission RPC & Settings
  try {
    await defaultTransmissionService.initializeConfig();
    console.log('Transmission daemon configured and connected.');
  } catch (err: any) {
    console.warn(`Transmission initial connection warning: ${err.message}. Will retry on background loop.`);
  }

  // 2. Start cache polling
  defaultTorrentCache.start();
  console.log('Torrent status cache polling active (2s interval).');

  // 3. Start BullMQ Storage Worker
  try {
    defaultStorageWorker.start();
    console.log('BullMQ Storage Worker started.');
  } catch (err: any) {
    console.warn('BullMQ Storage Worker warning:', err.message);
  }

  // 4. Start Performance Logger
  perfLogger.start();

  server.listen(PORT, () => {
    console.log(`API Server listening on http://localhost:${PORT}`);
    console.log('========================================================');
    console.log('');
  });
}

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  defaultTorrentCache.stop();
  perfLogger.stop();
  await defaultStorageWorker.close();
  server.close(() => {
    console.log('Server stopped');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
  });
}

export { app, server };
