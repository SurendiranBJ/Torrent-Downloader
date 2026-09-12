import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import httpProxy from 'http-proxy';
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

const PORT = parseInt(process.env.PORT || '80', 10);
const WEB_URL = process.env.WEB_URL || process.env.INTERNAL_WEB_URL || 'http://web:3000';

// Validate Production Secrets
if (process.env.NODE_ENV === 'production') {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.includes('replace-in-production') || jwtSecret.length < 32) {
    console.warn(
      '⚠️ [SECURITY WARNING] JWT_SECRET appears to be a default placeholder or shorter than 32 characters. Generate a secure random key for production!'
    );
  }
}

// Setup CORS for API requests
app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(cookieParser());

// Setup Socket.IO on the unified HTTP server (path: /socket.io/)
const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true
  }
});

setupTorrentSocket(io, defaultTorrentCache);

// API Routers need body parsers (JSON & URL-encoded)
const apiRouter = express.Router();
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({ extended: true }));
apiRouter.use('/auth', authRoutes);
apiRouter.use('/torrents', torrentRoutes);

// Mount API routes under /api
app.use('/api', apiRouter);

// Health check endpoint
app.get('/health', async (_req, res) => {
  let transmissionHealthy = false;
  try {
    const session = await defaultTransmissionService.getSession();
    transmissionHealthy = !!session;
  } catch {}

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    engine: {
      type: 'Transmission',
      connected: transmissionHealthy
    },
    storage: {
      provider: process.env.STORAGE_PROVIDER || 's3'
    }
  });
});

// Serve completed download files locally if requested directly
const downloadDir = path.resolve(process.env.DOWNLOAD_DIR || '/downloads');
app.use('/downloads', express.static(downloadDir));

// Initialize internal Reverse Proxy to forward Next.js Web Frontend requests
const proxy = httpProxy.createProxyServer({
  target: WEB_URL,
  ws: true,
  changeOrigin: true
});

proxy.on('error', (err, _req, res: any) => {
  console.warn(`[Gateway Proxy] Unable to connect to Next.js at ${WEB_URL}: ${err.message}`);
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(503, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Torrent Downloader Starting...</title></head>
        <body style="font-family:sans-serif;background:#090d16;color:#f3f4f6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:2rem;background:#111827;border-radius:1rem;border:1px solid #374151;">
            <h2>Web Application Initializing</h2>
            <p style="color:#9ca3af;font-size:0.875rem;">Next.js is starting up. Please refresh in a few seconds...</p>
          </div>
        </body>
      </html>
    `);
  }
});

// Forward all non-API / non-static routes directly to Next.js App Router
// This covers: /, /login, /register, /dashboard, /_next/*, etc.
app.use((req, res) => {
  proxy.web(req, res, { target: WEB_URL });
});

// Preserve WebSocket Upgrade Handling
// If path is /socket.io, Socket.IO handles it natively.
// If path is /_next (e.g. HMR) or any other WebSocket, forward to Next.js.
server.on('upgrade', (req, socket, head) => {
  if (req.url && req.url.startsWith('/socket.io')) {
    // Handled by Socket.IO
    return;
  }
  proxy.ws(req, socket, head, { target: WEB_URL });
});

// Initialize Performance Logger
const perfInterval = parseInt(process.env.PERFORMANCE_LOG_INTERVAL_SECONDS || '5', 10);
const perfLogger = new PerformanceLogger(defaultTorrentCache, perfInterval);

// Bootstrap services & start server
async function bootstrap() {
  console.log('');
  console.log('========================================================');
  console.log('      AWS EC2 TORRENT DOWNLOADER STARTED               ');
  console.log('          (Direct Port 80 Node Gateway)                 ');
  console.log('========================================================');
  console.log(`Public Port:     ${PORT}`);
  console.log(`Internal Web:    ${WEB_URL}`);
  console.log(`Downloads Dir:   ${downloadDir}`);
  console.log(`Storage Mode:    ${process.env.STORAGE_PROVIDER || 's3'}`);
  console.log('');

  // 1. Initialize Transmission RPC & Settings
  try {
    await defaultTransmissionService.initializeConfig();
    console.log('Transmission daemon configured and connected.');
  } catch (err: any) {
    console.warn(`Transmission initial connection warning: ${err.message}. Will retry on background loop.`);
  }

  // 2. Start cache polling (2s)
  defaultTorrentCache.start();
  console.log('Torrent status cache polling active.');

  // 3. Start BullMQ Storage Worker
  try {
    defaultStorageWorker.start();
    console.log('BullMQ Storage Worker active for S3 uploads.');
  } catch (err: any) {
    console.warn('BullMQ Storage Worker warning:', err.message);
  }

  // 4. Start Performance Logger
  perfLogger.start();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Node Gateway listening directly on 0.0.0.0:${PORT}`);
    console.log('Web UI, REST APIs, and Socket.IO are all accessible via Port 80');
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
