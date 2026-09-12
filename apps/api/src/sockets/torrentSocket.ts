import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { TorrentCache } from '../cache/torrentCache';

interface AuthSocket extends Socket {
  userId?: string;
  userEmail?: string;
}

export function setupTorrentSocket(io: SocketIOServer, torrentCache: TorrentCache): void {
  torrentCache.setSocketServer(io);

  // Authentication Middleware for WebSocket handshakes
  io.use((socket: AuthSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
        parseCookieToken(socket.handshake.headers?.cookie);

      if (!token) {
        return next(new Error('Authentication error: Missing token'));
      }

      const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-min-32-chars';
      const decoded = jwt.verify(token, secret) as { userId: string; email: string };
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      next();
    } catch (err: any) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    const userId = socket.userId;
    if (!userId) {
      socket.disconnect();
      return;
    }

    // Join isolated user room
    const userRoom = `user:${userId}`;
    socket.join(userRoom);

    // Immediately send cached torrents belonging to this user
    const userTorrents = torrentCache
      .getAllCached()
      .filter((t) => t.userId === userId);
    socket.emit('torrents-list', userTorrents);

    socket.on('disconnect', () => {
      socket.leave(userRoom);
    });
  });
}

function parseCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith('token=')) {
      return decodeURIComponent(c.substring('token='.length));
    }
  }
  return null;
}
