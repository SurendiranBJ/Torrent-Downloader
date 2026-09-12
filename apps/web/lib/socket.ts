import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  if (!socket) {
    const token = localStorage.getItem('token');
    const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

    socket = io(serverUrl, {
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
